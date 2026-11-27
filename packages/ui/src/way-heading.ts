import { useEffect } from 'react'
import { create } from 'zustand'

/** The store is private to this file. Components read the heading with `useWayHeading`; MapView sets it. */
const useWayHeadingStore = create<{ heading: number | undefined }>()(() => ({
  heading: undefined,
}))

/** How many components read the heading now, and who wants to know when the first one comes (`onWayHeadingWanted`) */
let readers = 0
let wanted: (() => void) | undefined

/**
 * The selected way's direction on screen, in whole degrees clockwise from the screen's up, in its drawing direction:
 * the main direction of the part inside the map's view (the engine's selectedWayHeading). Undefined unless exactly one
 * way is selected and some of it is in view. The inspector's side columns turn their line piece with it.
 * Reading it counts as a reader (`wayHeadingWanted`), so the map computes the heading only while somebody shows it.
 */
export function useWayHeading(): number | undefined {
  useEffect(() => {
    readers += 1
    if (readers === 1) wanted?.()
    return () => {
      readers -= 1
      // nobody keeps it up to date now: the next reader starts from "unknown", not from a heading of an earlier view
      if (readers === 0) useWayHeadingStore.setState({ heading: undefined })
    }
  }, [])
  return useWayHeadingStore((state) => state.heading)
}

/** Whether a component shows the heading now. MapView computes it (an engine call per move frame) only then. */
export function wayHeadingWanted(): boolean {
  return readers > 0
}

/**
 * Calls `callback` when the first reader appears, so MapView can compute the heading it skipped while nobody read it.
 * One caller (MapView); returns the function that stops it.
 */
export function onWayHeadingWanted(callback: () => void): () => void {
  wanted = callback
  return () => {
    if (wanted === callback) wanted = undefined
  }
}

/** Sets the selected way's heading on screen. MapView calls it while the map moves and when the selection or data change. */
export function setWayHeading(heading: number | undefined) {
  const next = heading === undefined ? undefined : Math.round(heading) % 360
  if (useWayHeadingStore.getState().heading === next) return
  useWayHeadingStore.setState({ heading: next })
}
