/**
 * Pure geometry of the three-click rectangle. Clicks A and B give the wall, C sets the depth.
 * Everything is computed in spherical Web Mercator metres, where angles on the map are true angles.
 * Doing the maths in lon/lat degrees would skew right angles by cos(lat).
 * Lengths on the ground (groundMetres) are measured as the labels measure them (shared/metres.ts).
 */
import { frameAt, toMetres } from '../shared/metres.ts'

/** [lon, lat] in degrees. */
export type Loc = [number, number]

type Point = { x: number; y: number }

const EARTH_RADIUS = 6378137
const DEG = Math.PI / 180

/** Walls shorter than this (Mercator metres) count as no wall. */
const MIN_WALL = 1e-9

/** With Shift, the wall and the depth are whole numbers of this many metres on the ground (ADR 0011, Tobias 2026-10-17) */
export const ROUND_METRES = 0.1

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
 * The distance between two places on the ground, in metres: the same measure as the size labels (the local metres of
 * the two places), so a length that is rounded here reads as rounded on the map.
 */
export function groundMetres(a: Loc, b: Loc): number {
  const frame = frameAt([a, b])
  const pa = toMetres(frame, a)
  const pb = toMetres(frame, b)
  return Math.hypot(pb.x - pa.x, pb.y - pa.y)
}

/** A length in ground metres, rounded to ROUND_METRES. A length that would round to zero is kept as it is. */
function roundMetres(metres: number): number {
  const rounded = Math.round(metres / ROUND_METRES) * ROUND_METRES
  return rounded > 0 ? rounded : metres
}

/**
 * The end B of a wall that starts at A, moved along the same direction, so that the wall is a whole number of
 * ROUND_METRES on the ground. Used with Shift for a free corner B; a B on a node or a way keeps its place.
 */
export function roundWall(a: Loc, b: Loc): Loc {
  const pa = project(a)
  const pb = project(b)
  if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < MIN_WALL) return b
  const target = roundMetres(groundMetres(a, b))
  const at = (s: number) => unproject({ x: pa.x + (pb.x - pa.x) * s, y: pa.y + (pb.y - pa.y) * s })
  // the ground length is not exactly proportional to the Mercator length: a few steps refine the scale
  let s = 1
  for (let i = 0; i < 4; i++) {
    const metres = groundMetres(a, at(s))
    if (!(metres > 0)) break
    s *= target / metres
  }
  return at(s)
}

/**
 * The two far corners of the rectangle on the side of C. The ring is A, B, E, D.
 * Returns undefined when A equals B, when C is on the wall, or when C is closer to the wall than minDepthMetres.
 * Only the distance of C from the wall counts, so moving C along the wall keeps the same corners.
 * With `roundDepth` (Shift), the depth is a whole number of ROUND_METRES on the ground.
 */
export function rectangleCorners(
  a: Loc,
  b: Loc,
  c: Loc,
  minDepthMetres = 0,
  roundDepth = false,
): { d: Loc; e: Loc; depth: number } | undefined {
  const pa = project(a)
  const pb = project(b)
  const normal = leftNormal(pa, pb)
  if (!normal) return undefined
  let depth = signedDepth(pa, pb, project(c))
  if (depth === 0 || Math.abs(depth) <= minDepthMetres) return undefined
  const shift = (p: Point, by: number): Loc =>
    unproject({ x: p.x + normal.nx * by, y: p.y + normal.ny * by })
  if (roundDepth) {
    // the depth on the ground, from B to the far corner E, as the size label measures it: rounded, then refined
    const groundDepth = (by: number) => groundMetres(b, shift(pb, by))
    const target = roundMetres(groundDepth(depth))
    for (let i = 0; i < 4; i++) {
      const metres = groundDepth(depth)
      if (!(metres > 0)) break
      depth *= target / metres
    }
  }
  return { d: shift(pa, depth), e: shift(pb, depth), depth }
}

/**
 * Signed distance of c from the line a to b, in screen pixels, with the same formula as `rectangleCorners`.
 * With screen y pointing down the sign is mirrored relative to the map; the preview guard uses only the size.
 * Zero when a equals b.
 */
export function screenDepth(a: Point, b: Point, c: Point): number {
  return signedDepth(a, b, c)
}
