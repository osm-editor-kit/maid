/**
 * Pure screen-pixel geometry for drawing a room into a building: where the pointer lands on a wall, how it snaps to an
 * angle, and where the guides meet the walls. Points are screen pixels with y pointing down. A ring is its corners
 * without the closing repeat: edge i runs from ring[i] to ring[(i + 1) % n].
 */
import { add, cross, distance, dot, item, sub, type Pt } from '../shared/vector.ts'

/** Relative tolerance for "parallel": a cross product below this share of the two lengths counts as zero */
const PARALLEL_SHARE = 1e-12

/** Slack on the edge parameter, so a ray that meets a corner exactly still counts as meeting that edge */
const EDGE_SLACK = 1e-9

/**
 * Clamps a number to the range 0 to 1.
 * @param   value - The number
 * @return  The number, not below 0 and not above 1
 */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * The nearest place on the ring's edges to p, if within tolerance pixels. u: 0..1 along edge i.
 * At a corner the two edges give the same place; the earlier edge (the one that ends at the corner, with u = 1) is returned.
 * A zero-length edge counts as its single point, with u = 0.
 * @param   p         - The point to find the wall for, in screen pixels
 * @param   ring      - The corners of the ring, without the closing repeat
 * @param   tolerance - The largest distance from p that still counts, in pixels
 * @return  The place on the wall (at), its edge index, the position along that edge (u), and the distance from p; or
 *          undefined when no edge is within tolerance
 */
export function nearestOnRing(
  p: Pt,
  ring: readonly Pt[],
  tolerance: number,
): { at: Pt; edge: number; u: number; distance: number } | undefined {
  let best: { at: Pt; edge: number; u: number; distance: number } | undefined
  for (let edge = 0; edge < ring.length; edge++) {
    const start = item(ring, edge)
    const end = item(ring, (edge + 1) % ring.length)
    const along = sub(end, start)
    const lengthSquared = dot(along, along)
    // the place on the edge's line nearest to p, kept on the edge itself
    const u = lengthSquared === 0 ? 0 : clampUnit(dot(sub(p, start), along) / lengthSquared)
    const at = add(start, { x: along.x * u, y: along.y * u })
    const separation = distance(p, at)
    if (separation <= tolerance && (best === undefined || separation < best.distance)) {
      best = { at, edge, u, distance: separation }
    }
  }
  return best
}

/**
 * The unit vector of edge i (ring[i] to ring[i+1]). A zero-length edge gives { x: 1, y: 0 }.
 * @param   ring - The corners of the ring, without the closing repeat
 * @param   edge - The edge index, from 0 to ring.length - 1
 * @return  The unit direction of the edge
 */
export function edgeDirection(ring: readonly Pt[], edge: number): Pt {
  const start = item(ring, edge)
  const end = item(ring, (edge + 1) % ring.length)
  const along = sub(end, start)
  const length = Math.hypot(along.x, along.y)
  if (length === 0) return { x: 1, y: 0 }
  return { x: along.x / length, y: along.y / length }
}

/**
 * Angle snap: keeps the pointer's distance from `from` and turns the direction to the nearest multiple of stepDegrees
 * measured from the direction of `reference` (any vector, not necessarily unit). Returns `from` when pointer equals from.
 * A zero reference counts as the x axis. A step that is not above zero gives the pointer back unchanged.
 * @param   from        - The fixed end of the segment, in screen pixels
 * @param   pointer     - Where the pointer is
 * @param   reference   - The direction the angles are measured from, for example the previous wall
 * @param   stepDegrees - The angle step in degrees, for example 45 or 10
 * @return  The snapped end point, at the same distance from `from` as the pointer
 */
export function snapAngle(from: Pt, pointer: Pt, reference: Pt, stepDegrees: number): Pt {
  if (!(stepDegrees > 0)) return pointer
  const offset = sub(pointer, from)
  const radius = Math.hypot(offset.x, offset.y)
  if (radius === 0) return from
  const step = (stepDegrees * Math.PI) / 180
  const referenceAngle = Math.atan2(reference.y, reference.x)
  const angleFromReference = Math.atan2(offset.y, offset.x) - referenceAngle
  const snapped = referenceAngle + Math.round(angleFromReference / step) * step
  return { x: from.x + radius * Math.cos(snapped), y: from.y + radius * Math.sin(snapped) }
}

/**
 * The nearest place where the ray from `from` in direction `direction` meets an edge of the ring, farther than minDistance
 * pixels. The direction need not be a unit vector; the distance is measured in pixels from `from`. A zero direction, an
 * edge parallel to the ray and a hit behind `from` give no hit.
 * @param   from        - Where the ray starts, in screen pixels
 * @param   direction   - The direction of the ray
 * @param   ring        - The corners of the ring, without the closing repeat
 * @param   minDistance - Hits this close to `from` are skipped, so a ray that starts on a wall does not hit that wall
 * @return  The hit (at), its edge index and its distance from `from`; or undefined when the ray meets no edge
 */
export function rayHit(
  from: Pt,
  direction: Pt,
  ring: readonly Pt[],
  minDistance = 0.5,
): { at: Pt; edge: number; distance: number } | undefined {
  const directionLength = Math.hypot(direction.x, direction.y)
  if (directionLength === 0) return undefined
  let best: { at: Pt; edge: number; distance: number } | undefined
  for (let edge = 0; edge < ring.length; edge++) {
    const start = item(ring, edge)
    const end = item(ring, (edge + 1) % ring.length)
    const along = sub(end, start)
    const denominator = cross(direction, along)
    // parallel to the edge, or an edge with no length: no single meeting point
    if (Math.abs(denominator) <= PARALLEL_SHARE * directionLength * Math.hypot(along.x, along.y))
      continue
    // solve from + t * direction = start + s * along, with t the ray's parameter and s the place on the edge
    const toStart = sub(start, from)
    const t = cross(toStart, along) / denominator
    const s = cross(toStart, direction) / denominator
    if (t <= 0 || s < -EDGE_SLACK || s > 1 + EDGE_SLACK) continue
    const at = add(from, { x: direction.x * t, y: direction.y * t })
    const separation = distance(from, at)
    if (separation <= minDistance) continue
    if (best === undefined || separation < best.distance) best = { at, edge, distance: separation }
  }
  return best
}

/**
 * The guided end of a room while it is drawn: `points` are the fixed points (points[0] on the wall), `next` the point under
 * the pointer. With at least two fixed points, a ray from `next` in the direction points[1] -> points[0] (back to the wall
 * the room started on), and the place where it meets the ring. Undefined with fewer than two points, a zero direction, or no hit.
 * @param   points - The fixed points of the room so far; points[0] is on the wall the room started on
 * @param   next   - The point under the pointer, in screen pixels
 * @param   ring   - The corners of the ring, without the closing repeat
 * @return  The guided corner on the ring, or undefined
 */
export function guidedClosure(
  points: readonly Pt[],
  next: Pt,
  ring: readonly Pt[],
): Pt | undefined {
  if (points.length < 2) return undefined
  const wall = item(points, 0)
  const previous = item(points, 1)
  return rayHit(next, sub(wall, previous), ring)?.at
}

/**
 * The guide to show while the first segment is drawn: the line through `from` along the direction of `next - from`,
 * from `from` to where it meets the ring again (rayHit), or undefined.
 * @param   from - The start of the first segment, on the wall
 * @param   next - The point under the pointer, in screen pixels
 * @param   ring - The corners of the ring, without the closing repeat
 * @return  Where the guide meets the ring again, or undefined
 */
export function guideToWall(from: Pt, next: Pt, ring: readonly Pt[]): Pt | undefined {
  return rayHit(from, sub(next, from), ring)?.at
}
