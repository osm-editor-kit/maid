import type { DirectionalSide } from './directional-logic.ts'

/** The eight compass points, clockwise from north */
export const COMPASS_POINTS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type CompassPoint = (typeof COMPASS_POINTS)[number]

/** An angle in degrees as 0 ≤ angle < 360 */
export function normaliseDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360
}

/**
 * The direction a side of a way faces, in degrees clockwise from the way's own direction frame: the left side is a
 * quarter turn against the clock from the way's heading, the right side a quarter turn with it. Works for a screen
 * heading (degrees from the screen's up) and for a compass bearing (degrees from north) alike.
 */
export function sideDirection(heading: number, side: DirectionalSide) {
  return normaliseDegrees(heading + (side === 'left' ? -90 : 90))
}

/**
 * The compass bearing of a direction on screen: a direction `screenDegrees` clockwise from the screen's up, on a map
 * turned by `mapBearing` (MapLibre's bearing: the compass direction that is up on the screen). Exact on a flat map; on
 * a tilted map it is close enough for eight compass points.
 */
export function screenToBearing(screenDegrees: number, mapBearing: number) {
  return normaliseDegrees(screenDegrees + mapBearing)
}

/** The nearest of the eight compass points to a bearing (each covers 45°, north from 337.5° to 22.5°) */
export function compassPoint(bearing: number): CompassPoint {
  return COMPASS_POINTS[Math.round(normaliseDegrees(bearing) / 45) % 8]!
}

/**
 * What the column of a side shows: the turn of its line piece on screen and the compass point the side faces. The
 * piece is the way's heading on screen; the side's compass point comes from the side's screen direction and the map's
 * bearing. Undefined without a heading (several features, nothing in view).
 */
export function sideCompass(
  wayHeading: number | undefined,
  mapBearing: number,
  side: DirectionalSide,
): { rotation: number; compass: CompassPoint } | undefined {
  if (wayHeading === undefined) return undefined
  return {
    rotation: normaliseDegrees(wayHeading),
    compass: compassPoint(screenToBearing(sideDirection(wayHeading, side), mapBearing)),
  }
}
