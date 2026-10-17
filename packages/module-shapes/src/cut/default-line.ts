/**
 * The default cut line of an area: straight across its middle, perpendicular to its long axis, with both ends outside
 * the outline, so the person sees both handles and moves them. Pure: positions in, the two ends out.
 */
import { OsmNode, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { frameAt, toLoc, toMetres, type Loc } from '../shared/metres.ts'
import { distance, dot, item, sub, type Pt } from '../shared/vector.ts'
import type { Line } from './line.ts'

/** Each end reaches this fraction of the outline's width beyond it, and at least MIN_REACH metres */
const REACH = 0.15
const MIN_REACH = 3
/** A corner counts as a right angle when the cosine of its angle is below this (about one degree off) */
const RIGHT_ANGLE = 0.02
/**
 * A side is longer only when it is longer by this fraction (a tenth of a per cent): the sides of a square differ by
 * rounding of the projection, so the first of them wins
 */
const LONGER_BY = 1e-3

/**
 * The default line of a way. Nothing when the way has no outline: a node is missing, or the way is not a way.
 * @param   graph - The graph that holds the way
 * @param   wayId - The closed way (for a multipolygon, its outer way)
 * @return  The two ends, or undefined
 */
export function defaultLine(graph: Graph, wayId: string): Line | undefined {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return undefined
  const outline: Loc[] = []
  for (const id of way.nodes.slice(0, -1)) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    outline.push(node.loc)
  }
  return lineAcross(outline)
}

/**
 * The default line across an outline, given by its positions without the closing repeat.
 *
 * The long axis is the longest side for a rectangle (four right angles), and the principal axis of the area for any other
 * shape. The line is perpendicular to it and goes through the area's centre. Each end lies beyond the outline by
 * REACH of its width, and at least MIN_REACH metres. For a convex shape the line then crosses the outline exactly twice.
 * @param   outline - The corners of the area, at least three
 * @return  The two ends as [lon, lat], or undefined for an area with no size
 */
export function lineAcross(outline: readonly Loc[]): Line | undefined {
  if (outline.length < 3) return undefined
  // metres around the outline's mean position: the same frame the cut plan uses for the same outline
  const frame = frameAt(outline)
  const ring = outline.map((loc) => toMetres(frame, loc))
  const shape = momentsOf(ring)
  if (!(shape.area > 0)) return undefined

  const long = isRectangle(ring) ? longestSide(ring) : principalAxis(shape)
  // a unit vector across the area, perpendicular to the long axis
  const across = { x: -long.y, y: long.x }
  const centre: Pt = { x: shape.cx, y: shape.cy }
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const corner of ring) {
    const along = dot(sub(corner, centre), across)
    low = Math.min(low, along)
    high = Math.max(high, along)
  }
  const reach = Math.max((high - low) * REACH, MIN_REACH)
  const end = (along: number): Loc =>
    toLoc(frame, { x: centre.x + across.x * along, y: centre.y + across.y * along })
  return [end(low - reach), end(high + reach)]
}

/**
 * The area of a ring, its centroid and its second moments about the centroid (the integrals of x², y² and xy over the area),
 * in metres. The moments are correct for either winding of the ring.
 */
function momentsOf(ring: readonly Pt[]) {
  let twice = 0
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumYY = 0
  let sumXY = 0
  for (let i = 0; i < ring.length; i++) {
    const p = item(ring, i)
    const q = item(ring, (i + 1) % ring.length)
    // the cross product of the edge's ends: each sum below is the sum over the edges of this term times it
    const cross = p.x * q.y - q.x * p.y
    twice += cross
    sumX += (p.x + q.x) * cross
    sumY += (p.y + q.y) * cross
    sumXX += (p.x * p.x + p.x * q.x + q.x * q.x) * cross
    sumYY += (p.y * p.y + p.y * q.y + q.y * q.y) * cross
    sumXY += (p.x * q.y + 2 * p.x * p.y + 2 * q.x * q.y + q.x * p.y) * cross
  }
  // the sums carry the sign of the winding; the same sign makes the area and the moments positive
  const sign = twice < 0 ? -1 : 1
  const area = Math.abs(twice) / 2
  const cx = sumX / (3 * twice)
  const cy = sumY / (3 * twice)
  return {
    area,
    cx,
    cy,
    xx: sign * (sumXX / 12) - area * cx * cx,
    yy: sign * (sumYY / 12) - area * cy * cy,
    xy: sign * (sumXY / 24) - area * cx * cy,
  }
}

/** The direction of the principal axis: where the area is spread most, as a unit vector */
function principalAxis(shape: { xx: number; yy: number; xy: number }): Pt {
  const angle = 0.5 * Math.atan2(2 * shape.xy, shape.xx - shape.yy)
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/** Whether the ring has four corners, each a right angle */
function isRectangle(ring: readonly Pt[]): boolean {
  if (ring.length !== 4) return false
  return ring.every((corner, i) => {
    const before = item(ring, (i + ring.length - 1) % ring.length)
    const after = item(ring, (i + 1) % ring.length)
    const cosine = dot(sub(corner, before), sub(after, corner))
    return Math.abs(cosine) <= RIGHT_ANGLE * distance(corner, before) * distance(after, corner)
  })
}

/** The direction of the longest side, as a unit vector. The first of equally long sides wins. */
function longestSide(ring: readonly Pt[]): Pt {
  let best: Pt = { x: 1, y: 0 }
  let bestLength = 0
  for (let i = 0; i < ring.length; i++) {
    const from = item(ring, i)
    const to = item(ring, (i + 1) % ring.length)
    const length = distance(from, to)
    if (length > bestLength * (1 + LONGER_BY)) {
      bestLength = length
      best = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
    }
  }
  return best
}
