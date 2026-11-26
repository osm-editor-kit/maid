/**
 * The open task list: the file, the status of each task and the current task. One store per module (the module makes
 * it in its setup). Every transition is a pure function on the state (`with...`); the store only applies them. The
 * statuses are kept in this browser only (local.ts).
 *
 * The store is private: components read it with the named hooks and act through `actions`.
 */
import {
  orderHash,
  type TaskFile,
  type TaskFileError,
  type TaskOption,
} from '@osm-editor-kit/maid-tasks'
import { createStore, useStore } from 'zustand'
import { buildRefIndex, mapData, nextOpenIndex, type RefIndex, type TasksFilter } from './list.ts'
import { listKeyOf, type TaskStatus } from './progress-codec.ts'

/**
 * A task set to done by Apply: undo takes the status back with the edit, redo sets it again. `change` says how to
 * tell whether the edit is still there: the option's tags on the feature, the new feature, or the deleted ones gone.
 */
export type AppliedTask = {
  index: number
  optionId: string
  change:
    | { kind: 'tag'; entityIds: string[]; option: Pick<TaskOption, 'set' | 'remove'> }
    /**
     * An option with operations: done while its edit is in effect, that is still in the history at or before the
     * current position (an undo of it, or a new edit after undoing it, ends that). Its shape cannot be read from the tags.
     */
    | { kind: 'edit'; edit: object }
    /** An answer without a change: stays applied, it records which answer was picked */
    | { kind: 'none' }
    | { kind: 'create'; entityId: string }
    | { kind: 'delete'; entityIds: string[] }
  /** The status before Apply */
  before: TaskStatus
}

/** The loaded file and what is derived from it once */
export type LoadedList = {
  file: TaskFile
  fileName: string
  /** Where it came from when it came from the `tasks` URL parameter */
  sourceUrl?: string
  listKey: string
  orderHash: string
  refs: RefIndex
  geojson: GeoJSON.FeatureCollection
}

/** Why the last file could not be loaded: the first errors of the parser, or the failed request */
export type LoadError = { fileName: string; errors: TaskFileError[]; omitted?: number }

export type TasksState = {
  list: LoadedList | undefined
  /** In file order, one per task */
  statuses: TaskStatus[]
  /** The index of the current task */
  current: number | null
  filter: TasksFilter
  error: LoadError | undefined
  /** A file is being fetched or read */
  loading: string | undefined
  /** +1 for each file that starts loading: a file that finishes after a newer one started is not opened */
  request: number
  /** The tasks Apply set to done in this session (not kept: the edits of a session are not either) */
  applied: AppliedTask[]
  /**
   * The task descriptions are folded: once read, the person works through the list without reading it again (Tobias,
   * 2026-11-11). Per list, for the browser tab's session (`sessionStorage`), so a reload keeps it and a new list starts
   * open.
   */
  descriptionsFolded: boolean
}

/** The saved state of a list this browser knew before */
export type SavedProgress = {
  statuses: TaskStatus[]
}

export type TasksActions = {
  /** Opens a parsed file, with the progress this browser kept for it (all open when none) */
  open: (
    list: Omit<LoadedList, 'listKey' | 'orderHash' | 'refs' | 'geojson'>,
    saved?: SavedProgress,
  ) => void
  fail: (error: LoadError) => void
  /** A file starts loading; returns its request number for `open` */
  start: (fileName: string) => number
  closeError: () => void
  setStatus: (index: number, status: TaskStatus) => void
  setCurrent: (index: number | null) => void
  setFilter: (filter: TasksFilter) => void
  /** Apply set a task to done */
  addApplied: (applied: AppliedTask) => void
  /** Folds or unfolds the descriptions of every task of the list */
  setDescriptionsFolded: (folded: boolean) => void
  /** Undo or redo: the status of each applied task follows whether its tags are still there */
  followApplied: (isStillApplied: (applied: AppliedTask) => boolean) => void
  close: () => void
}

export type TasksStoreState = TasksState & { actions: TasksActions }

export const EMPTY_STATE: TasksState = {
  list: undefined,
  statuses: [],
  current: null,
  descriptionsFolded: false,
  filter: 'all',
  error: undefined,
  loading: undefined,
  request: 0,
  applied: [],
}

/** The state after a status change: undefined when nothing changes (same status, or no such task) */
export function withStatus(
  state: TasksState,
  index: number,
  status: TaskStatus,
): Partial<TasksState> | undefined {
  if (index < 0 || index >= state.statuses.length || state.statuses[index] === status)
    return undefined
  const statuses = state.statuses.slice()
  statuses[index] = status
  return { statuses }
}

/** The state of a freshly opened list */
export function withOpened(
  input: Omit<LoadedList, 'listKey' | 'orderHash' | 'refs' | 'geojson'>,
  saved?: SavedProgress,
): Partial<TasksState> {
  const count = input.file.features.length
  const hash = orderHash(input.file)
  const list: LoadedList = {
    ...input,
    listKey: listKeyOf(input.file.maid_tasks.list_id),
    orderHash: hash,
    refs: buildRefIndex(input.file),
    geojson: mapData(input.file),
  }
  const usable = saved && saved.statuses.length === count ? saved : undefined
  const statuses = usable
    ? usable.statuses
    : Array.from({ length: count }, (): TaskStatus => 'open')
  return {
    list,
    statuses,
    current: nextOpenIndex(statuses, null) ?? (count > 0 ? 0 : null),
    filter: 'all',
    error: undefined,
    loading: undefined,
    applied: [],
    descriptionsFolded: readFolded(list.listKey),
  }
}

const foldedKey = (listKey: string) => `maid.tasks.descriptions-folded.${listKey}`

/** Whether this tab folded the descriptions of the list before; false without session storage */
function readFolded(listKey: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(foldedKey(listKey)) === '1'
  } catch {
    return false
  }
}

function writeFolded(listKey: string, folded: boolean) {
  try {
    if (folded) globalThis.sessionStorage?.setItem(foldedKey(listKey), '1')
    else globalThis.sessionStorage?.removeItem(foldedKey(listKey))
  } catch {
    // no session storage (a private window): it holds for this page only
  }
}

/**
 * The state after undo or redo: a task Apply set to done goes back to its status before when its tags are gone, and
 * to done again when they are back (redo). A status the person changed since is left alone.
 */
export function withFollowedApplied(
  state: TasksState,
  isStillApplied: (applied: AppliedTask) => boolean,
): Partial<TasksState> | undefined {
  let statuses: TaskStatus[] | undefined
  for (const applied of state.applied) {
    const now = (statuses ?? state.statuses)[applied.index]
    const there = isStillApplied(applied)
    const next =
      !there && now === 'done' ? applied.before : there && now === applied.before ? 'done' : now
    if (next === now || next === undefined) continue
    statuses ??= state.statuses.slice()
    statuses[applied.index] = next
  }
  if (!statuses) return undefined
  return { statuses }
}

/** Makes the store of one module */
export function createTasksStore() {
  return createStore<TasksStoreState>()((set, get) => ({
    ...EMPTY_STATE,
    actions: {
      open: (list, saved) => set(withOpened(list, saved)),
      fail: (error) => set({ error, loading: undefined }),
      start: (fileName) => {
        const request = get().request + 1
        set({ loading: fileName, error: undefined, request })
        return request
      },
      closeError: () => set({ error: undefined }),
      setStatus: (index, status) => {
        const change = withStatus(get(), index, status)
        if (change) set(change)
      },
      setCurrent: (current) => set({ current }),
      setDescriptionsFolded: (folded) => {
        const { list } = get()
        if (list) writeFolded(list.listKey, folded)
        set({ descriptionsFolded: folded })
      },
      setFilter: (filter) => set({ filter }),
      addApplied: (applied) =>
        set((state) => ({
          applied: [...state.applied.filter((a) => a.index !== applied.index), applied],
        })),
      followApplied: (isStillApplied) => {
        const change = withFollowedApplied(get(), isStillApplied)
        if (change) set(change)
      },
      // the request number stays, so a file still loading is not opened after the close
      close: () => set({ ...EMPTY_STATE, request: get().request }),
    },
  }))
}

/** The store of one module */
export type TasksStore = ReturnType<typeof createTasksStore>

/** Reads the store in a component, with a selector */
export function useTasks<T>(store: TasksStore, select: (state: TasksStoreState) => T): T {
  return useStore(store, select)
}
