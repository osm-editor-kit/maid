/**
 * Whether the parking sides are drawn, and whether the gap check is on. Kept outside React so that the lens (or the
 * app) can set it without a module dependency: `connectParkingSides(useLensStore)` in the app's config, once.
 * The layers are drawn only while the parking lens is the active one (the default).
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/shallow'

export type ParkingSidesState = { shown: boolean; showMissing: boolean }

/** A zustand store of its own: the lens sets it through `setParkingSides`, components read `useParkingSides` */
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

/** The state, for components. Changes only when a value changes. */
export function useParkingSides(): ParkingSidesState {
  return useParkingSidesStore(
    useShallow((state) => ({ shown: state.shown, showMissing: state.showMissing })),
  )
}

/** The part of a lens store that connectParkingSides reads: zustand's `useLensStore` has this shape */
export type LensSource = {
  getState: () => { activeId: string | null }
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
  const apply = () => setParkingSides({ shown: lenses.getState().activeId === lensId })
  apply()
  const stop = lenses.subscribe(apply)
  return () => {
    stop()
    setParkingSides({ shown: false })
  }
}
