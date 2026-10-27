import { listKeyOf, type TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
/**
 * The open task list: the file, the status of each task, the current task, the revisions the sync compares, and the
 * sync state. One store per module (the module makes it in its setup). Every transition is a pure function on the
 * state (`with...`); the store only applies them.
 *
 * Revisions: `ackedRevision` is the revision of the account that this state agrees with; `localRevision` is above it
 * while there are changes the account has not got (reconcile in maid-osm-prefs reads the two).
 *
 * The store is private: components read it with the named hooks and act through `actions`.
 */
import { orderHash, type TaskFile, type TaskFileError } from '@osm-editor-kit/maid-tasks'
import { createStore, useStore } from 'zustand'
import { buildRefIndex, mapData, nextOpenIndex, type RefIndex, type TasksFilter } from './list.ts'

/** What the sync is doing; the dock head shows it as a short text */
export type SyncKind =
  | 'local' // not logged in: only in this browser
  | 'saved'
  | 'pending' // changed, waiting for the debounce
  | 'saving'
  | 'forbidden' // the login lacks permission to store preferences (401, 403)
  | 'failed'
  | 'mismatch' // the account holds this list for another version of the file: the local state is kept
  | 'conflict'

export type SyncServer = 'mock' | 'osm' | 'dev'

/** The account's copy of the list, when both sides changed */
export type Conflict = { statuses: TaskStatus[]; revision: number; savedAt: number }

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
  localRevision: number
  ackedRevision: number
  sync: { kind: SyncKind; server?: SyncServer }
  conflict: Conflict | undefined
  /** Whether the conflict dialog is open (Escape closes it; the dock head can open it again) */
  conflictOpen: boolean
  error: LoadError | undefined
  /** A file is being fetched or read */
  loading: string | undefined
}

/** The saved state of a list this browser knew before: statuses and revisions */
export type SavedProgress = { statuses: TaskStatus[]; localRevision: number; ackedRevision: number }

export type TasksActions = {
  /** Opens a parsed file, with the progress this browser kept for it (all open when none) */
  open: (
    list: Omit<LoadedList, 'listKey' | 'orderHash' | 'refs' | 'geojson'>,
    saved?: SavedProgress,
  ) => void
  fail: (error: LoadError) => void
  start: (fileName: string) => void
  closeError: () => void
  setStatus: (index: number, status: TaskStatus) => void
  setCurrent: (index: number | null) => void
  setFilter: (filter: TasksFilter) => void
  setSync: (kind: SyncKind, server?: SyncServer) => void
  /** A save went through: the account is at `revision`; `revisionAtSave` is the local revision the save started from */
  markSaved: (revision: number, revisionAtSave: number) => void
  /** Takes the account's statuses */
  takeRemote: (statuses: TaskStatus[], revision: number) => void
  setConflict: (conflict: Conflict | undefined) => void
  setConflictOpen: (open: boolean) => void
  /** Keeps this browser's state against the account's revision: the next save overwrites it */
  keepLocal: (remoteRevision: number) => void
  close: () => void
}

export type TasksStoreState = TasksState & { actions: TasksActions }

export const EMPTY_STATE: TasksState = {
  list: undefined,
  statuses: [],
  current: null,
  filter: 'all',
  localRevision: 0,
  ackedRevision: 0,
  sync: { kind: 'local' },
  conflict: undefined,
  conflictOpen: false,
  error: undefined,
  loading: undefined,
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
  // always above the acked revision, also when a save is running
  return { statuses, localRevision: Math.max(state.localRevision, state.ackedRevision) + 1 }
}

/** The state after a successful save: the account is at `revision`; changes made during the save still count */
export function withMarkedSaved(
  state: TasksState,
  revision: number,
  revisionAtSave: number,
): Partial<TasksState> {
  const changedDuring = state.localRevision !== revisionAtSave
  return {
    ackedRevision: revision,
    localRevision: changedDuring ? revision + 1 : revision,
  }
}

/** The state after taking the account's statuses */
export function withRemote(statuses: TaskStatus[], revision: number): Partial<TasksState> {
  return {
    statuses,
    ackedRevision: revision,
    localRevision: revision,
    conflict: undefined,
    conflictOpen: false,
  }
}

/** The state after keeping this browser's statuses against the account's revision */
export function withKeepLocal(revision: number): Partial<TasksState> {
  return {
    ackedRevision: revision,
    localRevision: revision + 1,
    conflict: undefined,
    conflictOpen: false,
  }
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
    localRevision: usable?.localRevision ?? 0,
    ackedRevision: usable?.ackedRevision ?? 0,
    conflict: undefined,
    conflictOpen: false,
    error: undefined,
    loading: undefined,
  }
}

/** Makes the store of one module */
export function createTasksStore() {
  return createStore<TasksStoreState>()((set, get) => ({
    ...EMPTY_STATE,
    actions: {
      open: (list, saved) => set(withOpened(list, saved)),
      fail: (error) => set({ error, loading: undefined }),
      start: (fileName) => set({ loading: fileName, error: undefined }),
      closeError: () => set({ error: undefined }),
      setStatus: (index, status) => {
        const change = withStatus(get(), index, status)
        if (change) set(change)
      },
      setCurrent: (current) => set({ current }),
      setFilter: (filter) => set({ filter }),
      setSync: (kind, server) =>
        set((state) => {
          const next = { kind, server: server ?? state.sync.server }
          return state.sync.kind === next.kind && state.sync.server === next.server
            ? state
            : { sync: next }
        }),
      markSaved: (revision, revisionAtSave) =>
        set(withMarkedSaved(get(), revision, revisionAtSave)),
      takeRemote: (statuses, revision) => set(withRemote(statuses, revision)),
      setConflict: (conflict) => set({ conflict, conflictOpen: conflict !== undefined }),
      setConflictOpen: (conflictOpen) => set({ conflictOpen }),
      keepLocal: (revision) => set(withKeepLocal(revision)),
      close: () => set({ ...EMPTY_STATE }),
    },
  }))
}

/** The store of one module */
export type TasksStore = ReturnType<typeof createTasksStore>

/** Reads the store in a component, with a selector */
export function useTasks<T>(store: TasksStore, select: (state: TasksStoreState) => T): T {
  return useStore(store, select)
}
