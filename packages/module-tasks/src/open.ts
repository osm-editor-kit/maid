/**
 * Opening a task file: parse, find the progress this browser kept, fill the store, remember the file for the next
 * visit. No network here: the text comes from a file picker, the cache or `editor.fetch` (url.ts).
 */
import type { ModuleStorage } from '@osm-editor-kit/maid-core'
import { listKeyOf } from '@osm-editor-kit/maid-osm-prefs'
import { orderHash, parseTaskFileText } from '@osm-editor-kit/maid-tasks'
import { type FileCache, LAST_LIST_KEY, readMirror } from './local.ts'
import type { TasksStore } from './store.ts'

export type OpenDeps = {
  store: TasksStore
  storage: ModuleStorage
  cache: FileCache
  now?: () => number
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
  const saved = await readMirror(storage, listKey, hash, file.features.length)
  if (stale()) return false
  store.getState().actions.open({ file, fileName, sourceUrl: options.sourceUrl }, saved)
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
