/**
 * The map position: which position the map starts at, and which moves of the map are stored as
 * the person's last position. The rule (docs/adr/0009-decisions-of-2026-10-13.md): the URL always
 * wins; the last position is stored while the person moves the map and used only when the URL
 * names no position; a position that came from a link is not stored, the next move by the person is.
 */
import type { Camera } from './params'

/** The position the map starts at: the URL's `map`, else the person's last position, else the fallback */
export function startCamera(layers: {
  url: Camera | null | undefined
  stored: Camera | undefined
  fallback: Camera
}): Camera {
  return layers.url ?? layers.stored ?? layers.fallback
}

/**
 * What moved the map, as far as the map tells it:
 * - `start`: before the map loaded, the camera is set from the start position. Never stored.
 * - `resize`: MapLibre moved the map because its canvas changed size. Not the person's.
 * - `gesture`: a drag, a wheel, a pinch, a double click or a key that MapLibre gives its own event.
 * - `action`: any other move after the map loaded: a zoom control, a key the app turns into a zoom,
 *   or a fit the app makes after a selection. The app makes no other moves on its own, so these
 *   are the person's, or made on the person's behalf.
 */
export type MoveSource = 'start' | 'resize' | 'gesture' | 'action'

/** Classifies a move end. `gesture` is set when the move's event carries MapLibre's `originalEvent`. */
export function moveSource(move: {
  loaded: boolean
  gesture: boolean
  resized: boolean
}): MoveSource {
  if (!move.loaded) return 'start'
  if (move.gesture) return 'gesture'
  if (move.resized) return 'resize'
  return 'action'
}

/** Whether the position at the end of this move is stored as the person's last position */
export function shouldStoreMove(source: MoveSource): boolean {
  return source === 'gesture' || source === 'action'
}
