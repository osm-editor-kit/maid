import { listKeyOf, type TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
/**
 * The open task list: the file, the status of each task, the current task, the revisions the sync compares, and the
 * sync state. One store per module (the module makes it in its setup). Every transition is a pure function on the
 * state (`with...`); the store only applies them.
 *
 * Revisions: `ackedRevision` and `ackedGeneration` are the revision and generation of the account's list that this
 * state agrees with; `localRevision` is above it while there are changes the account has not got (reconcile in
 * maid-osm-prefs reads them). The generation tells a list that was removed and saved again, or another account's
 * list, from the one this browser agreed with.
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
export type Conflict = {
  statuses: TaskStatus[]
  revision: number
  generation: string
  savedAt: number
}

/**
 * A task set to done by Apply: undo takes the status back with the edit, redo sets it again. `change` says how to
 * tell whether the edit is still there: the option's tags on the feature, the new feature, or the deleted ones gone.
 */
export type AppliedTask = {
  index: number
  optionId: string
  change:
    | { kind: 'tag'; entityIds: string[]; option: Pick<TaskOption, 'set' | 'remove'> }
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
  localRevision: number
  ackedRevision: number
  ackedGeneration: string | undefined
  sync: { kind: SyncKind; server?: SyncServer }
  conflict: Conflict | undefined
  /** Whether the conflict dialog is open (Escape closes it; the dock head can open it again) */
  conflictOpen: boolean
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

/** The saved state of a list this browser knew before: statuses and revisions */
export type SavedProgress = {
  statuses: TaskStatus[]
  localRevision: number
  ackedRevision: number
  ackedGeneration?: string
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
  setSync: (kind: SyncKind, server?: SyncServer) => void
  /** A save went through: the account is at `revision`; `revisionAtSave` is the local revision the save started from */
  markSaved: (revision: number, generation: string, revisionAtSave: number) => void
  /** Takes the account's statuses */
  takeRemote: (statuses: TaskStatus[], revision: number, generation: string) => void
  setConflict: (conflict: Conflict | undefined) => void
  setConflictOpen: (open: boolean) => void
  /** Keeps this browser's state against the account's revision: the next save overwrites it */
  keepLocal: (remoteRevision: number, remoteGeneration: string) => void
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
  localRevision: 0,
  ackedRevision: 0,
  ackedGeneration: undefined,
  sync: { kind: 'local' },
  conflict: undefined,
  conflictOpen: false,
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
  // always above the acked revision, also when a save is running
  return { statuses, localRevision: Math.max(state.localRevision, state.ackedRevision) + 1 }
}

/** The state after a successful save: the account is at `revision`; changes made during the save still count */
export function withMarkedSaved(
  state: TasksState,
  revision: number,
  generation: string,
  revisionAtSave: number,
): Partial<TasksState> {
  const changedDuring = state.localRevision !== revisionAtSave
  return {
    ackedRevision: revision,
    ackedGeneration: generation,
    localRevision: changedDuring ? revision + 1 : revision,
  }
}

/** The state after taking the account's statuses */
export function withRemote(
  statuses: TaskStatus[],
  revision: number,
  generation: string,
): Partial<TasksState> {
  return {
    statuses,
    ackedRevision: revision,
    ackedGeneration: generation,
    localRevision: revision,
    conflict: undefined,
    conflictOpen: false,
  }
}

/** The state after keeping this browser's statuses against the account's revision */
export function withKeepLocal(revision: number, generation: string): Partial<TasksState> {
  return {
    ackedRevision: revision,
    ackedGeneration: generation,
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
    ackedGeneration: usable?.ackedGeneration,
    conflict: undefined,
    conflictOpen: false,
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
  return { statuses, localRevision: Math.max(state.localRevision, state.ackedRevision) + 1 }
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
      setSync: (kind, server) =>
        set((state) => {
          const next = { kind, server: server ?? state.sync.server }
          return state.sync.kind === next.kind && state.sync.server === next.server
            ? state
            : { sync: next }
        }),
      markSaved: (revision, generation, revisionAtSave) =>
        set(withMarkedSaved(get(), revision, generation, revisionAtSave)),
      takeRemote: (statuses, revision, generation) =>
        set(withRemote(statuses, revision, generation)),
      setConflict: (conflict) => set({ conflict, conflictOpen: conflict !== undefined }),
      setConflictOpen: (conflictOpen) => set({ conflictOpen }),
      keepLocal: (revision, generation) => set(withKeepLocal(revision, generation)),
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
