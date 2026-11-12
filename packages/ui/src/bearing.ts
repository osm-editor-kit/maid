import { create } from 'zustand'

interface BearingActions {
  /** Sets the map's turn. MapView calls it when the map loads and while it turns. */
  set: (bearing: number) => void
  /** Sets the map's tilt. MapView calls it when the map loads and while it tilts. */
  setPitch: (pitch: number) => void
}

/** The store is private to this file. Components read the turn with `useBearing` and change it with `setBearing`. */
const useBearingStore = create<{ bearing: number; pitch: number; actions: BearingActions }>()(
  (set) => ({
    bearing: 0,
    pitch: 0,
    actions: {
      set: (bearing) => set({ bearing }),
      setPitch: (pitch) => set({ pitch }),
    },
  }),
)

/**
 * The map's turn in degrees, as the map reports it while it moves: the compass button shows while
 * it is not zero and turns its needle with it. MapView writes it; it is not stored (the last
 * position in the settings keeps the turn).
 */
export function useBearing(): number {
  return useBearingStore((state) => state.bearing)
}

/** Sets the map's turn. MapView calls it when the map loads and while it turns. */
export function setBearing(bearing: number) {
  useBearingStore.getState().actions.set(bearing)
}

/**
 * The map's tilt in degrees (0 is flat). The compass shows while it is not zero either, so that a tilted map (an editor
 * that allows it, e.g. the terrain module's 3D view) always has the way back to the flat, north-up view.
 */
export function usePitch(): number {
  return useBearingStore((state) => state.pitch)
}

/** Sets the map's tilt. MapView calls it when the map loads and while it tilts. */
export function setPitch(pitch: number) {
  useBearingStore.getState().actions.setPitch(pitch)
}
