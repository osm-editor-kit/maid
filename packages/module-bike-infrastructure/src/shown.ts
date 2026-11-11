/**
 * Whether the bicycle infrastructure is drawn. It is the default look of the bicycle editor: drawn while no lens is on
 * (`lens=none` as well) and while the lens "Bicycle infrastructure" is on (which adds the legend and dims the rest). A
 * lens for another theme (surface, lit) hides it, so that lens's colours are the only ones on the map.
 * Kept outside React so that the lens choice can set it without a module dependency (the parking module does the same).
 */
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

/** The part of the lens choice that is read: `lensChoice` of the lenses module has this shape */
export type LensSource = {
  getActiveId: () => string | null
  subscribe: (listener: () => void) => () => void
}

/** Whether a lens id shows the bicycle infrastructure: no lens, or this module's lens */
export function showsBikeInfra(activeId: string | null) {
  return activeId === null || activeId === BIKE_LENS_ID
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
