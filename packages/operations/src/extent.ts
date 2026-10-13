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

/**
 * True when the features with this extent are mostly outside the view: less than 80 % of them in
 * view. Never true without a view extent, or without a position to measure.
 */
export function isTooLarge(extent: Extent | undefined, context: OperationContext): boolean {
  if (extent === undefined || context.viewExtent === undefined) return false
  return percentContainedIn(extent, context.viewExtent) < MIN_SHARE_IN_VIEW
}
