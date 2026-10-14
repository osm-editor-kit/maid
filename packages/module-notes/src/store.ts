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

/**
 * Client state of the notes view. No server data here: the notes are in the query cache (query.ts).
 * No map object either: the map layer reads `focus` and moves the map itself.
 */
type Session = {
  /** The map's box and its zoom in OSM terms (see `osmZoomOf`), or null without a map */
  view: { bbox: Bbox; zoom: number } | null
  /** Whether the notice of a list cut at the limit is shown for the view that has one */
  noticeShown: boolean
  /** The chosen note's id (the dock shows it) */
  chosen: number | null
  /** A request to move the map to the chosen note. A new object for each request, so each one is acted on once. */
  focus: { id: number } | null
  setView: (view: Session['view']) => void
  setNoticeShown: (shown: boolean) => void
  /** Chooses a note by id, without moving the map (a click on its marker) */
  choose: (id: number | null) => void
  /** Chooses a note and asks the map to move to it (a click in the panel's list) */
  focusOn: (id: number) => void
}

export const useNotesSession = create<Session>()((set) => ({
  view: null,
  noticeShown: false,
  chosen: null,
  focus: null,
  setView: (view) => set({ view }),
  setNoticeShown: (noticeShown) => set({ noticeShown }),
  choose: (chosen) => set({ chosen }),
  focusOn: (id) => set({ chosen: id, focus: { id } }),
}))
