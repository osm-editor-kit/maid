import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Bbox } from './model.ts'

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

/** The events of the settings. The object never changes. */
export type NotesSettingsActions = {
  /** The person's choice of the notes switch, remembered for the next visit (a link never calls it) */
  setEnabled: (enabled: boolean) => void
  setShowClosed: (showClosed: boolean) => void
}

/**
 * What the person chose. Kept between visits in localStorage (`maid:notes`, version 1). `enabled` is the choice for the
 * next visit: the notes shown are the URL's `notes` when it has one (shown.ts). Off by default: nothing is requested
 * until the person, or a link, switches the notes on.
 */
type NotesSettingsStore = z.infer<typeof storedSettings> & { actions: NotesSettingsActions }

/** The store stays here: components read the state through the hooks below */
const useNotesSettingsStore = create<NotesSettingsStore>()(
  persist(
    (set) => ({
      enabled: false,
      showClosed: false,
      actions: {
        setEnabled: (enabled) => set({ enabled }),
        setShowClosed: (showClosed) => set({ showClosed }),
      },
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

/** The stored choice of the notes switch: the default for the next visit (shown.ts) */
export const useStoredNotesOn = (): boolean => useNotesSettingsStore((state) => state.enabled)

/** Whether closed notes are listed too */
export const useShowClosedNotes = (): boolean => useNotesSettingsStore((state) => state.showClosed)

/** The actions of the settings. They never change, so a component that takes them re-renders for nothing else. */
export const useNotesSettingsActions = (): NotesSettingsActions =>
  useNotesSettingsStore((state) => state.actions)

/**
 * Client state of the notes view. No server data here: the notes are in the query cache (query.ts).
 * No map object either: the map layer reads `focus` and moves the map itself.
 */
type NotesSession = {
  /** The map's box and its zoom in OSM terms (see `toOsmZoom` in maid-core), or null without a map */
  view: { bbox: Bbox; zoom: number } | null
  /** Whether the notice of a list cut at the limit is shown for the view that has one */
  noticeShown: boolean
  /** The chosen note's id (the dock shows it) */
  chosen: number | null
  /** A request to move the map to the chosen note. A new object for each request, so each one is acted on once. */
  focus: { id: number } | null
  /**
   * A request to turn the notes switch on: a note chosen by a link does that, as iD's layer does (context.ts,
   * `moveToNote`). A new object for each request. The map layer acts on it and clears it (`clearTurnOn`).
   */
  turnOn: { at: number } | null
}

/** The events of the notes view. The object never changes. */
export type NotesSessionActions = {
  setView: (view: NotesSession['view']) => void
  setNoticeShown: (shown: boolean) => void
  /** Chooses a note by id, without moving the map (a click on its marker) */
  choose: (id: number | null) => void
  /** Chooses a note and asks the map to move to it (a click in the panel's list) */
  focusOn: (id: number) => void
  requestTurnOn: () => void
  clearTurnOn: () => void
}

type NotesSessionStore = NotesSession & { actions: NotesSessionActions }

/** The store stays here: components read the state through the hooks below, code outside React through the wrappers */
const useNotesSessionStore = create<NotesSessionStore>()((set) => ({
  view: null,
  noticeShown: false,
  chosen: null,
  focus: null,
  turnOn: null,
  actions: {
    setView: (view) => set({ view }),
    setNoticeShown: (noticeShown) => set({ noticeShown }),
    choose: (chosen) => set({ chosen }),
    focusOn: (id) => set({ chosen: id, focus: { id } }),
    requestTurnOn: () => set({ turnOn: { at: Date.now() } }),
    clearTurnOn: () => set({ turnOn: null }),
  },
}))

/** The map's box and zoom, or null while there is no map */
export const useMapView = (): NotesSession['view'] => useNotesSessionStore((state) => state.view)

/** Whether the notice of a cut list is shown for the view that has one */
export const useNoticeShown = (): boolean => useNotesSessionStore((state) => state.noticeShown)

/** Whether a note is chosen, for the dock's tab (`DockView.available`, outside React) */
export const chosenNoteState = {
  get: () => useNotesSessionStore.getState().chosen !== null,
  subscribe: (listener: () => void) => useNotesSessionStore.subscribe(listener),
}

/** The chosen note's id, or null */
export const useChosenNoteId = (): number | null => useNotesSessionStore((state) => state.chosen)

/** The request to move the map to a note (a new object for each request) */
export const useNotesFocus = (): NotesSession['focus'] =>
  useNotesSessionStore((state) => state.focus)

/** The request to turn the notes switch on, or null */
export const useNotesTurnOn = (): NotesSession['turnOn'] =>
  useNotesSessionStore((state) => state.turnOn)

/** The actions of the notes view. They never change. */
export const useNotesSessionActions = (): NotesSessionActions =>
  useNotesSessionStore((state) => state.actions)

/** The actions for code outside React (the note selection, the map's event listeners). The object never changes. */
export const notesSessionActions: NotesSessionActions = useNotesSessionStore.getState().actions

/** The state of the notes view as it is now, for code outside React. A snapshot: it does not change after the read. */
export function notesSessionState(): Readonly<NotesSession> {
  return useNotesSessionStore.getState()
}

/** Calls the listener when the chosen note changes (not on a change that keeps it). Returns the unsubscribe. */
export function subscribeChosenNote(listener: (id: number | null) => void): () => void {
  return useNotesSessionStore.subscribe((state, before) => {
    if (state.chosen !== before.chosen) listener(state.chosen)
  })
}

/** Clears the request and choice state of the notes view. For the tests, which share one module state. */
export function resetNotesSession(): void {
  useNotesSessionStore.setState({ chosen: null, focus: null, turnOn: null })
}
