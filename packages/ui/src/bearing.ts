import { create } from 'zustand'

/**
 * The map's turn in degrees, as the map reports it while it moves: the compass button shows while
 * it is not zero and turns its needle with it. MapView writes it; it is not stored (the last
 * position in the settings keeps the turn).
 */
export const useBearing = create<{ bearing: number }>()(() => ({ bearing: 0 }))
