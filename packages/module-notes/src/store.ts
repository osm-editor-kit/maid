import { moduleStorage, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  boxOf,
  cellKey,
  cellsOf,
  notesUrl,
  parseNotes,
  type Bbox,
  type Cell,
  type Note,
  type NotesMode,
  NOTES_LIMIT,
} from './model.ts'
import { afterFailure, canAsk, failureMessage, type CellFailure } from './retry.ts'

/** What is stored. Both flags must be booleans: a stored string never switches the requests on. */
const storedSettings = z.object({
  enabled: z.boolean(),
  showClosed: z.boolean(),
})

/**
 * The settings from storage, over the current (default) state. A stored value that does not parse
 * is ignored, so the defaults apply: nothing is requested until the person switches the notes on.
 */
export function restoreSettings<State extends z.infer<typeof storedSettings>>(
  persisted: unknown,
  current: State,
): State {
  const stored = storedSettings.safeParse(persisted)
  return stored.success ? { ...current, ...stored.data } : current
}

/** What the person chose. Kept between visits in localStorage (`maid:notes`, version 1). */
type Settings = z.infer<typeof storedSettings> & {
  /** Off by default: nothing is requested until the person switches the notes on */
  setEnabled: (enabled: boolean) => void
  setShowClosed: (showClosed: boolean) => void
}

export const useNotesSettings = create<Settings>()(
  persist(
    (set) => ({
      enabled: false,
      showClosed: false,
      setEnabled: (enabled) => set({ enabled }),
      setShowClosed: (showClosed) => set({ showClosed }),
    }),
    {
      name: 'maid:notes',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ enabled, showClosed }) => ({ enabled, showClosed }),
      // every stored value is checked on load, not only after a version change
      merge: (persisted, current) => restoreSettings(persisted, current),
    },
  ),
)

/** The part of the map the notes need: to move to a note */
export type FocusableMap = {
  getZoom(): number
  easeTo(options: { center: [number, number]; zoom: number }): unknown
}

/** A grid cell of the notes already asked for: being loaded, loaded, or loaded but cut short */
export type CellState = 'loading' | 'loaded' | 'truncated'

/** Session state: nothing here is stored. Notes are kept per id, cells per mode and grid cell. */
type Session = {
  /** The map's box and its zoom in OSM terms (see `osmZoomOf`), or null without a map */
  view: { bbox: Bbox; zoom: number } | null
  notes: Record<number, Note>
  cells: Record<string, CellState>
  /** Cells whose request failed, by cell key: how often in a row, and when they may be asked again */
  failures: Record<string, CellFailure>
  /** The message of the last request that failed, cleared by the next one that works */
  error: string | null
  /** The OSM service is paused for a rate limit: no notes request is sent until the pause ends */
  paused: boolean
  /** Changes when a waiting cell may be asked again; the map layer asks again when it changes */
  tick: number
  /** Whether the notice of a list cut at the limit is shown for the view that has one */
  noticeShown: boolean
  chosen: number | null
  map: FocusableMap | null
  setView: (view: Session['view']) => void
  setMap: (map: FocusableMap | null) => void
  setPaused: (paused: boolean) => void
  wake: () => void
  setNoticeShown: (shown: boolean) => void
  markLoading: (keys: string[]) => void
  finishCells: (keys: string[], notes: Note[], truncated: boolean) => void
  dropCells: (keys: string[]) => void
  recordFailures: (failures: Record<string, CellFailure>, message: string) => void
  /** Chooses a note; with `focus` the map moves to it, keeping at least the zoom of a street */
  choose: (id: number | null, focus?: boolean) => void
}

/** OSM zoom at which a chosen note is shown */
const FOCUS_ZOOM = 17

export const useNotesSession = create<Session>()((set, get) => ({
  view: null,
  notes: {},
  cells: {},
  failures: {},
  error: null,
  paused: false,
  tick: 0,
  noticeShown: false,
  chosen: null,
  map: null,
  setView: (view) => set({ view }),
  setMap: (map) => set({ map }),
  setPaused: (paused) => set({ paused }),
  wake: () => set((state) => ({ tick: state.tick + 1 })),
  setNoticeShown: (noticeShown) => set({ noticeShown }),
  markLoading: (keys) =>
    set((state) => {
      const cells = { ...state.cells }
      for (const key of keys) cells[key] = 'loading'
      return { cells }
    }),
  finishCells: (keys, notes, truncated) =>
    set((state) => {
      const cells = { ...state.cells }
      const failures = { ...state.failures }
      for (const key of keys) {
        cells[key] = truncated ? 'truncated' : 'loaded'
        delete failures[key]
      }
      const merged = { ...state.notes }
      for (const note of notes) merged[note.id] = note
      return { cells, failures, notes: merged, error: null }
    }),
  dropCells: (keys) =>
    set((state) => {
      const cells = { ...state.cells }
      for (const key of keys) delete cells[key]
      return { cells }
    }),
  recordFailures: (failures, message) =>
    set((state) => ({ failures: { ...state.failures, ...failures }, error: message })),
  choose: (id, focus = false) => {
    set({ chosen: id })
    const { map, notes } = get()
    const note = id === null ? undefined : notes[id]
    if (focus && note && map)
      map.easeTo({ center: [note.lon, note.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM - 1) })
  },
}))

/**
 * One request in flight: its controller and the cell keys it covers. A cell maps to the request
 * that asked for it. Module state on purpose: it is not React state.
 */
type Request = { controller: AbortController; keys: string[] }
const inflight = new Map<string, Request>()

/** A timer that asks again when a waiting cell's time is over. The map layer re-reads the cells then. */
function wakeAfter(ms: number) {
  setTimeout(() => useNotesSession.getState().wake(), Math.max(0, ms))
}

/**
 * Asks the API for the cells that are not loaded or loading yet, in one request for their box. The
 * request goes through the editor's fetch: the OSM gate, the time limit, and the refusal in an
 * automated run. A failed request records a wait for its cells (see retry.ts); a cell that is
 * aborted (it left the view, or the layer went off) is not a failure and is asked again later.
 */
export function requestCells(remote: RemoteFetch, apiUrl: string, mode: NotesMode, cells: Cell[]) {
  const keys = cells.map((cell) => cellKey(mode, cell))
  const request: Request = { controller: new AbortController(), keys }
  for (const key of keys) inflight.set(key, request)
  useNotesSession.getState().markLoading(keys)
  // a request that was superseded (aborted, then asked for again) must not touch the cells
  const isCurrent = () => keys.every((key) => inflight.get(key) === request)
  const settle = () => {
    for (const key of keys) if (inflight.get(key) === request) inflight.delete(key)
  }

  remote(notesUrl(apiUrl, boxOf(cells), mode), {
    signal: request.controller.signal,
    headers: { Accept: 'application/json' },
    service: 'osm',
  })
    .then(async (response) => parseNotes(await response.json()))
    .then(({ notes, skipped, count }) => {
      if (!isCurrent()) return
      settle()
      if (skipped > 0) console.warn(`[module-notes] skipped ${skipped} malformed notes`)
      useNotesSession.getState().finishCells(keys, notes, count >= NOTES_LIMIT)
    })
    .catch((error: unknown) => {
      if (!isCurrent()) return
      settle()
      const session = useNotesSession.getState()
      const now = Date.now()
      const failures: Record<string, CellFailure> = {}
      for (const key of keys) failures[key] = afterFailure(session.failures[key], error, now)
      session.dropCells(keys)
      session.recordFailures(failures, failureMessage(error))
      const waits = Object.values(failures)
        .map((failure) => failure.retryAt)
        .filter((at) => Number.isFinite(at))
      if (waits.length > 0) wakeAfter(Math.min(...waits) - now)
    })
}

/** Aborts every request in flight and forgets its cells, so that they are asked for again later */
export function abortRequests() {
  const keys = [...inflight.keys()]
  const requests = new Set(inflight.values())
  inflight.clear()
  for (const request of requests) request.controller.abort()
  if (keys.length > 0) useNotesSession.getState().dropCells(keys)
}

/**
 * Aborts the requests none of whose cells is still wanted (in view, with the layer on). A request
 * with one wanted cell goes on: the answer covers the box and the other cells are kept.
 */
export function abortOutside(wanted: ReadonlySet<string>) {
  for (const request of new Set(inflight.values())) {
    if (request.keys.some((key) => wanted.has(key))) continue
    for (const key of request.keys) if (inflight.get(key) === request) inflight.delete(key)
    request.controller.abort()
    useNotesSession.getState().dropCells(request.keys)
  }
}

/**
 * The cells of a view that are not loaded (in this mode), not loading, and not waiting after a
 * failure. `now` is the epoch time of the check.
 */
export function missingCells(
  view: Bbox,
  mode: NotesMode,
  loaded: Record<string, CellState>,
  failures: Record<string, CellFailure>,
  now: number,
) {
  return cellsOf(view).filter((cell) => {
    const key = cellKey(mode, cell)
    return loaded[key] === undefined && canAsk(failures[key], now)
  })
}
