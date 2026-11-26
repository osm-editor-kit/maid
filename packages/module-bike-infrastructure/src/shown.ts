/**
 * Whether the bicycle infrastructure is drawn. It belongs to the editor's own style, the lens "Bicycle infrastructure":
 * drawn only while that lens is the active one. Maid standard (no lens, `lens=none`) and the lens of another theme
 * (surface, lit) do not show it, so their colours are the only ones on the map (Tobias, 2026-11-26).
 * Kept outside React so that the lens choice can set it without a module dependency (the parking module does the same).
 */
import type { LensSource } from '@osm-editor-kit/maid-style'
import { create } from 'zustand'

/** The id of the lens of this module (lens.ts) */
export const BIKE_LENS_ID = 'bike-infrastructure'

interface ShownActions {
  set: (shown: boolean) => void
}

/** The store is private to this file: components read it through the hook, the connection sets it */
const useShownStore = create<{ shown: boolean; actions: ShownActions }>()((set, get) => ({
  shown: false,
  actions: {
    set: (shown) => {
      if (get().shown !== shown) set({ shown })
    },
  },
}))

/** Whether the bicycle infrastructure is drawn */
export function useBikeInfraShown(): boolean {
  return useShownStore((state) => state.shown)
}

/** The state outside React, for tests */
export function bikeInfraShown(): boolean {
  return useShownStore.getState().shown
}

/** Whether a lens id shows the bicycle infrastructure: this module's lens only, not Maid standard (`null`) */
export function showsBikeInfra(activeId: string | null) {
  return activeId === BIKE_LENS_ID
}

/**
 * Draws the bicycle infrastructure while `showsBikeInfra` holds for the active lens; always, without a lens choice.
 * Returns a function that stops the connection and hides it.
 */
export function connectBikeInfra(lenses: LensSource | undefined): () => void {
  const { set } = useShownStore.getState().actions
  if (!lenses) {
    set(true)
    return () => set(false)
  }
  const apply = () => set(showsBikeInfra(lenses.getActiveId()))
  apply()
  const stop = lenses.subscribe(apply)
  return () => {
    stop()
    set(false)
  }
}
