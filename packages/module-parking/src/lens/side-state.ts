/**
 * Whether the parking sides are drawn, and whether the gap check is on. Kept outside React so that the lens (or the
 * app) can set it without a module dependency: `connectParkingSides(lensChoice)` in the app's config, once.
 * The layers are drawn only while the parking lens is the active one (the default).
 */
import { create } from 'zustand'

export type ParkingSidesState = { shown: boolean; showMissing: boolean }

/** A zustand store of its own: the lens sets it through `setParkingSides`, components read it through the hooks below */
const useParkingSidesStore = create<ParkingSidesState>()(() => ({
  shown: false,
  showMissing: false,
}))

/** Sets part of the state; the subscribers run only when a value changed */
export function setParkingSides(next: Partial<ParkingSidesState>) {
  const current = useParkingSidesStore.getState()
  const state = { ...current, ...next }
  if (state.shown === current.shown && state.showMissing === current.showMissing) return
  useParkingSidesStore.setState(state)
}

/** The state outside React */
export function getParkingSides(): ParkingSidesState {
  return useParkingSidesStore.getState()
}

/** Whether the parking sides are drawn (while the parking lens is the active one) */
export function useParkingShown(): boolean {
  return useParkingSidesStore((state) => state.shown)
}

/** Whether the gap check is on: the sides of roads without a parking tag are drawn too */
export function useParkingShowMissing(): boolean {
  return useParkingSidesStore((state) => state.showMissing)
}

/** The part of the lens choice that connectParkingSides reads: `lensChoice` from the lenses module has this shape */
export type LensSource = {
  getActiveId: () => string | null
  subscribe: (listener: () => void) => () => void
}

/**
 * Shows the parking sides while the lens `lensId` (default `parking`) is the active one. Returns a function that stops
 * the connection and hides the sides. `showMissing` turns on the gap check.
 */
export function connectParkingSides(
  lenses: LensSource,
  options: { lensId?: string; showMissing?: boolean } = {},
): () => void {
  const lensId = options.lensId ?? 'parking'
  setParkingSides({ showMissing: options.showMissing ?? false })
  const apply = () => setParkingSides({ shown: lenses.getActiveId() === lensId })
  apply()
  const stop = lenses.subscribe(apply)
  return () => {
    stop()
    setParkingSides({ shown: false })
  }
}
