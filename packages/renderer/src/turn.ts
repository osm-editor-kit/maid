/**
 * Turning the map with the mouse, as Rapid does (.reference/rapid, MapInteractionBehavior.ts, the
 * rotate gesture): a drag with Alt or Control held, started on open map, turns the map around the
 * centre of the view. Pure: the engine calls it on each move (engine.ts `moveTurn`).
 */
import type { Point } from './snap'

/** Degrees of turn per pixel of drag, as Rapid's SPEED */
export const TURN_SPEED = 0.3

/** A press that moves less than this many pixels is a click, not a turn (Rapid's tolerance) */
export const TURN_TOLERANCE = 4

/**
 * The change of bearing for one move of the pointer from `from` to `to`, around `pivot` (the centre
 * of the view), in MapLibre's bearing: degrees, counter-clockwise positive. The map follows the
 * pointer: a move clockwise around the pivot turns the map clockwise, which lowers the bearing.
 * The sign of each pixel of the move depends on which side of the pivot the pointer is, as in Rapid.
 */
export function dragTurn(from: Point, to: Point, pivot: Point): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const sx = to.x > pivot.x ? 1 : -1
  const sy = to.y > pivot.y ? -1 : 1
  // degrees clockwise on the screen, as Rapid counts them
  const clockwise = sy * dx + sx * dy
  // `|| 0` keeps a pointer that did not move at +0 rather than -0
  return -clockwise * TURN_SPEED || 0
}
