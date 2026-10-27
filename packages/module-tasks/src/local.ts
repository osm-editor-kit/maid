/**
 * What this browser keeps of a list: the statuses and revisions in the module storage (`maid:tasks:<listKey>`, a small
 * text), and the file itself in IndexedDB so a reload finds the list again. Under automation (`isAutomated`) neither is
 * read or written: `moduleStorage()` is empty then, and the cache is off.
 */
import { isAutomated, type ModuleStorage } from '@osm-editor-kit/maid-core'
import { decodeStatuses, encodeStatuses, type TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import Dexie, { type Table } from 'dexie'
import type { SavedProgress } from './store.ts'

/** The storage key of a list's progress */
export function mirrorKey(listKey: string): string {
  return `maid:tasks:${listKey}`
}

/** The storage key that names the list to open again after a reload */
export const LAST_LIST_KEY = 'maid:tasks-last'

type MirrorText = { v: 1; s: string; l: number; a: number; h: string }

/**
 * Writes the progress of a list: the statuses encoded as for the account, the revisions and the order hash.
 * `stillCurrent` is asked after the encoding; when it says no, nothing is written.
 */
export async function writeMirror(
  storage: ModuleStorage,
  listKey: string,
  orderHash: string,
  progress: SavedProgress,
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  const text: MirrorText = {
    v: 1,
    s: await encodeStatuses(progress.statuses),
    l: progress.localRevision,
    a: progress.ackedRevision,
    h: orderHash,
  }
  // encoding is async: a newer write may have started meanwhile, and the older one must not land after it
  if (!stillCurrent()) return
  storage.setItem(mirrorKey(listKey), JSON.stringify(text))
}

/**
 * Reads the progress of a list. Undefined when there is none, when it is for another order of tasks (the file changed:
 * `orderHash` differs) or when it does not decode. `count` is the number of tasks of the file.
 */
export async function readMirror(
  storage: ModuleStorage,
  listKey: string,
  orderHash: string,
  count: number,
): Promise<SavedProgress | undefined> {
  const raw = storage.getItem(mirrorKey(listKey))
  if (raw === null) return undefined
  try {
    const text = JSON.parse(raw) as Partial<MirrorText>
    if (
      text.v !== 1 ||
      text.h !== orderHash ||
      typeof text.s !== 'string' ||
      typeof text.l !== 'number' ||
      typeof text.a !== 'number'
    )
      return undefined
    const statuses: TaskStatus[] = await decodeStatuses(text.s, count)
    return { statuses, localRevision: text.l, ackedRevision: text.a }
  } catch {
    return undefined
  }
}

/** A file kept for the next visit */
export type CachedFile = {
  listKey: string
  title: string
  fileName: string
  text: string
  savedAt: number
}

/** The files this browser keeps, by list key */
export type FileCache = {
  save: (file: CachedFile) => Promise<void>
  load: (listKey: string) => Promise<CachedFile | undefined>
  remove: (listKey: string) => Promise<void>
}

class TasksDB extends Dexie {
  // `declare`: Dexie creates the table property itself
  declare files: Table<CachedFile, string>

  constructor(name: string) {
    // the factory is read when the database is made, not when Dexie loads (tests set it up first)
    super(name, { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange })
    this.version(1).stores({ files: 'listKey' })
  }
}

const OFF: FileCache = {
  save: async () => {},
  load: async () => undefined,
  remove: async () => {},
}

/**
 * The IndexedDB cache of the loaded files, one row per list. A failure (private window, blocked storage) is a miss,
 * never an error: the list then lives only for this visit. Off under automation unless `enabled` says otherwise.
 */
export function createFileCache(name = 'maid-tasks', enabled = !isAutomated()): FileCache {
  if (!enabled) return OFF
  let db: TasksDB | undefined
  const open = () => (db ??= new TasksDB(name))
  return {
    async save(file) {
      try {
        await open().files.put(file)
      } catch {
        // the list stays for this visit only
      }
    },
    async load(listKey) {
      try {
        return await open().files.get(listKey)
      } catch {
        return undefined
      }
    },
    async remove(listKey) {
      try {
        await open().files.delete(listKey)
      } catch {
        // nothing to remove
      }
    },
  }
}
