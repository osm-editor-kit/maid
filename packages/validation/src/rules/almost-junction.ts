import {
  OsmNode,
  OsmWay,
  actionAddMidpoint,
  actionChangeTags,
  actionMergeNodes,
} from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import {
  interpolate,
  nodeLoc,
  segmentIntersection,
  selfIntersects,
  sphericalDistance,
} from '../geo.ts'
import type { Point } from '../geo.ts'
import { hasTag, isInterestingKey } from '../tags.ts'
import type { Tags } from '../tags.ts'
import type { Fix, Issue, Rule, RuleContext } from '../types.ts'
import { routableHighways } from './impossible-oneway.ts'

// Ported from iD's almost_junction (ISC, © iD contributors), at commit 0194f3926. PARTLY BUILT: the
// ways that a road's extension meets are only the ways whose box overlaps the road's own box
// (`context.waysNear`). The extension goes up to 5 m past the road's end, so a crossing outside that
// box is not found: see F-validations-21. The search of the road's own segments (a loop that ends
// close to itself) is complete.

const EXTEND_TH_METERS = 5
const WELD_TH_METERS = 0.75
// From the bounding case of parallel ways
const CLOSE_NODE_TH = EXTEND_TH_METERS - WELD_TH_METERS
// From the bounding case of perpendicular ways
const SIG_ANGLE_TH = Math.atan(WELD_TH_METERS / EXTEND_TH_METERS)

/** A way end that can be joined to a segment, by extending it */
type Connection = {
  /** The node before the tip, which gives the direction of the extension */
  mid: OsmNode
  /** The end of the way that is extended */
  tip: OsmNode
  /** The way that the extension meets: the same way for a loop */
  wayId: string
  /** The segment it meets */
  edge: [string, string]
  crossLoc: Point
}

function isHighway(way: OsmWay) {
  return way.tags.highway !== undefined && routableHighways.has(way.tags.highway)
}

/** Ends tagged as not continuing (iD's isTaggedAsNotContinuing) are not joined */
function isTaggedAsNotContinuing(node: OsmNode) {
  const tags: Tags = node.tags
  return (
    tags.noexit === 'yes' ||
    tags.amenity === 'parking_entrance' ||
    (!!tags.entrance && tags.entrance !== 'no')
  )
}

/** Bridges and tunnels only connect to the same kind, on the same layer and level (iD's canConnectWays) */
function canConnectWays(way: OsmWay, other: OsmWay) {
  if (way.id === other.id) return true
  const bridges = hasTag(way.tags.bridge) || hasTag(other.tags.bridge)
  if (bridges && !(hasTag(way.tags.bridge) && hasTag(other.tags.bridge))) return false
  const tunnels = hasTag(way.tags.tunnel) || hasTag(other.tags.tunnel)
  if (tunnels && !(hasTag(way.tags.tunnel) && hasTag(other.tags.tunnel))) return false
  if ((way.tags.layer || '0') !== (other.tags.layer || '0')) return false
  return (way.tags.level || '0') === (other.tags.level || '0')
}

/** A way end that is not tagged as continuing, that only this way uses, and that is not a loop */
function isExtendableCandidate(node: OsmNode, way: OsmWay, graph: Graph) {
  if (isTaggedAsNotContinuing(node) || graph.parentWays(node).length !== 1) return false
  return way.nodes.filter((id) => id === node.id).length <= 1
}

/** Mercator, as iD's projection: the angle between two points is the one on the map */
function projected(point: Point) {
  const lat = (point[1] * Math.PI) / 360
  return [(point[0] * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + lat))] satisfies Point
}

/** iD's geoAngle: the angle of the line from a to b on the map */
function angleBetween(a: Point, b: Point) {
  const pa = projected(a)
  const pb = projected(b)
  return Math.atan2(pb[1] - pa[1], pb[0] - pa[0])
}

/**
 * The extension of one way end, and the first segment it meets, among the way itself (a loop) and
 * the ways whose box overlaps the way's box.
 */
function connectionFrom(way: OsmWay, endIndex: number, context: RuleContext) {
  const graph = context.graph
  const tipId = way.nodes[endIndex]
  const midId = endIndex === 0 ? way.nodes[1] : way.nodes[way.nodes.length - 2]
  if (!tipId || !midId) return undefined
  const tip = graph.hasEntity(tipId)
  const mid = graph.hasEntity(midId)
  if (!(tip instanceof OsmNode) || !(mid instanceof OsmNode) || !tip.loc || !mid.loc)
    return undefined
  const tipLoc: Point = [tip.loc[0], tip.loc[1]]
  const midLoc: Point = [mid.loc[0], mid.loc[1]]

  // The edge from mid to tip, made EXTEND_TH_METERS longer past the tip
  const edgeLength = sphericalDistance(midLoc, tipLoc)
  if (edgeLength === 0) return undefined
  const extendedTip = interpolate(midLoc, tipLoc, EXTEND_TH_METERS / edgeLength + 1)

  for (const other of [way, ...context.waysNear(way)]) {
    if (!isHighway(other) || !canConnectWays(way, other)) continue
    for (let j = 0; j < other.nodes.length - 1; j++) {
      const aId = other.nodes[j]
      const bId = other.nodes[j + 1]
      if (!aId || !bId || aId === tipId || bId === tipId) continue
      const a = nodeLoc(graph, aId)
      const b = nodeLoc(graph, bId)
      if (!a || !b) continue
      const crossLoc = segmentIntersection(tipLoc, extendedTip, a, b)
      if (crossLoc)
        return { mid, tip, wayId: other.id, edge: [aId, bId], crossLoc } satisfies Connection
    }
  }
  return undefined
}

/** The connection at one end, unless the extension would make the way cross itself */
function connectionAt(way: OsmWay, endIndex: number, context: RuleContext) {
  const node = context.graph.hasEntity(way.nodes[endIndex] ?? '')
  if (!(node instanceof OsmNode) || !isExtendableCandidate(node, way, context.graph))
    return undefined
  const connection = connectionFrom(way, endIndex, context)
  if (!connection) return undefined

  const points: Point[] = []
  for (const id of way.nodes) {
    const loc = nodeLoc(context.graph, id)
    if (!loc) return undefined
    points.push(loc)
  }
  points[endIndex] = connection.crossLoc
  return selfIntersects(points, endIndex) ? undefined : connection
}

/** The end nearest to collinear with the way's last segment, if its change of angle is small */
function smallJoinAngle(mid: OsmNode, tip: OsmNode, ends: OsmNode[]) {
  let joinTo: OsmNode | undefined
  let minAngle = Infinity
  if (!mid.loc || !tip.loc) return undefined
  for (const end of ends) {
    if (!end.loc) continue
    const a1 = angleBetween(mid.loc, tip.loc) + Math.PI
    const a2 = angleBetween(mid.loc, end.loc) + Math.PI
    const diff = Math.max(a1, a2) - Math.min(a1, a2)
    if (diff < minAngle) {
      joinTo = end
      minAngle = diff
    }
  }
  return minAngle <= SIG_ANGLE_TH ? joinTo : undefined
}

/**
 * iD's "Connect the features": join the ends when they are close and turn little, else weld the
 * end to the nearest node of the segment when that is closer than WELD_TH_METERS, else add the
 * end to the segment as a new node at the crossing.
 */
function connectActions(graph: Graph, connection: Connection, endId: string) {
  const endNode = graph.hasEntity(endId)
  const midNode = graph.hasEntity(connection.mid.id)
  if (!(endNode instanceof OsmNode) || !(midNode instanceof OsmNode) || !endNode.loc) return []
  const endLoc = endNode.loc

  const crossWay = graph.hasEntity(connection.wayId)
  if (crossWay instanceof OsmWay) {
    const ends = [crossWay.first(), crossWay.last()]
      .map((id) => (id ? graph.hasEntity(id) : undefined))
      .filter(
        (node): node is OsmNode =>
          node instanceof OsmNode &&
          node.id !== endNode.id &&
          node.loc !== undefined &&
          sphericalDistance(endLoc, node.loc) <= CLOSE_NODE_TH,
      )
    const collinear = ends.length > 0 ? smallJoinAngle(midNode, endNode, ends) : undefined
    if (collinear?.loc) return [actionMergeNodes([collinear.id, endId], collinear.loc)]
  }

  const [aId, bId] = connection.edge
  let closest: { node: OsmNode; distance: number } | undefined
  for (const id of [aId, bId]) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) continue
    const distance = sphericalDistance(node.loc, connection.crossLoc)
    if (!closest || distance < closest.distance) closest = { node, distance }
  }
  if (closest?.node.loc && closest.distance < WELD_TH_METERS) {
    return [actionMergeNodes([closest.node.id, endId], closest.node.loc)]
  }
  return [actionAddMidpoint({ loc: connection.crossLoc, edge: connection.edge }, endNode)]
}

function connectFix(connection: Connection, endId: string) {
  return {
    id: 'connect_almost_junction',
    label: 'Connect the features',
    annotation: 'Connected very close features.',
    actions: (graph) => connectActions(graph, connection, endId),
  } satisfies Fix
}

/** iD's "Tag as disconnected": the end gets noexit=yes */
function tagAsDisconnectedFix(nodeId: string) {
  return {
    id: 'tag_as_disconnected',
    label: 'Tag as disconnected',
    annotation: 'Tagged very close features as disconnected.',
    actions: (graph) => {
      const node = graph.hasEntity(nodeId)
      if (!node) return []
      return [actionChangeTags(nodeId, { ...node.tags, noexit: 'yes' })]
    },
  } satisfies Fix
}

/**
 * A road whose end comes very close to another road, or to itself, without being connected. The
 * fixes join the two ends; "Tag as disconnected" is offered for an end that has no tags of its own.
 */
export const almostJunction: Rule = {
  id: 'almost_junction',
  label: 'Almost junctions',
  validate(entity: OsmEntity, context: RuleContext) {
    if (!(entity instanceof OsmWay) || !isHighway(entity)) return []
    if (entity.isDegenerate() || entity.isClosed()) return []

    const issues: Issue[] = []
    for (const endIndex of [0, entity.nodes.length - 1]) {
      const connection = connectionAt(entity, endIndex, context)
      if (!connection) continue
      const tip = connection.tip
      const fixes: Fix[] = [connectFix(connection, tip.id)]
      if (!Object.keys(tip.tags).some(isInterestingKey)) fixes.push(tagAsDisconnectedFix(tip.id))
      const name = entity.tags.name || 'This road'
      const other =
        connection.wayId === entity.id ? undefined : context.graph.hasEntity(connection.wayId)
      issues.push({
        id: `almost_junction:${entity.id}:${tip.id}:${connection.wayId}`,
        rule: 'almost_junction',
        severity: 'warning',
        message: other
          ? `${name} is very close but not connected to ${other.tags.name || 'another road'}`
          : `${name} ends very close to itself but does not reconnect`,
        entityIds: [entity.id, tip.id, connection.wayId],
        loc: tip.loc ? ([tip.loc[0], tip.loc[1]] satisfies Point) : undefined,
        fixes,
        data: { midId: connection.mid.id, edge: connection.edge, cross_loc: connection.crossLoc },
      })
    }
    return issues
  },
}
