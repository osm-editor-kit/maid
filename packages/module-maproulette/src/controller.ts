/**
 * The requests of Maid MapRoulette and what they change in the store: the tasks of the view, a challenge, a task's
 * details, a status sent right away, and the earmarked tasks sent after an upload. One controller per module, made in
 * its setup; nothing is asked before the map is up (check-config: setup sends no request).
 *
 * The login is behind `MapRouletteAuth` (packages/maproulette): today a token the person pastes, sent as a bearer
 * token. MapRoulette removed its API keys and is deciding how editors log in (maproulette-backend issues 1288 and
 * 1289, Tobias, 2026-11-13); when that is decided, only `auth` here changes.
 */
import {
  type Editor,
  HttpError,
  type ModuleStorage,
  RateLimitedError,
} from '@osm-editor-kit/maid-core'
import {
  addEarmark,
  bearerAuth,
  BOX_STATUSES,
  collectOsmEntityIds,
  createMapRouletteClient,
  earmarksForUpload,
  type FetchLike,
  isTagFix,
  MapRouletteError,
  parseEarmarks,
  parseUpdateTiming,
  removeEarmark,
  resolveAfterUpload,
  restoreEarmarks,
  serializeEarmarks,
  setEarmarkIncluded,
  type ShortcodeResponses,
  snapPinLoc,
  type UpdateTiming,
  effectiveUpdateTiming,
} from '@osm-editor-kit/maid-maproulette'
import { m } from './messages.ts'
import type { MapRouletteState, MapRouletteStore, MapView } from './store.ts'

/** The zoom (OSM) from which the tasks of the view are read, as in Tobias's iD fork */
export const MIN_ZOOM = 12

/** Where the module keeps the person's choices: the token, the timing and the earmarks (they outlive a reload, as the edits do) */
const KEYS = {
  token: 'maid-maproulette:token',
  timing: 'maid-maproulette:timing',
  earmarks: 'maid-maproulette:earmarks',
} as const

/** What a request error means for a person */
export function errorText(error: unknown): string {
  if (error instanceof MapRouletteError) {
    if (error.kind === 'unauthorized') return m.mr_error_login()
    if (error.kind === 'network') return m.mr_error_network()
    if (error.kind === 'timeout') return m.mr_error_timeout()
    if (error.kind === 'http') return m.mr_error_http({ status: String(error.status ?? '') })
  }
  return error instanceof Error ? error.message : String(error)
}

function isUnauthorized(error: unknown) {
  return error instanceof MapRouletteError && error.kind === 'unauthorized'
}

export type Controller = ReturnType<typeof createController>

/**
 * The editor's fetch (core's one function for remote requests: refused off localhost under automation, paused on a
 * rate limit) in the shape of the MapRoulette client: an answer that is not 2xx comes back as an answer, not as an
 * error, so the client can tell a refused login (401) from the rest.
 */
export function editorFetch(editor: Pick<Editor, 'fetch'>): FetchLike {
  return async (url, init) => {
    try {
      return await editor.fetch(url, init)
    } catch (error) {
      if (error instanceof HttpError || error instanceof RateLimitedError)
        return { ok: false, status: error.status, json: async () => ({}) }
      throw error
    }
  }
}

export function createController(options: {
  store: MapRouletteStore
  apiUrl: string
  storage: ModuleStorage
  fetch: FetchLike
}) {
  const { store, storage } = options
  const set = (
    patch: Partial<MapRouletteState> | ((state: MapRouletteState) => Partial<MapRouletteState>),
  ) => store.setState(patch)
  const client = createMapRouletteClient({
    baseUrl: options.apiUrl,
    fetch: options.fetch,
    auth: bearerAuth(() => store.getState().token.trim() || undefined),
  })
  let viewRequest: AbortController | undefined

  // the person's choices from the last visit
  set({
    token: storage.getItem(KEYS.token) ?? '',
    timing: parseUpdateTiming(storage.getItem(KEYS.timing)),
    earmarks: parseEarmarks(storage.getItem(KEYS.earmarks)),
  })
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.earmarks !== previous.earmarks)
      storage.setItem(KEYS.earmarks, serializeEarmarks(state.earmarks))
  })

  async function loadChallenge(id: string) {
    const known = store.getState().challenges[id]
    if (known && known.state !== 'failed') return
    set((state) => ({ challenges: { ...state.challenges, [id]: { state: 'loading' } } }))
    try {
      const value = await client.challenge(id)
      set((state) => ({ challenges: { ...state.challenges, [id]: { state: 'ready', value } } }))
    } catch (error) {
      set((state) => ({
        challenges: { ...state.challenges, [id]: { state: 'failed', reason: errorText(error) } },
      }))
    }
  }

  async function loadTask(id: string) {
    const known = store.getState().details[id]
    if (known && known.state !== 'failed') return
    set((state) => ({ details: { ...state.details, [id]: { state: 'loading' } } }))
    try {
      const value = await client.task(id)
      set((state) => ({ details: { ...state.details, [id]: { state: 'ready', value } } }))
      if (value.parentId !== undefined) void loadChallenge(String(value.parentId))
    } catch (error) {
      set((state) => ({
        details: { ...state.details, [id]: { state: 'failed', reason: errorText(error) } },
      }))
    }
  }

  /** The OSM features a task names (`w123`), from its title, its geometries and its details */
  function featuresOf(id: string): string[] {
    const state = store.getState()
    const detail = state.details[id]
    return collectOsmEntityIds(
      state.tasks[id],
      detail?.state === 'ready' ? detail.value : undefined,
    )
  }

  /** Where a task's pin is: its point, moved onto its line when it has one */
  function locationOf(id: string): [number, number] | undefined {
    const task = store.getState().tasks[id]
    if (!task) return undefined
    return snapPinLoc([task.point.lng, task.point.lat], task.geometries)
  }

  return {
    client,

    /** Reads the tasks of the view (from MIN_ZOOM); a newer view cancels the request of the older one */
    async loadView(view: MapView) {
      viewRequest?.abort()
      if (view.zoom < MIN_ZOOM) {
        set({ view: null, zoomedOut: true, loading: false, error: undefined })
        return
      }
      const request = new AbortController()
      viewRequest = request
      set({ view, zoomedOut: false, loading: true, error: undefined })
      try {
        const rows = await client.tasksInBox(view.bbox, BOX_STATUSES, { signal: request.signal })
        if (request.signal.aborted) return
        set((state) => {
          const tasks = { ...state.tasks }
          const byEntity: Record<string, readonly string[]> = { ...state.byEntity }
          for (const row of rows) {
            const id = String(row.id)
            if (!tasks[id])
              for (const entity of collectOsmEntityIds(row))
                byEntity[entity] = [...(byEntity[entity] ?? []), id]
            tasks[id] = row
          }
          return { tasks, byEntity, loading: false }
        })
        // the names of the challenges in view, for the list "Challenges here"; a few at a time is enough
        const ids = [...new Set(rows.map((row) => String(row.parentId)))].slice(0, 12)
        await Promise.all(ids.map(loadChallenge))
      } catch (error) {
        if (request.signal.aborted) return
        set({ loading: false, error: errorText(error) })
      }
    },

    loadChallenge,
    loadTask,

    /** Opens a challenge: its tasks only on the map and in the lists; null shows every challenge again */
    openChallenge(id: string | null) {
      set({ challengeId: id })
      if (id !== null) void loadChallenge(id)
    },

    /** Makes a task the current one and reads its details and its challenge */
    chooseTask(id: string | null) {
      set({ currentTaskId: id })
      if (id === null) return
      void loadTask(id)
      const task = store.getState().tasks[id]
      if (task) void loadChallenge(String(task.parentId))
    },

    featuresOf,
    locationOf,

    setToken(token: string) {
      set({ token })
      storage.setItem(KEYS.token, token)
    },

    setTiming(timing: UpdateTiming) {
      set({ timing })
      storage.setItem(KEYS.timing, timing)
    },

    /**
     * Finishes a task with a status. With the save (the default, and always for a tag fix) it is earmarked and sent
     * after the next upload; right away it is sent now, with the comment.
     */
    async finish(
      id: string,
      status: number,
      extra: { comment?: string; responses?: ShortcodeResponses } = {},
    ) {
      const state = store.getState()
      const task = state.tasks[id]
      const detail = state.details[id]
      const full = detail?.state === 'ready' ? detail.value : task
      const timing = effectiveUpdateTiming(isTagFix(full), state.timing)
      if (timing === 'with_save') {
        const parent =
          task?.parentId ?? (detail?.state === 'ready' ? detail.value.parentId : undefined)
        const challenge = parent === undefined ? undefined : state.challenges[String(parent)]
        const input = {
          taskId: id,
          ...(parent === undefined ? {} : { challengeId: parent }),
          ...(challenge?.state === 'ready' && challenge.value.name
            ? { parentName: challenge.value.name }
            : {}),
          title: task?.title ?? task?.name ?? `Task ${id}`,
          elems: featuresOf(id),
          loc: locationOf(id) ?? null,
          status,
          localDone: true,
          ...(extra.responses && Object.keys(extra.responses).length > 0
            ? { completionResponses: extra.responses }
            : {}),
        }
        set((s) => ({ earmarks: addEarmark(s.earmarks, input) }))
        return
      }
      set((s) => ({ sending: { ...s.sending, [id]: 'sending' } }))
      try {
        await client.setStatus(id, status, {
          ...(extra.comment?.trim() ? { comment: extra.comment.trim() } : {}),
          ...(extra.responses && Object.keys(extra.responses).length > 0
            ? { completionResponses: extra.responses }
            : {}),
        })
        set((s) => {
          const { [id]: _, ...sending } = s.sending
          return { sending, finished: { ...s.finished, [id]: status } }
        })
      } catch (error) {
        set((s) => ({
          sending: {
            ...s.sending,
            [id]: { failed: errorText(error), unauthorized: isUnauthorized(error) },
          },
        }))
      }
    },

    /** Takes a task out of the next upload: it is open again */
    undo(id: string) {
      set((s) => {
        const { [id]: _, ...sending } = s.sending
        return { earmarks: removeEarmark(s.earmarks, id), sending }
      })
    },

    /** Whether an earmarked task goes with the next upload (the box in the save form) */
    include(id: string, included: boolean) {
      set((s) => ({ earmarks: setEarmarkIncluded(s.earmarks, id, included) }))
    },

    /**
     * After an upload: each earmarked task that goes with it gets its status, with a comment that links the changeset.
     * The ones MapRoulette refused stay earmarked for the next upload; the ones left out of it stay too.
     */
    async afterUpload(upload: {
      changesetId: number
      changesetUrl: string
      comment: string
      user?: string
    }) {
      const sent = earmarksForUpload(store.getState().earmarks)
      if (sent.length === 0) return
      const sentIds = new Set(sent.map((e) => e.taskId))
      set((s) => ({
        earmarks: s.earmarks.filter((e) => !sentIds.has(e.taskId)),
        resolve: { state: 'running', done: 0, total: sent.length },
      }))
      const summary = await resolveAfterUpload(client, sent, {
        changesetId: upload.changesetId,
        changesetUrl: upload.changesetUrl,
        username: upload.user ?? 'a Maid user',
        changesetComment: upload.comment,
        onProgress: ({ index, total, done }) =>
          set({ resolve: { state: 'running', done: done ? total : index - 1, total } }),
      })
      set((s) => {
        const finished = { ...s.finished }
        for (const result of summary.results)
          if (result.ok)
            finished[result.taskId] = sent.find((e) => e.taskId === result.taskId)?.status ?? 1
        return {
          finished,
          earmarks: restoreEarmarks(s.earmarks, summary.failedEarmarks),
          resolve: {
            state: 'done',
            ok: summary.ok,
            failed: summary.failed,
            changesetUrl: upload.changesetUrl,
          },
        }
      })
    },

    dispose() {
      viewRequest?.abort()
      unsubscribe()
    },
  }
}
