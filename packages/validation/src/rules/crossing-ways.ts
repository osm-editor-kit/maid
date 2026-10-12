import { OsmNode, OsmWay, actionAddEntity, actionAddMidpoint } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { properIntersection } from '../geo.ts'
import type { Point } from '../geo.ts'
import {
  hasTag,
  isRoutableHighway,
  lifecyclePrefixes,
  railwayValues,
  waterwayValues,
} from '../tags.ts'
import type { Fix, Issue, Rule } from '../types.ts'

// Ported from Rapid's crossing_ways validator, only for two ways that cross without a shared node.
// Cut: relations (multipolygon members are not checked), indoor levels, aeroways, conveying,
// connection tags by feature type, the bridge, tunnel and layer fixes, and the candidate tree.

type FeatureType = 'highway' | 'building' | 'railway' | 'waterway'

type Segment = { from: string; to: string; a: Point; b: Point }

/** One way of a crossing, with the segment that crosses */
type Side = { way: OsmWay; type: FeatureType; segment: Segment }

const defaultLabel: Record<FeatureType, string> = {
  highway: 'a road',
  building: 'a building',
  railway: 'a railway',
  waterway: 'a waterway',
}

/** What a way is for this rule, or `undefined` when it is none of the four */
function featureOf(way: OsmWay, graph: Graph): FeatureType | undefined {
  const tags = way.tags
  if (hasTag(tags.building) && !lifecyclePrefixes.has(tags.building)) return 'building'
  if (isRoutableHighway(tags.highway)) return 'highway'
  if (way.geometry(graph) !== 'line') return undefined
  if (hasTag(tags.railway) && railwayValues.has(tags.railway)) return 'railway'
  if (hasTag(tags.waterway) && waterwayValues.has(tags.waterway)) return 'waterway'
  return undefined
}

function locOf(graph: Graph, id: string): Point | undefined {
  const node = graph.hasEntity(id)
  if (!(node instanceof OsmNode) || !node.loc) return undefined
  return [node.loc[0], node.loc[1]]
}

/** The segments of a way, in the order of its nodes. A closed way lists its first node again at the end. */
function segmentsOf(way: OsmWay, graph: Graph): Segment[] {
  const segments: Segment[] = []
  const nodes = way.nodes
  for (let i = 0; i + 1 < nodes.length; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    if (from === undefined || to === undefined) continue
    const a = locOf(graph, from)
    const b = locOf(graph, to)
    if (a && b) segments.push({ from, to, a, b })
  }
  return segments
}

/** Whether the two ways are allowed to cross on the map: Rapid's `isLegitCrossing`, reduced */
function isLegitCrossing(a: Side, b: Side): boolean {
  // Different layers do not touch, whatever the feature types
  if ((a.way.tags.layer || '0') !== (b.way.tags.layer || '0')) return true

  // A bridge, a tunnel or a ford makes the crossing a structure, not a missing junction
  if (hasStructure(a) || hasStructure(b)) return true

  // A waterway may cross a highway that is a pier
  if (a.type === 'waterway' && b.type === 'highway' && b.way.tags.man_made === 'pier') return true
  if (b.type === 'waterway' && a.type === 'highway' && a.way.tags.man_made === 'pier') return true

  return false
}

function hasStructure(side: Side): boolean {
  const tags = side.way.tags
  if (hasTag(tags.bridge) || hasTag(tags.tunnel)) return true
  return side.type === 'highway' && hasTag(tags.ford)
}

function sharesNode(a: Segment, b: Segment): boolean {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to
}

/** Every proper crossing of the segments of two ways, as the segment of each way and the point */
function crossingsOf(
  way: OsmWay,
  other: OsmWay,
  graph: Graph,
): Array<{ point: Point; segmentA: Segment; segmentB: Segment }> {
  const found: Array<{ point: Point; segmentA: Segment; segmentB: Segment }> = []
  const otherSegments = segmentsOf(other, graph)
  for (const segmentA of segmentsOf(way, graph)) {
    for (const segmentB of otherSegments) {
      if (sharesNode(segmentA, segmentB)) continue
      const point = properIntersection(segmentA.a, segmentA.b, segmentB.a, segmentB.b)
      if (point) found.push({ point, segmentA, segmentB })
    }
  }
  return found
}

function labelOf(side: Side): string {
  return side.way.tags.name || defaultLabel[side.type]
}

/** "Connect the features": a new node where the two edges cross, inserted into both ways */
function connectFix(point: Point, first: Side, second: Side): Fix {
  return {
    id: 'connect_features',
    label: 'Connect the features',
    annotation: 'Connected two crossing features',
    actions: () => {
      const node = new OsmNode(first.way.context, { loc: point, tags: {} })
      return [
        actionAddEntity(node),
        actionAddMidpoint({ loc: point, edge: [first.segment.from, first.segment.to] }, node),
        actionAddMidpoint({ loc: point, edge: [second.segment.from, second.segment.to] }, node),
      ]
    },
  }
}

/**
 * One issue for one crossing point. A road is listed first, so the message reads "road crosses
 * building"; two roads keep the way that was validated first. The id is the same from either way.
 */
function issueFor(validated: Side, other: Side, point: Point): Issue {
  const [first, second] =
    validated.type === 'highway' || other.type !== 'highway'
      ? [validated, other]
      : [other, validated]

  // Order-independent id: the two ways sorted by id, each with the segment that crosses
  const [low, high] = [first, second].sort((x, y) =>
    x.way.id < y.way.id ? -1 : x.way.id > y.way.id ? 1 : 0,
  )
  const key = (side: Side): string => `${side.way.id}@${side.segment.from}-${side.segment.to}`

  const fixes: Fix[] =
    first.type === 'highway' && second.type === 'highway' ? [connectFix(point, first, second)] : []
  return {
    id: `crossing_ways:${key(low ?? first)}:${key(high ?? second)}`,
    rule: 'crossing_ways',
    severity: 'warning',
    message: `${labelOf(first)} crosses ${labelOf(second)} without a junction`,
    entityIds: [first.way.id, second.way.id],
    loc: point,
    fixes,
  }
}

/** Roads, buildings, railways and waterways that cross without a junction */
export const crossingWays: Rule = {
  id: 'crossing_ways',
  label: 'Crossing ways',
  validate(entity, context): Issue[] {
    if (!(entity instanceof OsmWay)) return []
    const graph = context.graph
    const type = featureOf(entity, graph)
    if (!type) return []

    const issues: Issue[] = []
    for (const other of context.waysNear(entity)) {
      const otherType = featureOf(other, graph)
      // Only pairs with a highway: buildings and waterways may cross each other
      if (!otherType || (type !== 'highway' && otherType !== 'highway')) continue

      for (const crossing of crossingsOf(entity, other, graph)) {
        const validated: Side = { way: entity, type, segment: crossing.segmentA }
        const otherSide: Side = { way: other, type: otherType, segment: crossing.segmentB }
        if (isLegitCrossing(validated, otherSide)) continue
        issues.push(issueFor(validated, otherSide, crossing.point))
      }
    }
    return issues
  },
}
