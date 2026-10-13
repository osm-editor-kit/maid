// The extent of features and the share of it that is in view, for the `too_large` rule: an
// operation refuses a feature that is mostly outside the map. Ported from iD's geoExtent
// (percentContainedIn, utilTotalExtent) and Rapid's Extent, both 0.8 (ISC, © iD and Rapid contributors).
// Plain numbers, not the model's Extent class: this package depends on maid-model only.
import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { Extent, OperationContext } from './types.ts'

/** iD's and Rapid's threshold: an operation needs at least this share of the feature in view. Exactly this share is allowed. */
export const MIN_SHARE_IN_VIEW = 0.8

/** The rectangle that contains both: iD's extent.extend */
function union(a: Extent | undefined, b: Extent | undefined): Extent | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])],
  }
}

/** The extent of one node (a point) or of a way and of a relation, as iD's entity.extent(graph). Undefined without positions. */
export function entityExtent(
  entity: OsmEntity,
  graph: Graph,
  seen = new Set<string>(),
): Extent | undefined {
  if (entity instanceof OsmNode) {
    const loc = entity.loc
    return loc ? { min: [loc[0], loc[1]], max: [loc[0], loc[1]] } : undefined
  }
  if (seen.has(entity.id)) return undefined
  seen.add(entity.id)
  if (entity instanceof OsmWay) {
    let extent: Extent | undefined
    for (const nodeID of entity.nodes) {
      const node = graph.hasEntity(nodeID)
      if (node) extent = union(extent, entityExtent(node, graph, seen))
    }
    return extent
  }
  if (entity instanceof OsmRelation) {
    let extent: Extent | undefined
    for (const member of entity.members) {
      const child = graph.hasEntity(member.id)
      if (child) extent = union(extent, entityExtent(child, graph, seen))
    }
    return extent
  }
  return undefined
}

/** The extent of several features together: iD's utilTotalExtent. Undefined when none of them has a position. */
export function selectionExtent(ids: readonly string[], graph: Graph): Extent | undefined {
  let extent: Extent | undefined
  for (const id of ids) {
    const entity = graph.hasEntity(id)
    if (entity) extent = union(extent, entityExtent(entity, graph))
  }
  return extent
}

/** The area of a rectangle; 0 for a point or a line */
function area(extent: Extent) {
  return Math.abs((extent.max[0] - extent.min[0]) * (extent.max[1] - extent.min[1]))
}

/** Whether `outer` contains `inner`, edges included */
function contains(outer: Extent, inner: Extent) {
  return (
    outer.min[0] <= inner.min[0] &&
    outer.min[1] <= inner.min[1] &&
    inner.max[0] <= outer.max[0] &&
    inner.max[1] <= outer.max[1]
  )
}

/**
 * The part of `inner` that lies in `outer`, by area, as a fraction from 0 to 1 (iD's
 * percentContainedIn). A point or a line has no area: it counts as all in when it lies in `outer`.
 */
export function percentContainedIn(inner: Extent, outer: Extent): number {
  const width = Math.min(inner.max[0], outer.max[0]) - Math.max(inner.min[0], outer.min[0])
  const height = Math.min(inner.max[1], outer.max[1]) - Math.max(inner.min[1], outer.min[1])
  const shared = width < 0 || height < 0 ? 0 : width * height
  const whole = area(inner)
  if (shared === 0 || whole === 0) return contains(outer, inner) ? 1 : 0
  return shared / whole
}

type Point = [number, number]

/** Twice the signed area of the triangle a, b, c: positive when c is left of the line from a to b */
function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/** The sides of a polygon, each as its two corners: from a corner to the next, the last to the first */
function sides(polygon: readonly Point[]): [Point, Point][] {
  return polygon.map((a, i): [Point, Point] => [a, polygon[(i + 1) % polygon.length] ?? a])
}

/** The corners of a polygon, counter-clockwise (a copy): either winding may come in */
function counterClockwise(polygon: readonly Point[]): Point[] {
  const twice = sides(polygon).reduce((sum, [a, b]) => sum + a[0] * b[1] - b[0] * a[1], 0)
  return twice < 0 ? [...polygon].reverse() : [...polygon]
}

/** Sutherland-Hodgman: the part of a convex polygon `subject` on the left of, or on, the side a to b */
function clipToHalfPlane(subject: Point[], [a, b]: [Point, Point]): Point[] {
  const out: Point[] = []
  for (const [p, q] of sides(subject)) {
    const dp = cross(a, b, p)
    const dq = cross(a, b, q)
    if (dp >= 0) out.push(p)
    if (dp >= 0 !== dq >= 0) {
      // on a side that is vertical or horizontal (a view box) the crossing keeps that coordinate exactly
      const t = dp / (dp - dq)
      const x = a[0] === b[0] ? a[0] : p[0] + t * (q[0] - p[0])
      const y = a[1] === b[1] ? a[1] : p[1] + t * (q[1] - p[1])
      out.push([x, y])
    }
  }
  return out
}

/** The area of a polygon, by the shoelace formula measured from its first corner */
function polygonArea(polygon: Point[]): number {
  const origin: Point = polygon[0] ?? [0, 0]
  const twice = sides(polygon).reduce(
    (sum, [a, b]) =>
      sum + (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1]),
    0,
  )
  return Math.abs(twice) / 2
}

/**
 * The part of `inner` that lies in a convex polygon, by area, as a fraction from 0 to 1: the same
 * share as `percentContainedIn` when the polygon is the rectangle `outer`. The polygon is the
 * view's footprint in lon/lat, its corners in either order; under a turn it is not a box. The
 * feature's box is clipped to the polygon. A point or a line has no area: it counts as all in
 * view when all its corners lie in the polygon, edges included.
 */
export function percentInPolygon(inner: Extent, polygon: readonly Point[]): number {
  const view = counterClockwise(polygon)
  const corners: Point[] = [
    [inner.min[0], inner.min[1]],
    [inner.max[0], inner.min[1]],
    [inner.max[0], inner.max[1]],
    [inner.min[0], inner.max[1]],
  ]
  const whole = area(inner)
  if (whole === 0) {
    const inside = corners.every((c) => sides(view).every(([a, b]) => cross(a, b, c) >= 0))
    return inside ? 1 : 0
  }
  let shape = corners
  for (const side of sides(view)) {
    shape = clipToHalfPlane(shape, side)
    if (shape.length === 0) break
  }
  return polygonArea(shape) / whole
}

/**
 * True when the features with this extent are mostly outside the view: less than 80 % of them in
 * view. The view is `viewPolygon` when the context has one (a turned map), else `viewExtent`.
 * Never true without a view, or without a position to measure.
 */
export function isTooLarge(extent: Extent | undefined, context: OperationContext): boolean {
  if (extent === undefined) return false
  if (context.viewPolygon !== undefined) {
    return percentInPolygon(extent, context.viewPolygon) < MIN_SHARE_IN_VIEW
  }
  if (context.viewExtent === undefined) return false
  return percentContainedIn(extent, context.viewExtent) < MIN_SHARE_IN_VIEW
}

/**
 * Whether every one of these features is new: not saved yet, so its id has a minus (`n-1`, `w-3`).
 * A feature that is not in the graph is not new. False for no features.
 */
export function allNew(ids: readonly string[], graph: Graph): boolean {
  return ids.length > 0 && ids.every((id) => graph.hasEntity(id)?.isNew() === true)
}

/**
 * The `too_large` test as an edit runs it, with Rapid's exemption: Rapid's operations check
 * `!isNew && tooLarge()`, so a feature that is new (not saved yet) is never too large. Here the
 * selection and the features whose extent is measured must all be new for that. `measured`
 * defaults to the selection; straighten and disconnect measure other features (their extent IDs).
 * No power-user switch: Rapid's `poweruser.allowLargeEdits` is not adopted (README).
 */
export function isTooLargeToEdit(
  context: OperationContext,
  measured: readonly string[] = context.selected,
): boolean {
  if (allNew([...context.selected, ...measured], context.graph)) return false
  return isTooLarge(selectionExtent(measured, context.graph), context)
}
