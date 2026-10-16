/**
 * Pure geometry of the three-click rectangle. Clicks A and B give the wall, C sets the depth.
 * Everything is computed in spherical Web Mercator metres, where angles on the map are true angles.
 * Doing the maths in lon/lat degrees would skew right angles by cos(lat).
 */

/** [lon, lat] in degrees. */
export type Loc = [number, number]

type Point = { x: number; y: number }

const EARTH_RADIUS = 6378137
const DEG = Math.PI / 180

/** Walls shorter than this (Mercator metres) count as no wall. */
const MIN_WALL = 1e-9

/** Preview guard: the pointer must be at least this far from the wall, in screen pixels. */
export const MIN_DEPTH_PX = 16

/** Spherical Web Mercator, in metres. */
function project(loc: Loc): Point {
  return {
    x: EARTH_RADIUS * loc[0] * DEG,
    y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (loc[1] * DEG) / 2)),
  }
}

/** Inverse of `project`. */
function unproject(p: Point): Loc {
  return [
    p.x / EARTH_RADIUS / DEG,
    (2 * Math.atan(Math.exp(p.y / EARTH_RADIUS)) - Math.PI / 2) / DEG,
  ]
}

/** Unit left normal of a to b, or undefined when a and b are (almost) the same point. */
function leftNormal(a: Point, b: Point): { nx: number; ny: number } | undefined {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < MIN_WALL) return undefined
  return { nx: -dy / len, ny: dx / len }
}

/** Signed distance of p from the line a to b, positive on the left of a to b. Zero when a equals b. */
function signedDepth(a: Point, b: Point, p: Point): number {
  const normal = leftNormal(a, b)
  if (!normal) return 0
  return (p.x - a.x) * normal.nx + (p.y - a.y) * normal.ny
}

/**
 * The two far corners of the rectangle on the side of C. The ring is A, B, E, D.
 * Returns undefined when A equals B, when C is on the wall, or when C is closer to the wall than minDepthMetres.
 * Only the distance of C from the wall counts, so moving C along the wall keeps the same corners.
 */
export function rectangleCorners(
  a: Loc,
  b: Loc,
  c: Loc,
  minDepthMetres = 0,
): { d: Loc; e: Loc; depth: number } | undefined {
  const pa = project(a)
  const pb = project(b)
  const normal = leftNormal(pa, pb)
  if (!normal) return undefined
  const depth = signedDepth(pa, pb, project(c))
  if (depth === 0 || Math.abs(depth) <= minDepthMetres) return undefined
  const shift = (p: Point): Loc =>
    unproject({ x: p.x + normal.nx * depth, y: p.y + normal.ny * depth })
  return { d: shift(pa), e: shift(pb), depth }
}

/**
 * Signed distance of c from the line a to b, in screen pixels, with the same formula as `rectangleCorners`.
 * With screen y pointing down the sign is mirrored relative to the map; the preview guard uses only the size.
 * Zero when a equals b.
 */
export function screenDepth(a: Point, b: Point, c: Point): number {
  return signedDepth(a, b, c)
}
