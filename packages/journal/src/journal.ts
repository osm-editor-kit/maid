import { createOsmEntity, Difference } from '@osm-editor-kit/maid-model'
import type { Context, Edit, EditHistory, Graph, OsmEntityProps } from '@osm-editor-kit/maid-model'
/**
 * The edit journal: the unsaved edits of an editor, kept in IndexedDB so that they survive a reload.
 *
 * One record per committed edit is appended to the `edits` table; undo and redo only move a pointer
 * in `meta`. A record holds the new state of every entity the edit changed, and, the first time an
 * entity is touched, the state it had in `base`, so a restore can merge the base data it needs.
 *
 * The journal reads the history and never changes it. Writes are queued and never block an edit.
 */
import Dexie, { type Table } from 'dexie'

/** The schema of the stores in this file. Bump it, and add a migration, when a record or the meta row changes shape. */
export const SCHEMA_VERSION = 1

/** One entity as plain data: what `OsmEntity#asJSON()` returns, and what `createOsmEntity` takes back. */
export type EntityData = Partial<OsmEntityProps>

/** One entity changed by an edit. */
export interface JournalChange {
  /** The entity id, e.g. `n1` or `n-3` */
  id: EntityID
  /** The state after the edit, or `null` if the edit deleted the entity */
  after: EntityData | null
  /**
   * Only in the first record that touches the entity: its state in `base`, or `null` if it did not
   * exist there (it was created). Absent in later records.
   */
  before?: EntityData | null
}

/** One committed edit. The primary key is `index`. */
export interface EditRecord {
  /** Position in the history: the value of `history.index` right after the commit. 1 for the first edit. */
  index: number
  /** The annotation of the edit ("moved a node"), used for undo and redo menus */
  annotation?: string | Record<string, unknown>
  /** The selection when the edit was committed */
  selectedIDs: EntityID[]
  /** Every entity the edit changed */
  changes: JournalChange[]
  /** Milliseconds since the epoch, when the record was written */
  savedAt: number
}

/** The single row of the `meta` table. */
export interface MetaRow {
  key: 'state'
  /** The record schema, see `SCHEMA_VERSION` */
  schema: number
  /** The history index that was current when this row was written (undo and redo move it) */
  pointer: number
  /** The id counters of the context (`node`, `way`, `v`, ...) at the time of the write */
  sequences: Record<SequenceID, number>
  /** Milliseconds since the epoch */
  updatedAt: number
}

export type JournalOptions = {
  /** Database name. One per editor (fork) and data source, e.g. 'maid:dev-api'. */
  name: string
  context: Context
  history: EditHistory
  /**
   * Called when a write fails (for example when the disk is full). The writes go on, and the error is
   * also kept for `lastError()`. The handler is not allowed to stop the journal: its exceptions are ignored.
   */
  onError?: (error: unknown) => void
}

export type RestoreInfo = {
  /** The number of stored edits, which `restore()` puts back (including the ones the person had undone) */
  edits: number
  /** ms since epoch of the last record */
  savedAt: number
}

/** What is stored, read in one go: see `stored()` */
export type StoredEdits = {
  /** Every stored record in order, the first at index 1 */
  records: EditRecord[]
  /**
   * The history index that was current at the last write. Records above it were undone before the
   * reload: `restore()` puts them back and undoes them again, so the redo part is kept.
   */
  pointer: number
  /** ms since epoch of the last record */
  savedAt: number
}

/** One entity that the stored edits change, as it stands at the pointer: see `changesAt()` */
export interface StoredChange {
  /** The entity id, e.g. `n1` or `n-3` */
  id: EntityID
  /** Its state in the base map, or `null` if the edits created it */
  before: EntityData | null
  /** Its state at the pointer, or `null` if the edits delete it */
  after: EntityData | null
}

export type Journal = {
  /** What is stored and could be restored, or undefined if there is nothing */
  pending(): Promise<RestoreInfo | undefined>
  /**
   * Reads everything that is stored, without changing anything: what the dialog that asks to restore
   * shows before anything is restored. Undefined if nothing is stored, or if what is stored leaves
   * nothing changed at its pointer (every edit undone, or edits that cancel out): nothing to restore.
   */
  stored(): Promise<StoredEdits | undefined>
  /**
   * Puts the stored edits back into the history: the entities they started from are merged in
   * first (they may not be loaded yet), then every edit is performed and committed with its
   * annotation and selection, then undone as far as the person had undone, so undo AND redo
   * work as before the reload. Resolves with the number of edits restored.
   *
   * Needs a history without edits (a fresh one, with or without base data). The replay does not
   * write records: the change listener is off while it runs. Call it before `start()`.
   */
  restore(): Promise<number>
  /**
   * Forgets everything that is stored (after "do not restore", and after a successful upload).
   * Not allowed while the journal runs: call `stop()` first, or reset the history while it runs,
   * which clears the store by itself.
   */
  clear(): Promise<void>
  /**
   * Starts writing: from now on every commit appends one record, undo and redo move a pointer,
   * a commit after an undo drops the records that can no longer be redone. Returns a function that stops.
   * Call it after `restore()` or `clear()`, and before the first edit. Rejects with `JournalLockedError`
   * if another tab of this origin already writes this journal.
   */
  start(): Promise<() => void>
  /** Resolves when everything that happened so far is written. For tests and before unload. */
  flushed(): Promise<void>
  /** The last write error, or undefined if no write has failed */
  lastError(): unknown
}

/** `start()` was refused because another tab of this origin holds the journal's Web Lock. */
export class JournalLockedError extends Error {
  constructor(name: string) {
    super(`The journal "${name}" is open in another tab`)
    this.name = 'JournalLockedError'
  }
}

/**
 * The part of `navigator.locks` that the journal uses. A parameter of `createJournal`, so tests
 * can pass a fake that grants or refuses the lock.
 */
export interface LockProvider {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => unknown,
  ): Promise<unknown>
}

class JournalDB extends Dexie {
  // `declare`: Dexie creates the table properties itself, a class field would overwrite them.
  declare edits: Table<EditRecord, number>
  declare meta: Table<MetaRow, 'state'>

  constructor(name: string) {
    // Read the factory when the database is created, not when Dexie is imported: a module can load
    // before a polyfill that the caller imports (Bun's test runner does this with fake-indexeddb).
    super(name, { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange })
    // Version 1 is the first schema. A later schema adds `this.version(2).stores({...}).upgrade(...)`
    // here, and bumps SCHEMA_VERSION. Dexie runs the upgrade when an old database is opened.
    this.version(1).stores({ edits: 'index', meta: 'key' })
  }
}

/**
 * Creates a journal for one history. Nothing is read or written until a method is called.
 * @param options - the database name, the context and the history to journal
 * @param locks - the lock provider; defaults to `navigator.locks`. Without one (tests, old browsers)
 *   `start()` takes no lock, so two tabs of one origin can both write the same journal.
 */
export function createJournal(options: JournalOptions, locks?: LockProvider): Journal {
  return new ChangeJournal(options, locks ?? defaultLocks())
}

function defaultLocks() {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return undefined
  return navigator.locks
}

/**
 * Takes the journal's lock without waiting. Resolves with the function that gives it back, or with
 * undefined when there is no lock provider. Rejects with `JournalLockedError` when it is taken.
 */
function acquireLock(locks: LockProvider | undefined, name: string) {
  if (!locks) return Promise.resolve(undefined)
  return new Promise<(() => void) | undefined>((resolve, reject) => {
    locks
      .request(name, { ifAvailable: true }, (lock: unknown) => {
        if (!lock) {
          reject(new JournalLockedError(name))
          return undefined
        }
        // The lock is held for as long as this promise is pending, so `release` gives it back.
        return new Promise<void>((release) => resolve(() => release()))
      })
      .catch(reject)
  })
}

/** Puts the edits of a record back into a graph. Entities are replaced whole; a deleted one is removed. */
function replayAction(context: Context, changes: JournalChange[]) {
  return (graph: Graph) => {
    for (const change of changes) {
      if (change.after) {
        graph.replace(createOsmEntity(context, change.after))
      } else {
        const current = graph.hasEntity(change.id)
        if (current) graph.remove(current)
      }
    }
    return graph.commit()
  }
}

/**
 * Whether the history differs from its base, by content as `changesAt` compares: an entity that was
 * changed and changed back does not count. Reads the difference the history keeps (see `difference()`).
 */
function differsFromBase(history: EditHistory) {
  for (const { base, head } of history.difference().changes.values()) {
    const before = base ? base.asJSON() : null
    const after = head ? head.asJSON() : null
    if (before === null && after === null) continue
    if (before !== null && after !== null && contentOf(before) === contentOf(after)) continue
    return true
  }
  return false
}

/**
 * Whether stored edits can be restored: something must be changed at their pointer. An entry that
 * leaves nothing changed (everything undone, or edits that cancel out) is not offered, as in iD.
 */
function restorable(stored: StoredEdits) {
  return changesAt(stored.records, stored.pointer).length > 0
}

function metaRow(pointer: number, sequences: Record<SequenceID, number>) {
  return {
    key: 'state',
    schema: SCHEMA_VERSION,
    pointer,
    sequences,
    updatedAt: Date.now(),
  } satisfies MetaRow
}

function countOf(keys: unknown[]) {
  let count = 0
  for (const key of keys) {
    if (key !== count + 1) break
    count++
  }
  return count
}

/**
 * What the records change compared with the base map, as the state stands at `pointer`: the entities
 * whose state there differs from their base state. An entity that was changed and changed back is
 * left out. Records must be in order (`stored()` gives them so). Ordered by id.
 */
export function changesAt(records: EditRecord[], pointer: number): StoredChange[] {
  // the base state comes from the first record that touched an entity (the only one that stores it)
  const bases = new Map<EntityID, EntityData | null>()
  // the state at the pointer is the one of the last record at or below it
  const afters = new Map<EntityID, EntityData | null>()
  for (const record of records) {
    for (const change of record.changes) {
      if (change.before !== undefined && !bases.has(change.id)) bases.set(change.id, change.before)
      if (record.index <= pointer) afters.set(change.id, change.after)
    }
  }
  const out: StoredChange[] = []
  for (const [id, after] of afters) {
    const before = bases.get(id)
    // no base state was stored for it: nothing to compare with, so it is not listed (the restore still replays it)
    if (before === undefined) continue
    if (before === null && after === null) continue
    if (before !== null && after !== null && contentOf(before) === contentOf(after)) continue
    out.push({ id, before, after })
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The content of an entity as text, without its version: every edit bumps `v`, which is no change
 * of the feature. Keys are sorted, so that equal data gives equal text.
 */
function contentOf(data: EntityData) {
  const content = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'v'))
  return JSON.stringify(content, (_key, item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  })
}

type Running = { off: () => void; release: (() => void) | undefined }

class ChangeJournal implements Journal {
  private readonly options: JournalOptions
  private readonly locks: LockProvider | undefined
  private readonly db: JournalDB
  private readonly lockName: string

  /** Every write runs after the previous one. Never rejects: failures are recorded in `error`. */
  private chain: Promise<void> = Promise.resolve()
  private error: unknown = undefined

  /**
   * The edits as the journal last saw them: `mirror[i]` is the edit at history index `i`.
   * A listener compares the edit at the current index with this to tell a commit from undo or redo.
   */
  private mirror: Edit[] = []
  /** Entities whose base state is stored, and the index of the record that stores it */
  private touched = new Map<EntityID, number>()
  /** Set by `restore()` on this instance. `start()` refuses stored edits that were not restored. */
  private restored = false
  /**
   * True while the store holds the records of the history. False when the history is at its base
   * (the store is cleared then, see `forget()`) and until `rebuild()` writes the records again.
   */
  private saved = false
  /** True while `restore()` replays: the change listener ignores everything */
  private replaying = false
  private running: Running | undefined = undefined

  constructor(options: JournalOptions, locks: LockProvider | undefined) {
    this.options = options
    this.locks = locks
    this.db = new JournalDB(options.name)
    this.lockName = `maid-journal:${options.name}`
  }

  flushed() {
    return this.chain
  }

  lastError() {
    return this.error
  }

  async pending() {
    const stored = await this.stored()
    if (!stored) return undefined
    return { edits: stored.records.length, savedAt: stored.savedAt }
  }

  async stored() {
    await this.flushed()
    const stored = await this.readStored()
    return stored && restorable(stored) ? stored : undefined
  }

  /** Everything in the store, as it is: nothing is judged here. Undefined if the store is empty. */
  private async readStored(): Promise<StoredEdits | undefined> {
    const count = countOf(await this.db.edits.orderBy('index').keys())
    if (count === 0) return undefined
    const meta = await this.readMeta()
    const records = await this.db.edits.where('index').between(1, count, true, true).toArray()
    return {
      records,
      pointer: Math.min(meta?.pointer ?? count, count),
      savedAt: records[count - 1]?.savedAt ?? 0,
    }
  }

  async restore() {
    await this.flushed()
    const { context, history } = this.options
    if (history.history.length !== 1) {
      throw new Error('restore() needs a history without edits: call it before the first edit')
    }

    const stored = await this.readStored()
    this.restored = true
    if (!stored || !restorable(stored)) {
      // nothing is left changed: an entry that is only undone edits or cancelled ones is forgotten
      if (stored) await this.wipe()
      return 0
    }
    const { records, pointer } = stored
    const count = records.length
    const meta = await this.readMeta()

    // The base states come first: the entities the edits started from may not be loaded yet.
    const bases = new Map<EntityID, EntityData>()
    for (const record of records) {
      for (const change of record.changes) {
        if (change.before && !bases.has(change.id)) bases.set(change.id, change.before)
      }
    }
    history.merge([...bases.values()].map((data) => createOsmEntity(context, data)))

    this.replaying = true
    try {
      for (const record of records) {
        history.perform(replayAction(context, record.changes))
        history.commit({ annotation: record.annotation, selectedIDs: record.selectedIDs })
        if (history.index !== record.index) {
          throw new Error(`Journal record ${record.index} landed at index ${history.index}`)
        }
      }
      // The person may have undone some edits before the reload: move back to where they were.
      while (history.index > pointer) history.undo()
    } finally {
      this.replaying = false
    }

    // Never reuse an id that a stored entity has: keep the larger counter.
    const sequences: Record<SequenceID, number> = meta?.sequences ?? {}
    for (const [key, value] of Object.entries(sequences)) {
      context.sequences[key] = Math.max(context.sequences[key] ?? 0, value)
    }

    this.mirror = history.history
    this.touched.clear()
    for (const record of records) {
      for (const change of record.changes) {
        if (change.before !== undefined) this.touched.set(change.id, record.index)
      }
    }
    this.saved = true
    return count
  }

  /** The meta row, refused if it was written by a newer version of this code */
  private async readMeta() {
    const meta = await this.db.meta.get('state')
    if (meta && meta.schema > SCHEMA_VERSION) {
      throw new Error(`The journal has schema ${meta.schema}, this code reads ${SCHEMA_VERSION}`)
    }
    return meta
  }

  clear() {
    if (this.running) {
      return Promise.reject(
        new Error('Stop the journal before clear(), or reset the history while it runs'),
      )
    }
    this.touched.clear()
    this.saved = false
    const done = this.chain.then(() => this.wipe())
    this.chain = done.catch((error: unknown) => {
      this.error = error
    })
    return done
  }

  async start() {
    if (this.running) throw new Error(`The journal "${this.options.name}" is already running`)
    const { context, history } = this.options

    const release = await acquireLock(this.locks, this.lockName)
    try {
      const stored = this.restored ? undefined : await this.readStored()
      if (stored && restorable(stored)) {
        throw new Error(
          `The journal "${this.options.name}" has stored edits that were not restored: call restore() or clear() before start()`,
        )
      }
      // an old entry that leaves nothing changed is not offered, and is forgotten here
      if (stored) await this.wipe()
    } catch (error) {
      release?.()
      throw error
    }

    this.mirror = history.history
    const pointer = history.index
    const sequences = { ...context.sequences }
    this.enqueue(() => this.putMeta(pointer, sequences))

    const off = history.on('stablechange', this.onStableChange)
    this.running = { off, release }
    return () => this.stop()
  }

  private stop() {
    const running = this.running
    if (!running) return
    this.running = undefined
    running.off()
    running.release?.()
  }

  /** Runs for every change of the stable edit: a commit, an undo, a redo, or a reset of the history. */
  private readonly onStableChange = (difference: Difference) => {
    if (this.replaying) return
    const { context, history } = this.options
    const index = history.index
    const edit = history.stable

    // Undo or redo: the edit at this index is one the journal already has. Only the pointer moves.
    if (this.mirror[index] === edit) {
      if (!differsFromBase(history)) return this.forget()
      if (!this.saved) return this.rebuild()
      const sequences = { ...context.sequences }
      this.enqueue(() => this.putMeta(index, sequences))
      return
    }

    // A reset of the history starts a new base: what is stored belongs to an older session.
    if (index === 0) {
      this.mirror = [edit]
      return this.forget()
    }

    // A commit. It replaces the edit at `index`, and drops the redo part above it. The entities that
    // those dropped records touched lose their stored base state, so the next record stores it again.
    if (index < this.mirror.length) {
      for (const [id, recordIndex] of this.touched) {
        if (recordIndex >= index) this.touched.delete(id)
      }
    }
    this.mirror.length = index
    this.mirror.push(edit)

    if (!differsFromBase(history)) return this.forget()
    if (!this.saved) return this.rebuild()

    const base = history.base.graph
    const changes: JournalChange[] = []
    for (const [id, change] of difference.changes) {
      const entry: JournalChange = { id, after: change.head ? change.head.asJSON() : null }
      if (!this.touched.has(id)) {
        const original = base.hasEntity(id)
        entry.before = original ? original.asJSON() : null
        this.touched.set(id, index)
      }
      changes.push(entry)
    }

    const record: EditRecord = {
      index,
      annotation: edit.annotation,
      selectedIDs: edit.selectedIDs ?? [],
      changes,
      savedAt: Date.now(),
    }
    const sequences = { ...context.sequences }
    this.enqueue(() => this.putCommit(record, sequences))
  }

  /**
   * The history is at its base, or its edits cancel out: nothing is left to restore, so the stored
   * records go. The edits stay in the history, and the next change that differs from the base
   * writes them again (`rebuild()`), so redo and undo keep working.
   */
  private forget() {
    this.touched.clear()
    if (this.saved) this.enqueue(() => this.wipe())
    this.saved = false
  }

  /**
   * Writes every edit of the history, from the base, in one transaction. Used when the store was
   * forgotten and the history differs from its base again. Records above the pointer (redo) are kept.
   */
  private rebuild() {
    const { context, history } = this.options
    const base = history.base.graph
    const edits = this.mirror
    const records: EditRecord[] = []
    const touched = new Map<EntityID, number>()
    const savedAt = Date.now()
    for (let index = 1; index < edits.length; index++) {
      const previous = edits[index - 1]
      const current = edits[index]
      if (!previous || !current) continue
      const changes: JournalChange[] = []
      for (const [id, change] of new Difference(previous.graph, current.graph).changes) {
        const entry: JournalChange = { id, after: change.head ? change.head.asJSON() : null }
        if (!touched.has(id)) {
          const original = base.hasEntity(id)
          entry.before = original ? original.asJSON() : null
          touched.set(id, index)
        }
        changes.push(entry)
      }
      records.push({
        index,
        annotation: current.annotation,
        selectedIDs: current.selectedIDs ?? [],
        changes,
        savedAt,
      })
    }
    this.touched = touched
    this.saved = records.length > 0
    const pointer = history.index
    const sequences = { ...context.sequences }
    this.enqueue(() => this.putAll(records, pointer, sequences))
  }

  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(task).catch((error: unknown) => {
      this.error = error
      try {
        this.options.onError?.(error)
      } catch {
        // A failing handler must not stop the writes that come after it.
      }
    })
  }

  private async putCommit(record: EditRecord, sequences: Record<SequenceID, number>) {
    await this.db.transaction('rw', this.db.edits, this.db.meta, async () => {
      // A commit at `index` ends the redo part of the history above it.
      await this.db.edits.where('index').above(record.index).delete()
      await this.db.edits.put(record)
      await this.db.meta.put(metaRow(record.index, sequences))
    })
  }

  private async putAll(
    records: EditRecord[],
    pointer: number,
    sequences: Record<SequenceID, number>,
  ) {
    await this.db.transaction('rw', this.db.edits, this.db.meta, async () => {
      await this.db.edits.clear()
      await this.db.edits.bulkPut(records)
      await this.db.meta.put(metaRow(pointer, sequences))
    })
  }

  private async putMeta(pointer: number, sequences: Record<SequenceID, number>) {
    await this.db.meta.put(metaRow(pointer, sequences))
  }

  private async wipe() {
    await this.db.transaction('rw', this.db.edits, this.db.meta, async () => {
      await this.db.edits.clear()
      await this.db.meta.clear()
    })
  }
}
