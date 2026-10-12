import { createOsmEntity } from '@osm-editor-kit/maid-model'
import type {
  Action,
  Context,
  Difference,
  Edit,
  EditHistory,
  Graph,
  OsmEntityProps,
} from '@osm-editor-kit/maid-model'
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

export type Journal = {
  /** What is stored and could be restored, or undefined if there is nothing */
  pending(): Promise<RestoreInfo | undefined>
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

function defaultLocks(): LockProvider | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return undefined
  return navigator.locks
}

/**
 * Takes the journal's lock without waiting. Resolves with the function that gives it back, or with
 * undefined when there is no lock provider. Rejects with `JournalLockedError` when it is taken.
 */
function acquireLock(
  locks: LockProvider | undefined,
  name: string,
): Promise<(() => void) | undefined> {
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
function replayAction(context: Context, changes: JournalChange[]): Action {
  return (graph: Graph): Graph => {
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

function metaRow(pointer: number, sequences: Record<SequenceID, number>): MetaRow {
  return { key: 'state', schema: SCHEMA_VERSION, pointer, sequences, updatedAt: Date.now() }
}

function countOf(keys: unknown[]): number {
  let count = 0
  for (const key of keys) {
    if (key !== count + 1) break
    count++
  }
  return count
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
  /** True while `restore()` replays: the change listener ignores everything */
  private replaying = false
  private running: Running | undefined = undefined

  constructor(options: JournalOptions, locks: LockProvider | undefined) {
    this.options = options
    this.locks = locks
    this.db = new JournalDB(options.name)
    this.lockName = `maid-journal:${options.name}`
  }

  flushed(): Promise<void> {
    return this.chain
  }

  lastError(): unknown {
    return this.error
  }

  async pending(): Promise<RestoreInfo | undefined> {
    await this.flushed()
    const keys = await this.db.edits.orderBy('index').keys()
    const edits = countOf(keys)
    if (edits === 0) return undefined
    const last = await this.db.edits.get(edits)
    return { edits, savedAt: last?.savedAt ?? 0 }
  }

  async restore(): Promise<number> {
    await this.flushed()
    const { context, history } = this.options
    if (history.history.length !== 1) {
      throw new Error('restore() needs a history without edits: call it before the first edit')
    }

    const keys = await this.db.edits.orderBy('index').keys()
    const count = countOf(keys)
    const meta = await this.db.meta.get('state')
    if (meta && meta.schema > SCHEMA_VERSION) {
      throw new Error(`The journal has schema ${meta.schema}, this code reads ${SCHEMA_VERSION}`)
    }
    this.restored = true
    if (count === 0) return 0

    const records = await this.db.edits.where('index').between(1, count, true, true).toArray()

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
      const pointer = Math.min(meta?.pointer ?? count, count)
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
    return count
  }

  clear(): Promise<void> {
    if (this.running) {
      return Promise.reject(
        new Error('Stop the journal before clear(), or reset the history while it runs'),
      )
    }
    this.touched.clear()
    const done = this.chain.then(() => this.wipe())
    this.chain = done.catch((error: unknown) => {
      this.error = error
    })
    return done
  }

  async start(): Promise<() => void> {
    if (this.running) throw new Error(`The journal "${this.options.name}" is already running`)
    const { context, history } = this.options

    const release = await acquireLock(this.locks, this.lockName)
    try {
      if (!this.restored && (await this.db.edits.count()) > 0) {
        throw new Error(
          `The journal "${this.options.name}" has stored edits that were not restored: call restore() or clear() before start()`,
        )
      }
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

  private stop(): void {
    const running = this.running
    if (!running) return
    this.running = undefined
    running.off()
    running.release?.()
  }

  /** Runs for every change of the stable edit: a commit, an undo, a redo, or a reset of the history. */
  private readonly onStableChange = (difference: Difference): void => {
    if (this.replaying) return
    const { context, history } = this.options
    const index = history.index
    const edit = history.stable

    // Undo or redo: the edit at this index is one the journal already has. Only the pointer moves.
    if (this.mirror[index] === edit) {
      const sequences = { ...context.sequences }
      this.enqueue(() => this.putMeta(index, sequences))
      return
    }

    // A reset of the history starts a new base: what is stored belongs to an older session.
    if (index === 0) {
      this.mirror = [edit]
      this.touched.clear()
      this.enqueue(() => this.wipe())
      return
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

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((error: unknown) => {
      this.error = error
      try {
        this.options.onError?.(error)
      } catch {
        // A failing handler must not stop the writes that come after it.
      }
    })
  }

  private async putCommit(
    record: EditRecord,
    sequences: Record<SequenceID, number>,
  ): Promise<void> {
    await this.db.transaction('rw', this.db.edits, this.db.meta, async () => {
      // A commit at `index` ends the redo part of the history above it.
      await this.db.edits.where('index').above(record.index).delete()
      await this.db.edits.put(record)
      await this.db.meta.put(metaRow(record.index, sequences))
    })
  }

  private async putMeta(pointer: number, sequences: Record<SequenceID, number>): Promise<void> {
    await this.db.meta.put(metaRow(pointer, sequences))
  }

  private async wipe(): Promise<void> {
    await this.db.transaction('rw', this.db.edits, this.db.meta, async () => {
      await this.db.edits.clear()
      await this.db.meta.clear()
    })
  }
}
