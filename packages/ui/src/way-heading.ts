import { create } from 'zustand'

/** The store is private to this file. Components read the heading with `useWayHeading`; MapView sets it. */
const useWayHeadingStore = create<{ heading: number | undefined }>()(() => ({
  heading: undefined,
}))

/**
 * The selected way's direction on screen, in whole degrees clockwise from the screen's up, in its drawing direction:
 * the main direction of the part inside the map's view (the engine's selectedWayHeading). Undefined unless exactly one
 * way is selected and some of it is in view. The inspector's side columns turn their line piece with it.
 */
export function useWayHeading(): number | undefined {
  return useWayHeadingStore((state) => state.heading)
}

/** Sets the selected way's heading on screen. MapView calls it while the map moves and when the selection or data change. */
export function setWayHeading(heading: number | undefined) {
  const next = heading === undefined ? undefined : Math.round(heading) % 360
  if (useWayHeadingStore.getState().heading === next) return
  useWayHeadingStore.setState({ heading: next })
}
