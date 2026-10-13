import 'fake-indexeddb/auto'
import { describe, expect, it } from 'bun:test'
import {
  EditHistory,
  ModelContext,
  OsmNode,
  OsmWay,
  actionAddEntity,
  actionChangeTags,
  actionDeleteNode,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { EditRecord } from './journal.ts'
import { JournalLockedError, changesAt, createJournal } from './journal.ts'
import type { LockProvider } from './journal.ts'

// A lock provider that always grants the lock, the way navigator.locks does when the lock is free.
const freeLocks: LockProvider = {
  request: (_name, _options, callback) => Promise.resolve(callback({})),
}
// A lock provider that says the lock is taken: `ifAvailable` gives `null` to the callback.
const takenLocks: LockProvider = {
  request: (_name, _options, callback) => Promise.resolve(callback(null)),
}

let counter = 0
/** A database name no other test uses, so each test starts from an empty store. */
function nextName(): string {
  counter++
  return `test-journal-${counter}-${Date.now()}`
}

/** Three nodes and a way over the first two, the base data every test starts from. */
function baseEntities(context: ModelContext): OsmEntity[] {
  return [
    new OsmNode(context, { id: 'n1', loc: [13.0, 52.0] }),
    new OsmNode(context, { id: 'n2', loc: [13.5, 52.25] }),
    new OsmNode(context, { id: 'n3', loc: [13.25, 52.1] }),
    new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } }),
  ]
}

/** A fresh context and history, with the base data merged in unless `merge` is false. */
function freshHistory(merge = true): { context: ModelContext; history: EditHistory } {
  const context = new ModelContext()
  const history = new EditHistory(context)
  if (merge) history.merge(baseEntities(context))
  return { context, history }
}

/** Move a node, change a tag, add a node. Returns the id of the added node. */
function commitThree(context: ModelContext, history: EditHistory): string {
  history.perform(actionMoveNode('n1', [13.1, 52.05]))
  history.commit({ annotation: 'moved a node', selectedIDs: ['n1'] })
  history.perform(actionChangeTags('w1', { highway: 'primary', name: 'Main Street' }))
  history.commit({ annotation: 'changed a tag', selectedIDs: ['w1'] })
  const node = new OsmNode(context, { loc: [13.25, 52.2], tags: { amenity: 'bench' } })
  history.perform(actionAddEntity(node))
  history.commit({ annotation: 'added a node', selectedIDs: [node.id] })
  return node.id
}

/** The data of the given entities in a graph, `null` where there is none. Comparable with `toEqual`. */
function contents(graph: Graph, ids: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const id of ids) out[id] = graph.hasEntity(id)?.asJSON() ?? null
  return out
}

describe('journal', () => {
  it('restores three commits: state, index, undo annotation, and the id counters', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    const newID = commitThree(first.context, first.history)
    await journal1.flushed()
    stop1()

    const second = freshHistory()
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    expect((await journal2.pending())?.edits).toBe(3)
    expect(await journal2.restore()).toBe(3)

    const ids = ['n1', 'n2', 'n3', 'w1', newID]
    expect(second.history.index).toBe(3)
    expect(second.history.getUndoAnnotation()).toBe('added a node')
    expect(contents(second.history.staging.graph!, ids)).toEqual(
      contents(first.history.staging.graph!, ids),
    )
    expect(contents(second.history.stable.graph!, ids)).toEqual(
      contents(first.history.stable.graph!, ids),
    )

    // A node created after the restore gets a new id, not the one of a stored node.
    const created = new OsmNode(second.context, { loc: [13.4, 52.4] })
    expect(created.id).not.toBe(newID)
  })

  it('restores the state before an undo, and redo brings the last edit back', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    const newID = commitThree(first.context, first.history)
    first.history.undo()
    await journal1.flushed()
    stop1()

    const second = freshHistory()
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    expect(await journal2.restore()).toBe(3)
    expect(second.history.index).toBe(2)
    expect(second.history.stable.graph!.hasEntity(newID)).toBeUndefined()
    expect(contents(second.history.stable.graph!, ['n1', 'w1'])).toEqual(
      contents(first.history.stable.graph!, ['n1', 'w1']),
    )

    second.history.redo()
    expect(second.history.index).toBe(3)
    expect(second.history.stable.graph!.hasEntity(newID)).toBeDefined()
    expect(second.history.getUndoAnnotation()).toBe('added a node')
  })

  it('drops the redo records when a commit follows an undo', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    const newID = commitThree(first.context, first.history)
    first.history.undo()
    first.history.undo()
    first.history.perform(actionChangeTags('w1', { highway: 'secondary' }))
    first.history.commit({ annotation: 'changed the tag again', selectedIDs: ['w1'] })
    await journal1.flushed()
    stop1()

    const second = freshHistory()
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    expect((await journal2.pending())?.edits).toBe(2)
    expect(await journal2.restore()).toBe(2)
    expect(second.history.index).toBe(2)
    expect(second.history.getRedoAnnotation()).toBeUndefined()
    expect(second.history.getUndoAnnotation()).toBe('changed the tag again')
    expect(second.history.stable.graph!.hasEntity(newID)).toBeUndefined()
    expect(second.history.stable.graph!.hasEntity('w1')?.tags).toEqual({ highway: 'secondary' })
  })

  it('restores when the base entities are not loaded in the new history', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    commitThree(first.context, first.history)
    await journal1.flushed()
    stop1()

    const second = freshHistory(false)
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    expect(await journal2.restore()).toBe(3)
    expect(second.history.base.graph!.hasEntity('n1')).toBeDefined()
    expect(contents(second.history.stable.graph!, ['n1', 'w1'])).toEqual(
      contents(first.history.stable.graph!, ['n1', 'w1']),
    )
  })

  it('round-trips a deleted entity', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    first.history.perform(actionDeleteNode('n3'))
    first.history.commit({ annotation: 'deleted a node', selectedIDs: [] })
    await journal1.flushed()
    stop1()

    const second = freshHistory()
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    expect(await journal2.restore()).toBe(1)
    expect(second.history.stable.graph!.hasEntity('n3')).toBeUndefined()
    expect(second.history.base.graph!.hasEntity('n3')).toBeDefined()
    expect(second.history.getUndoAnnotation()).toBe('deleted a node')
  })

  it('forgets everything on clear(), and another name sees nothing', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    commitThree(first.context, first.history)
    await journal1.flushed()
    stop1()

    const other = freshHistory()
    const journalOther = createJournal({
      name: `${name}-other`,
      context: other.context,
      history: other.history,
    })
    expect(await journalOther.pending()).toBeUndefined()

    expect((await journal1.pending())?.edits).toBe(3)
    await journal1.clear()
    expect(await journal1.pending()).toBeUndefined()
  })

  it('refuses to start while another tab holds the lock', async () => {
    const { context, history } = freshHistory()
    const journal = createJournal({ name: nextName(), context, history }, takenLocks)
    const error = await journal.start().then(
      () => undefined,
      (failure: unknown) => failure,
    )
    expect(error).toBeInstanceOf(JournalLockedError)
  })

  it('writes 500 commits, and the last 50 cost about what the first 50 cost', async () => {
    const name = nextName()
    const { context, history } = freshHistory()
    const journal = createJournal({ name, context, history }, freeLocks)
    const stop = await journal.start()

    const batchSize = 50
    const batches = 10
    const times: number[] = []
    let step = 0
    for (let batch = 0; batch < batches; batch++) {
      const started = performance.now()
      for (let i = 0; i < batchSize; i++, step++) {
        history.perform(actionMoveNode('n1', [13 + step * 1e-5, 52 + step * 1e-6]))
        history.commit({ annotation: 'moved a node', selectedIDs: ['n1'] })
      }
      await journal.flushed()
      times.push(performance.now() - started)
    }
    stop()

    const first = times[0] ?? 0
    const last = times[batches - 1] ?? 0
    console.log(
      `journal: first 50 commits ${first.toFixed(1)} ms, last 50 commits ${last.toFixed(1)} ms`,
    )
    expect((await journal.pending())?.edits).toBe(batchSize * batches)
    expect(journal.lastError()).toBeUndefined()
    // Loose bound: an edit costs the same late in a session. The slack absorbs garbage collection pauses.
    expect(last).toBeLessThan(first * 3 + 50)
  })
})

describe('stored edits', () => {
  it('reads every record and the pointer, without restoring', async () => {
    const name = nextName()
    const first = freshHistory()
    const journal1 = createJournal(
      { name, context: first.context, history: first.history },
      freeLocks,
    )
    const stop1 = await journal1.start()
    const newID = commitThree(first.context, first.history)
    first.history.undo()
    await journal1.flushed()
    stop1()

    const second = freshHistory()
    const journal2 = createJournal(
      { name, context: second.context, history: second.history },
      freeLocks,
    )
    const stored = await journal2.stored()
    expect(stored?.records.map((record) => record.index)).toEqual([1, 2, 3])
    expect(stored?.pointer).toBe(2)
    expect(stored?.savedAt).toBe(stored?.records[2]?.savedAt ?? -1)
    // reading changes nothing: the history is still empty and restore() still works
    expect(second.history.index).toBe(0)
    expect(await journal2.restore()).toBe(3)
    expect(second.history.stable.graph!.hasEntity(newID)).toBeUndefined()
  })

  it('is undefined when nothing is stored', async () => {
    const { context, history } = freshHistory()
    const journal = createJournal({ name: nextName(), context, history }, freeLocks)
    expect(await journal.stored()).toBeUndefined()
  })
})

describe('changesAt', () => {
  /** The records of what `make` commits, read back from a journal that wrote them */
  async function recordsOf(
    make: (context: ModelContext, history: EditHistory) => void,
  ): Promise<{ records: EditRecord[]; pointer: number }> {
    const name = nextName()
    const { context, history } = freshHistory()
    const journal = createJournal({ name, context, history }, freeLocks)
    const stop = await journal.start()
    make(context, history)
    await journal.flushed()
    stop()
    const stored = await journal.stored()
    if (!stored) throw new Error('nothing stored')
    return stored
  }

  it('lists what was created and changed, and leaves out what the pointer undid', async () => {
    let newID = ''
    const { records, pointer } = await recordsOf((context, history) => {
      newID = commitThree(context, history)
    })
    const all = changesAt(records, pointer)
    expect(all.map((change) => change.id).sort()).toEqual(['n1', newID, 'w1'].sort())

    const created = all.find((change) => change.id === newID)
    expect(created?.before).toBeNull()
    expect(created?.after?.tags).toEqual({ amenity: 'bench' })

    const moved = all.find((change) => change.id === 'n1')
    expect(moved?.before?.loc).toEqual([13.0, 52.0])
    expect(moved?.after?.loc).toEqual([13.1, 52.05])

    // two edits back: the node the last edit added is not part of the state any more
    expect(changesAt(records, 2).map((change) => change.id)).not.toContain(newID)
    // nothing done: nothing changed
    expect(changesAt(records, 0)).toEqual([])
  })

  it('reports a deleted entity with its base state', async () => {
    const { records, pointer } = await recordsOf((_context, history) => {
      history.perform(actionDeleteNode('n3'))
      history.commit({ annotation: 'deleted a node', selectedIDs: [] })
    })
    const [deleted] = changesAt(records, pointer)
    expect(deleted?.id).toBe('n3')
    expect(deleted?.after).toBeNull()
    expect(deleted?.before?.loc).toEqual([13.25, 52.1])
  })

  it('leaves out an entity that was changed and changed back', async () => {
    const { records, pointer } = await recordsOf((_context, history) => {
      history.perform(actionMoveNode('n1', [13.1, 52.05]))
      history.commit({ annotation: 'moved a node', selectedIDs: ['n1'] })
      history.perform(actionMoveNode('n1', [13.0, 52.0]))
      history.commit({ annotation: 'moved it back', selectedIDs: ['n1'] })
    })
    expect(changesAt(records, pointer)).toEqual([])
  })

  it('compares tags regardless of their order', async () => {
    const { records, pointer } = await recordsOf((_context, history) => {
      history.perform(actionChangeTags('w1', { highway: 'primary', name: 'Main' }))
      history.commit({ annotation: 'tagged', selectedIDs: ['w1'] })
      history.perform(actionChangeTags('w1', { highway: 'residential' }))
      history.commit({ annotation: 'tagged back', selectedIDs: ['w1'] })
    })
    expect(changesAt(records, pointer)).toEqual([])
  })
})
