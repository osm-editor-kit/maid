import { describe, expect, test } from 'bun:test'
import { EditHistory, ModelContext, OsmNode, type OsmTags } from '@osm-editor-kit/maid-model'
import { planChangeTags } from './change-tags'

// Nodes with tags, merged into a history as the engine's data is. No map, no engine.
function historyWith(tagsOf: Record<string, OsmTags>) {
  const context = new ModelContext()
  const history = new EditHistory(context)
  history.merge(
    Object.entries(tagsOf).map(
      ([id, tags], i) => new OsmNode(context, { id, loc: [13 + i * 0.001, 52], tags }),
    ),
  )
  return history
}

const none = () => false

/** The engine's sequence for one change: plan, perform the actions, commit, as `changeTags` does */
function applyChange(
  history: EditHistory,
  ids: string[],
  change: Parameters<typeof planChangeTags>[2],
  isReadOnly: (id: string) => boolean = none,
) {
  const plan = planChangeTags(history.staging.graph, ids, change, isReadOnly)
  if (plan.ok && plan.changed > 0) {
    history.perform(...plan.actions)
    history.commit({ annotation: 'Changed tags', selectedIDs: ids })
  }
  return plan
}

const tagsOf = (history: EditHistory, id: string) => history.stable.graph.entity(id).tags

describe('planChangeTags', () => {
  test('set on three features, one of which has the value: two change, one undo step', () => {
    const history = historyWith({
      n1: { amenity: 'bench' },
      n2: { amenity: 'bench', colour: 'red' },
      n3: { amenity: 'bench', colour: 'green' },
    })
    const plan = applyChange(history, ['n1', 'n2', 'n3'], { set: { colour: 'red' } })

    expect(plan).toMatchObject({ ok: true, changed: 2 })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench', colour: 'red' })
    expect(tagsOf(history, 'n2')).toEqual({ amenity: 'bench', colour: 'red' })
    // set writes to every selected feature: n3 changes from green to red, n2 already had red
    expect(tagsOf(history, 'n3')).toEqual({ amenity: 'bench', colour: 'red' })
    expect(history.getUndoAnnotation()).toBe('Changed tags')
  })

  test('set on three features writes the value to all of them, in one commit', () => {
    const history = historyWith({ n1: {}, n2: {}, n3: {} })
    const before = history.stable.graph
    applyChange(history, ['n1', 'n2', 'n3'], { set: { surface: 'paved' } })
    expect(tagsOf(history, 'n3')).toEqual({ surface: 'paved' })
    history.undo()
    expect(history.stable.graph).toBe(before)
  })

  test('remove deletes the key only where some features have it', () => {
    const history = historyWith({
      n1: { note: 'a', amenity: 'bench' },
      n2: { amenity: 'bench' },
      n3: { note: 'b' },
    })
    const plan = applyChange(history, ['n1', 'n2', 'n3'], { remove: ['note'] })

    expect(plan).toMatchObject({ ok: true, changed: 2 })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench' })
    expect(tagsOf(history, 'n2')).toEqual({ amenity: 'bench' })
    expect(tagsOf(history, 'n3')).toEqual({})
  })

  test('a read-only feature among them refuses, and nothing is written', () => {
    const history = historyWith({ n1: {}, n2: {}, n3: {} })
    const before = history.stable.graph
    const plan = applyChange(history, ['n1', 'n2', 'n3'], { set: { a: 'b' } }, (id) => id === 'n2')

    expect(plan).toEqual({ ok: false, reason: 'read-only', readOnly: 1, of: 3 })
    expect(history.stable.graph).toBe(before)
    expect(history.hasChanges()).toBe(false)
  })

  test('two read-only features are counted', () => {
    const history = historyWith({ n1: {}, n2: {} })
    const plan = planChangeTags(
      history.staging.graph,
      ['n1', 'n2'],
      { set: { a: 'b' } },
      () => true,
    )
    expect(plan).toEqual({ ok: false, reason: 'read-only', readOnly: 2, of: 2 })
  })

  test('an unknown id refuses, and nothing is written', () => {
    const history = historyWith({ n1: {} })
    const before = history.stable.graph
    const plan = applyChange(history, ['n1', 'n99'], { set: { a: 'b' } })

    expect(plan).toEqual({ ok: false, reason: 'missing' })
    expect(history.stable.graph).toBe(before)
  })

  test('nothing to do gives no actions and no undo step', () => {
    const history = historyWith({ n1: { a: 'b' }, n2: { a: 'b' } })
    const before = history.stable.graph
    const plan = applyChange(history, ['n1', 'n2'], { set: { a: 'b' }, remove: ['missing'] })

    expect(plan).toEqual({ ok: true, changed: 0, actions: [] })
    expect(history.stable.graph).toBe(before)
    expect(history.hasChanges()).toBe(false)
  })

  test('an empty set value is dropped: a blank never clears a key', () => {
    const history = historyWith({ n1: { a: 'b' }, n2: { a: 'x' } })
    const plan = applyChange(history, ['n1', 'n2'], { set: { a: '' } })

    expect(plan).toEqual({ ok: true, changed: 0, actions: [] })
    expect(tagsOf(history, 'n1')).toEqual({ a: 'b' })
    expect(tagsOf(history, 'n2')).toEqual({ a: 'x' })
  })

  test('an empty key is dropped, and a removal needs remove', () => {
    const history = historyWith({ n1: { '': 'x', a: 'b' } })
    const plan = applyChange(history, ['n1'], { set: { '': 'y' }, remove: [''] })
    expect(plan).toEqual({ ok: true, changed: 0, actions: [] })
  })

  test('undo restores all changed features at once', () => {
    const history = historyWith({
      n1: { amenity: 'bench' },
      n2: { amenity: 'bench', note: 'x' },
      n3: { amenity: 'bench', colour: 'red' },
    })
    const before = {
      n1: tagsOf(history, 'n1'),
      n2: tagsOf(history, 'n2'),
      n3: tagsOf(history, 'n3'),
    }

    applyChange(history, ['n1', 'n2', 'n3'], { set: { colour: 'blue' }, remove: ['note'] })
    expect(tagsOf(history, 'n1')).toEqual({ amenity: 'bench', colour: 'blue' })
    expect(tagsOf(history, 'n2')).toEqual({ amenity: 'bench', colour: 'blue' })
    expect(tagsOf(history, 'n3')).toEqual({ amenity: 'bench', colour: 'blue' })

    history.undo()
    expect(tagsOf(history, 'n1')).toEqual(before.n1)
    expect(tagsOf(history, 'n2')).toEqual(before.n2)
    expect(tagsOf(history, 'n3')).toEqual(before.n3)
    expect(history.hasChanges()).toBe(false)

    history.redo()
    expect(tagsOf(history, 'n2')).toEqual({ amenity: 'bench', colour: 'blue' })
  })

  test('a duplicate id changes the feature once', () => {
    const history = historyWith({ n1: {} })
    const plan = applyChange(history, ['n1', 'n1'], { set: { a: 'b' } })
    expect(plan).toMatchObject({ ok: true, changed: 1 })
    expect(tagsOf(history, 'n1')).toEqual({ a: 'b' })
  })
})
