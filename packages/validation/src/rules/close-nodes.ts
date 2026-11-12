import { OsmNode, OsmWay, actionMergeNodes } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { sphericalDistance } from '../geo.ts'
import type { Fix, Issue, Rule } from '../types.ts'

// Ported from iD's close_nodes (ISC, © iD contributors), the part about the points of a way ("Very close points").
// iD's other part, a separate point too close to another point (with its exception for a different layer, level or
// addr:floor, iD 70b17d9), is not here: the rules have no query for the points near a point yet.

/** iD's osmPathHighwayTagValues */
const pathHighways: ReadonlySet<string> = new Set([
  'path',
  'footway',
  'cycleway',
  'bridleway',
  'pedestrian',
  'corridor',
  'steps',
  'ladder',
])

const isSet = (value: string | undefined) => value !== undefined && value !== 'no'

function wayTypeFor(way: OsmWay, graph: Graph) {
  if (isSet(way.tags.boundary)) return 'boundary'
  if (isSet(way.tags.indoor)) return 'indoor'
  if (isSet(way.tags.building) || isSet(way.tags['building:part'])) return 'building'
  if (pathHighways.has(way.tags.highway ?? '')) return 'path'
  for (const relation of graph.parentRelations(way)) {
    if (relation.tags.type === 'boundary') return 'boundary'
    if (relation.isMultipolygon()) {
      if (isSet(relation.tags.indoor)) return 'indoor'
      if (isSet(relation.tags.building) || isSet(relation.tags['building:part'])) return 'building'
    }
  }
  return 'other'
}

/** iD: no issue where merging would leave a degenerate way, nor in a very small way (diagonal under 1.5 m) */
function shouldCheckWay(way: OsmWay, graph: Graph) {
  if (way.nodes.length <= 2 || (way.isClosed() && way.nodes.length <= 4)) return false
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return false
    minLon = Math.min(minLon, node.loc[0])
    maxLon = Math.max(maxLon, node.loc[0])
    minLat = Math.min(minLat, node.loc[1])
    maxLat = Math.max(maxLat, node.loc[1])
  }
  return sphericalDistance([minLon, minLat], [maxLon, maxLat]) >= 1.5
}

const thresholds = { boundary: 0, indoor: 0.01, building: 0.05, path: 0.1, other: 0.2 } as const

/** iD's thresholds: features drawn in more detail are allowed closer points; boundaries are not checked */
export function closeNodesThresholdMeters(way: OsmWay, graph: Graph) {
  if (!shouldCheckWay(way, graph)) return 0
  return thresholds[wayTypeFor(way, graph)]
}

function labelOf(way: OsmWay) {
  if (way.tags.name) return way.tags.name
  if (isSet(way.tags.building)) return 'the building'
  return 'this feature'
}

/** "Merge these points", iD's fix: one undo step */
function mergeFix(first: string, second: string): Fix {
  return {
    id: 'merge_points',
    label: 'Merge these points',
    annotation: 'Merged very close points',
    actions: () => [actionMergeNodes([first, second])],
  }
}

/** The issue of two consecutive points of `way`, or nothing when they are far enough apart (iD's getWayIssueIfAny) */
function issueFor(first: OsmNode, second: OsmNode, way: OsmWay, graph: Graph): Issue | undefined {
  if (first.id === second.id || !first.loc || !second.loc) return undefined
  if (first.hasInterestingTags() && second.hasInterestingTags()) return undefined

  // the smallest threshold of the ways both points are in
  const secondWays = new Set(graph.parentWays(second))
  const thresholds = graph
    .parentWays(first)
    .filter((parent) => secondWays.has(parent))
    .map((parent) => closeNodesThresholdMeters(parent, graph))
  const threshold = Math.min(...thresholds)
  const distance = sphericalDistance([first.loc[0], first.loc[1]], [second.loc[0], second.loc[1]])
  if (distance > threshold) return undefined

  const centimetres = Math.round(distance * 100)
  return {
    id: `close_nodes:${way.id}:${first.id}:${second.id}`,
    rule: 'close_nodes',
    severity: 'warning',
    message: `Two points of ${labelOf(way)} are very close together (${centimetres} cm)`,
    entityIds: [way.id, first.id, second.id],
    loc: [first.loc[0], first.loc[1]],
    fixes: [mergeFix(first.id, second.id)],
    data: { distance },
  }
}

/** Every pair of consecutive points of the way, in its order */
function issuesForWay(way: OsmWay, graph: Graph) {
  if (!shouldCheckWay(way, graph)) return []
  const issues: Issue[] = []
  for (let index = 0; index < way.nodes.length - 1; index++) {
    const first = graph.hasEntity(way.nodes[index] ?? '')
    const second = graph.hasEntity(way.nodes[index + 1] ?? '')
    if (!(first instanceof OsmNode) || !(second instanceof OsmNode)) continue
    const issue = issueFor(first, second, way, graph)
    if (issue) issues.push(issue)
  }
  return issues
}

/** The pairs a vertex is part of, in each of its ways */
function issuesForVertex(node: OsmNode, graph: Graph) {
  const issues: Issue[] = []
  for (const way of graph.parentWays(node)) {
    if (!shouldCheckWay(way, graph)) continue
    for (let index = 0; index < way.nodes.length - 1; index++) {
      if (way.nodes[index] !== node.id && way.nodes[index + 1] !== node.id) continue
      const first = graph.hasEntity(way.nodes[index] ?? '')
      const second = graph.hasEntity(way.nodes[index + 1] ?? '')
      if (!(first instanceof OsmNode) || !(second instanceof OsmNode)) continue
      const issue = issueFor(first, second, way, graph)
      if (issue) issues.push(issue)
    }
  }
  return issues
}

/**
 * Two consecutive points of a way that are very close together (iD's close_nodes, "Very close points"): a warning at
 * the first point, with "Merge these points". Listed under the way; the same issue (same id) comes from either point.
 */
export const closeNodes: Rule = {
  id: 'close_nodes',
  label: 'Very close points',
  validate(entity: OsmEntity, { graph }) {
    if (entity instanceof OsmWay) return issuesForWay(entity, graph)
    if (entity instanceof OsmNode) return issuesForVertex(entity, graph)
    return []
  },
}
