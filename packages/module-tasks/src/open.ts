/**
 * Opening a task file: parse, find the progress this browser kept, fill the store, remember the file for the next
 * visit. No network here: the text comes from a file picker, the cache or `editor.fetch` (url.ts).
 */
import type { ModuleStorage } from '@osm-editor-kit/maid-core'
import { orderHash, parseTaskFileText, type TaskFile } from '@osm-editor-kit/maid-tasks'
import { type FileCache, LAST_LIST_KEY, mirrorKey, readMirror } from './local.ts'
import { listKeyOf, type TaskStatus } from './progress-codec.ts'
import type { SavedProgress, TasksStore } from './store.ts'

export type OpenDeps = {
  store: TasksStore
  storage: ModuleStorage
  cache: FileCache
  now?: () => number
  /** Told when a new version of a list took over statuses of the version before (`carryOver`) */
  onCarried?: (carried: { count: number; title: string }) => void
}

/**
 * The statuses of the version of this list this browser had before, matched by `task_id`, for a file whose tasks
 * changed (another order hash): a regenerated list keeps what was done, ignored or skipped, and new tasks start open
 * (Tobias, 2026-11-26). Undefined when there is no earlier version with progress, or nothing to take over.
 */
export async function carryOver(
  deps: Pick<OpenDeps, 'storage' | 'cache'>,
  listKey: string,
  file: TaskFile,
  hash: string,
): Promise<{ progress: SavedProgress; count: number } | undefined> {
  const cached = await deps.cache.load(listKey)
  if (!cached) return undefined
  const before = parseTaskFileText(cached.text)
  if (!before.ok) return undefined
  const beforeHash = orderHash(before.file)
  if (beforeHash === hash) return undefined
  const saved = await readMirror(deps.storage, listKey, beforeHash, before.file.features.length)
  if (!saved) return undefined
  const byId = new Map<string, TaskStatus>()
  before.file.features.forEach((task, index) => {
    const status = saved.statuses[index]
    if (status && status !== 'open') byId.set(task.properties.task_id, status)
  })
  const statuses = file.features.map((task) => byId.get(task.properties.task_id) ?? 'open')
  const count = statuses.filter((status) => status !== 'open').length
  if (count === 0) return undefined
  return { progress: { statuses }, count }
}

/**
 * Opens the text of a task file. A file with errors fills `error` (the first errors, at most 100 with a count of the
 * rest) and leaves the open list alone. Returns whether the list is open.
 */
export async function openTaskText(
  deps: OpenDeps,
  text: string,
  fileName: string,
  /** `request`: the number `start` gave; when a newer file started meanwhile, this one is not opened */
  options: { sourceUrl?: string; remember?: boolean; request?: number } = {},
): Promise<boolean> {
  const { store, storage, cache } = deps
  const stale = () => options.request !== undefined && store.getState().request !== options.request
  if (stale()) return false
  const result = parseTaskFileText(text)
  if (!result.ok) {
    store.getState().actions.fail({ fileName, errors: result.errors, omitted: result.omitted })
    return false
  }
  const { file } = result
  const hash = orderHash(file)
  const listKey = listKeyOf(file.maid_tasks.list_id)
  const mirrored = await readMirror(storage, listKey, hash, file.features.length)
  // another version of the list: the statuses of the one before, by task id, before its file is replaced below
  const carried = mirrored ? undefined : await carryOver(deps, listKey, file, hash)
  if (stale()) return false
  store
    .getState()
    .actions.open({ file, fileName, sourceUrl: options.sourceUrl }, mirrored ?? carried?.progress)
  if (carried) deps.onCarried?.({ count: carried.count, title: file.maid_tasks.title })
  if (options.remember !== false) {
    storage.setItem(LAST_LIST_KEY, listKey)
    await cache.save({
      listKey,
      title: file.maid_tasks.title,
      fileName,
      text,
      savedAt: (deps.now ?? Date.now)(),
    })
  }
  return true
}

/** Opens a list this browser kept (the menu's earlier lists). Returns whether it was found. */
export async function openCachedList(deps: OpenDeps, listKey: string): Promise<boolean> {
  const cached = await deps.cache.load(listKey)
  if (!cached) return false
  const request = deps.store.getState().actions.start(cached.fileName)
  return openTaskText(deps, cached.text, cached.fileName, { request })
}

/**
 * Forgets a list in this browser: its file and its progress. Not for the open list: the menu does not offer it.
 */
export async function forgetList(deps: Pick<OpenDeps, 'storage' | 'cache'>, listKey: string) {
  await deps.cache.remove(listKey)
  deps.storage.removeItem(mirrorKey(listKey))
  if (deps.storage.getItem(LAST_LIST_KEY) === listKey) deps.storage.removeItem(LAST_LIST_KEY)
}

/** Opens the list of the last visit from the cache. Returns whether one was found. */
export async function restoreLastList(deps: OpenDeps): Promise<boolean> {
  const key = deps.storage.getItem(LAST_LIST_KEY)
  if (key === null) return false
  const cached = await deps.cache.load(key)
  if (!cached) return false
  return openTaskText(deps, cached.text, cached.fileName, {
    remember: false,
    request: deps.store.getState().request,
  })
}
