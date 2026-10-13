/**
 * Whether the parking sides are drawn, and whether the gap check is on. Kept outside React so that the lens (or the
 * app) can set it without a module dependency: `connectParkingSides(useLensStore)` in the app's config, once.
 * The layers are drawn only while the parking lens is the active one (the default).
 */
import { useSyncExternalStore } from 'react'

export type ParkingSidesState = { shown: boolean; showMissing: boolean }

const holder: { state: ParkingSidesState; listeners: Set<() => void> } = {
  state: { shown: false, showMissing: false },
  listeners: new Set(),
}

/** Sets part of the state; the listeners run only when a value changed */
export function setParkingSides(next: Partial<ParkingSidesState>) {
  const state = { ...holder.state, ...next }
  if (state.shown === holder.state.shown && state.showMissing === holder.state.showMissing) return
  holder.state = state
  for (const listener of holder.listeners) listener()
}

function subscribe(listener: () => void) {
  holder.listeners.add(listener)
  return () => {
    holder.listeners.delete(listener)
  }
}

/** The state outside React */
export function getParkingSides(): ParkingSidesState {
  return holder.state
}

/** The state, for components. Changes only when a value changes. */
export function useParkingSides(): ParkingSidesState {
  return useSyncExternalStore(subscribe, getParkingSides)
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
