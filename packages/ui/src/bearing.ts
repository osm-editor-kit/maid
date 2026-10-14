import { create } from 'zustand'

/** The store stays here: components read the turn through `useBearing`, `setBearing` changes it */
const useBearingStore = create<{ bearing: number }>()(() => ({ bearing: 0 }))

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
  useBearingStore.setState({ bearing })
}
