import { create } from 'zustand'

interface BearingActions {
  /** Sets the map's turn. MapView calls it when the map loads and while it turns. */
  set: (bearing: number) => void
}

/** The store is private to this file. Components read the turn with `useBearing` and change it with `setBearing`. */
const useBearingStore = create<{ bearing: number; actions: BearingActions }>()((set) => ({
  bearing: 0,
  actions: {
    set: (bearing) => set({ bearing }),
  },
}))

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
