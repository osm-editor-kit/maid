/**
 * Keeps the statuses of the open list on the person's OSM account (user preferences), through the progress store of
 * maid-osm-prefs. The module's controller makes one `Sync` per list and endpoint and drops it on logout or when the
 * list changes. Headless: it takes the transport and the store as arguments, so tests run on the in-memory transport.
 *
 * - `start` reconciles once with what the account holds: push, pull, same or conflict.
 * - `schedule` is called after each status change; it saves 2 s later (one save at a time; a change during a save
 *   marks another save).
 * - A save first reads the account's meta: if the account moved on since the last agreement, it is a conflict and
 *   nothing is written.
 * - The orderHash (and task count) of the file and of the account must match; if not, the local state is kept and
 *   nothing is synced.
 */
import {
  DEFAULT_PREFIX,
  type ListAllResult,
  type PrefsTransport,
  PrefsHttpError,
  type ProgressStore,
  parseMeta,
  reconcile,
} from '@osm-editor-kit/maid-osm-prefs'
import type { SyncServer, TasksStore } from './store.ts'

/** The wait between the last change and the save */
export const PUSH_DEBOUNCE_MS = 2000

export type SyncDeps = {
  store: TasksStore
  transport: PrefsTransport
  progress: ProgressStore
  server: SyncServer
  prefix?: string
  debounceMs?: number
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (timer: unknown) => void }
}

export type Sync = {
  /** Reconciles the open list with the account's lists (one `listAll()` result, read once per session) */
  start: (listed: ListAllResult) => Promise<void>
  /** A status changed: save after the debounce */
  schedule: () => void
  /** Saves now, without waiting for the debounce */
  flush: () => Promise<void>
  /** The retry button: saves now */
  retry: () => Promise<void>
  /** The person's answer to a conflict: the account's statuses or this browser's */
  resolveConflict: (choice: 'remote' | 'local') => Promise<void>
  /** Drops the timer; later results are ignored */
  dispose: () => void
}

/** True for the answers that mean the login may not store preferences */
export function isForbidden(error: unknown): boolean {
  return error instanceof PrefsHttpError && (error.status === 401 || error.status === 403)
}

/** Makes the sync of the open list */
export function createSync(deps: SyncDeps): Sync {
  const { store, transport, progress, server } = deps
  const prefix = deps.prefix ?? DEFAULT_PREFIX
  const debounce = deps.debounceMs ?? PUSH_DEBOUNCE_MS
  const timers = deps.timers ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  }
  let timer: unknown
  let saving = false
  let again = false
  let disposed = false

  const actions = () => store.getState().actions
  const dirty = () => {
    const { localRevision, ackedRevision } = store.getState()
    return localRevision > ackedRevision
  }
  const stopTimer = () => {
    if (timer !== undefined) timers.clear(timer)
    timer = undefined
  }

  /** The account's copy goes into the conflict dialog; a copy of another size is a mismatch */
  async function offerConflict(listKey: string, all?: Record<string, string>) {
    const list = store.getState().list
    if (!list) return
    const remote = await progress.load(listKey, all)
    if (disposed) return
    if (!remote || remote.statuses.length !== list.file.features.length) {
      actions().setSync('mismatch', server)
      return
    }
    actions().setConflict({
      statuses: remote.statuses,
      revision: remote.meta.r,
      savedAt: remote.meta.u,
    })
    actions().setSync('conflict', server)
  }

  async function push(): Promise<void> {
    stopTimer()
    const list = store.getState().list
    if (disposed || !list) return
    if (saving) {
      again = true
      return
    }
    saving = true
    again = false
    actions().setSync('saving', server)
    const revisionAtSave = store.getState().localRevision
    const statuses = store.getState().statuses
    let saved = false
    try {
      const all = await transport.list()
      const remoteText = all[`${prefix}.${list.listKey}`]
      if (remoteText !== undefined) {
        const meta = parseMeta(remoteText)
        if (meta.h !== list.orderHash || meta.c !== statuses.length) {
          if (!disposed) actions().setSync('mismatch', server)
          return
        }
        if (meta.r > store.getState().ackedRevision) {
          await offerConflict(list.listKey, all)
          return
        }
      }
      const meta = await progress.save(list.listKey, statuses, {
        orderHash: list.orderHash,
        previous: all,
      })
      if (disposed) return
      actions().markSaved(meta.r, revisionAtSave)
      actions().setSync('saved', server)
      saved = true
    } catch (error) {
      if (!disposed) actions().setSync(isForbidden(error) ? 'forbidden' : 'failed', server)
    } finally {
      saving = false
    }
    // changes during the save: save again
    if (saved && !disposed && (again || dirty())) schedule()
  }

  function schedule() {
    if (disposed) return
    const { list, sync } = store.getState()
    if (!list || sync.kind === 'conflict' || sync.kind === 'mismatch') return
    if (saving) {
      again = true
      return
    }
    actions().setSync('pending', server)
    stopTimer()
    timer = timers.set(() => {
      timer = undefined
      void push()
    }, debounce)
  }

  return {
    async start(listed) {
      const state = store.getState()
      const list = state.list
      if (!list || disposed) return
      actions().setSync(dirty() ? 'pending' : 'saved', server)
      const entry = listed.lists.find((candidate) => candidate.listKey === list.listKey)
      if (
        entry &&
        (entry.meta.h !== list.orderHash || entry.meta.c !== list.file.features.length)
      ) {
        actions().setSync('mismatch', server)
        return
      }
      const action = reconcile(state, entry?.meta.r)
      try {
        if (action === 'push') await push()
        else if (action === 'pull') {
          const remote = await progress.load(list.listKey)
          if (disposed) return
          if (!remote || remote.statuses.length !== list.file.features.length) {
            actions().setSync('mismatch', server)
            return
          }
          actions().takeRemote(remote.statuses, remote.meta.r)
          actions().setSync('saved', server)
        } else if (action === 'conflict') await offerConflict(list.listKey)
        else actions().setSync('saved', server)
      } catch (error) {
        if (!disposed) actions().setSync(isForbidden(error) ? 'forbidden' : 'failed', server)
      }
    },
    schedule,
    flush: push,
    async retry() {
      if (!dirty()) {
        actions().setSync('saved', server)
        return
      }
      await push()
    },
    async resolveConflict(choice) {
      const conflict = store.getState().conflict
      if (!conflict) return
      if (choice === 'remote') {
        actions().takeRemote(conflict.statuses, conflict.revision)
        actions().setSync('saved', server)
      } else {
        actions().keepLocal(conflict.revision)
        await push()
      }
    },
    dispose() {
      disposed = true
      stopTimer()
    },
  }
}
