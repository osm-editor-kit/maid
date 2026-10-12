import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

/** What the person chose. Kept between visits in localStorage (`maid:notes`, version 1). */
type Settings = {
  /** Off by default: nothing is requested until the person switches the notes on */
  enabled: boolean
  showClosed: boolean
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
      partialize: ({ enabled, showClosed }) => ({ enabled, showClosed }),
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
  /** The map's box and its zoom in OSM terms (MapLibre zoom plus one), or null without a map */
  view: { bbox: Bbox; zoom: number } | null
  notes: Record<number, Note>
  cells: Record<string, CellState>
  /** The message of the last request that failed, cleared by the next one that works */
  error: string | null
  chosen: number | null
  map: FocusableMap | null
  setView: (view: Session['view']) => void
  setMap: (map: FocusableMap | null) => void
  markLoading: (keys: string[]) => void
  finishCells: (keys: string[], notes: Note[], truncated: boolean) => void
  dropCells: (keys: string[]) => void
  setError: (error: string | null) => void
  /** Chooses a note; with `focus` the map moves to it, keeping at least the zoom of a street */
  choose: (id: number | null, focus?: boolean) => void
}

/** OSM zoom at which a chosen note is shown */
const FOCUS_ZOOM = 17

export const useNotesSession = create<Session>()((set, get) => ({
  view: null,
  notes: {},
  cells: {},
  error: null,
  chosen: null,
  map: null,
  setView: (view) => set({ view }),
  setMap: (map) => set({ map }),
  markLoading: (keys) =>
    set((state) => {
      const cells = { ...state.cells }
      for (const key of keys) cells[key] = 'loading'
      return { cells }
    }),
  finishCells: (keys, notes, truncated) =>
    set((state) => {
      const cells = { ...state.cells }
      for (const key of keys) cells[key] = truncated ? 'truncated' : 'loaded'
      const merged = { ...state.notes }
      for (const note of notes) merged[note.id] = note
      return { cells, notes: merged, error: null }
    }),
  dropCells: (keys) =>
    set((state) => {
      const cells = { ...state.cells }
      for (const key of keys) delete cells[key]
      return { cells }
    }),
  setError: (error) => set({ error }),
  choose: (id, focus = false) => {
    set({ chosen: id })
    const { map, notes } = get()
    const note = id === null ? undefined : notes[id]
    if (focus && note && map)
      map.easeTo({ center: [note.lon, note.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM - 1) })
  },
}))

/**
 * Requests in flight, by cell key. One request covers the missing cells of a view, and every
 * cell of it maps to the same controller. Module state on purpose: it is not React state.
 */
const inflight = new Map<string, AbortController>()

/**
 * Asks the API for the cells that are not loaded or loading yet, in one request for their box.
 * A failed request leaves its cells unloaded, so the next view asks again.
 */
export function requestCells(apiUrl: string, mode: NotesMode, cells: Cell[]): void {
  const keys = cells.map((cell) => cellKey(mode, cell))
  const controller = new AbortController()
  for (const key of keys) inflight.set(key, controller)
  const session = useNotesSession.getState()
  session.markLoading(keys)
  // a request that was superseded (aborted, then asked for again) must not touch the cells
  const isCurrent = () => keys.every((key) => inflight.get(key) === controller)
  const settle = () => {
    if (keys.every((key) => inflight.get(key) === controller))
      for (const key of keys) inflight.delete(key)
  }

  fetch(notesUrl(apiUrl, boxOf(cells), mode), {
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return parseNotes(await response.json())
    })
    .then(({ notes, skipped, count }) => {
      if (!isCurrent()) return
      settle()
      if (skipped > 0) console.warn(`[module-notes] skipped ${skipped} malformed notes`)
      useNotesSession.getState().finishCells(keys, notes, count >= NOTES_LIMIT)
    })
    .catch((error: unknown) => {
      if (!isCurrent()) return
      settle()
      useNotesSession.getState().dropCells(keys)
      useNotesSession
        .getState()
        .setError(error instanceof Error ? error.message : 'The notes could not be loaded')
    })
}

/** Aborts every request in flight and forgets its cells, so that they are asked for again later */
export function abortRequests(): void {
  const keys = [...inflight.keys()]
  const controllers = new Set(inflight.values())
  inflight.clear()
  for (const controller of controllers) controller.abort()
  if (keys.length > 0) useNotesSession.getState().dropCells(keys)
}

/** The cells of a view that are not loaded (in this mode) and not loading */
export function missingCells(view: Bbox, mode: NotesMode, loaded: Record<string, CellState>) {
  return cellsOf(view).filter((cell) => loaded[cellKey(mode, cell)] === undefined)
}
