/**
 * Shapes of the data for the reroute: a way's line, its length, and distances on the ground. Pure, on the model's
 * graph. Coordinates are [lon, lat].
 */
import { OsmNode, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { haversine, METRES_PER_DEG, type RouteSegment } from '@osm-editor-kit/maid-routing'

export type Lonlat = [number, number]

/** A node's location, or undefined when the node is not loaded */
export function nodeLonlat(graph: Graph, nodeId: EntityID): Lonlat | undefined {
  const node = graph.hasEntity(nodeId)
  if (!(node instanceof OsmNode) || !node.loc) return undefined
  return [node.loc[0], node.loc[1]]
}

/** The way's nodes as coordinates, in node order; empty when the way or a node is not loaded */
export function wayLine(graph: Graph, wayId: EntityID): Lonlat[] {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return []
  const line: Lonlat[] = []
  for (const nodeId of way.nodes) {
    const loc = nodeLonlat(graph, nodeId)
    if (!loc) return []
    line.push(loc)
  }
  return line
}

/**
 * The line a route segment runs along: the split point it starts at (if any), the way's nodes in the order the route
 * takes them, and the split point it ends at. The indices are the router's (fromIndex and toIndex, inclusive).
 */
export function segmentLine(graph: Graph, segment: RouteSegment): Lonlat[] {
  const way = graph.hasEntity(segment.wayId)
  if (!(way instanceof OsmWay)) return []
  const line: Lonlat[] = []
  if (segment.startSplit) line.push(segment.startSplit.loc)
  const step = segment.forward ? 1 : -1
  for (
    let i = segment.fromIndex;
    segment.forward ? i <= segment.toIndex : i >= segment.toIndex;
    i += step
  ) {
    const nodeId = way.nodes[i]
    const loc = nodeId === undefined ? undefined : nodeLonlat(graph, nodeId)
    if (loc) line.push(loc)
  }
  if (segment.endSplit) line.push(segment.endSplit.loc)
  return line
}

/** The length of a line in metres, on the sphere the router uses */
export function lineLengthM(line: readonly Lonlat[]): number {
  let length = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    length += haversine(a[0], a[1], b[0], b[1])
  }
  return length
}

/** The distance from a point to one segment, in metres (a local flat map around the point) */
function segmentDistanceM(point: Lonlat, a: Lonlat, b: Lonlat): number {
  const cos = Math.cos((point[1] * Math.PI) / 180)
  const k = METRES_PER_DEG
  const ax = (a[0] - point[0]) * cos * k
  const ay = (a[1] - point[1]) * k
  const dx = (b[0] - a[0]) * cos * k
  const dy = (b[1] - a[1]) * k
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** The distance from a point to a line in metres. Infinity for a line with no segment */
export function distanceToLineM(point: Lonlat, line: readonly Lonlat[]): number {
  if (line.length === 1) return segmentDistanceM(point, line[0]!, line[0]!)
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < line.length; i++) {
    best = Math.min(best, segmentDistanceM(point, line[i - 1]!, line[i]!))
  }
  return best
}
