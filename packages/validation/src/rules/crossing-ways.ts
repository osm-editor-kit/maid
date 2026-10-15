import { OsmNode, OsmWay, actionAddEntity, actionAddMidpoint } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { connectionTagsFor } from '../connection-tags.ts'
import type { ConnectionFeature } from '../connection-tags.ts'
import { properIntersection } from '../geo.ts'
import type { Point } from '../geo.ts'
import {
  hasTag,
  isRoutableHighway,
  lifecyclePrefixes,
  railwayValues,
  waterwayValues,
} from '../tags.ts'
import type { Fix, Issue, Rule, RuleContext } from '../types.ts'
import { createSegmentIndex, segmentsOf, sharesNode } from './crossing-segments.ts'
import type { Segment, SegmentEntry, SegmentIndex } from './crossing-segments.ts'

// Ported from iD's crossing_ways validator (ISC, © iD contributors), at commit 0194f3926, and from
// Rapid's version of it. Cut: relations (multipolygon members are not checked), the bridge, tunnel
// and layer fixes, the dynamic fixes, and the `lessLikelyTags` variant of the connection tags.

type FeatureType = ConnectionFeature

/** One way of a crossing, with the segment that crosses */
type Side = { way: OsmWay; type: FeatureType; line: boolean; segment: Segment }

/**
 * A way of the run that is a crossing feature, with its segments. `mark` is the check that named
 * it last: the neighbours of the way being validated are marked, the other ways of the run are not.
 */
type WayRecord = {
  way: OsmWay
  type: FeatureType
  line: boolean
  segments: Segment[]
  mark: number
}

/** iD's `osmRoutableAerowayTags` */
const routableAerowayValues: ReadonlySet<string | undefined> = new Set(['runway', 'taxiway'])

const defaultLabel: Record<FeatureType, string> = {
  aeroway: 'an aeroway',
  highway: 'a road',
  building: 'a building',
  railway: 'a railway',
  waterway: 'a waterway',
}

/** What a way is for this rule, or `undefined` when it is none of the five */
function featureOf(way: OsmWay, graph: Graph) {
  const tags = way.tags
  if (routableAerowayValues.has(tags.aeroway)) return 'aeroway'
  if (hasTag(tags.building) && !lifecyclePrefixes.has(tags.building)) return 'building'
  if (isRoutableHighway(tags.highway)) return 'highway'
  if (way.geometry(graph) !== 'line') return undefined
  if (hasTag(tags.railway) && railwayValues.has(tags.railway)) return 'railway'
  if (hasTag(tags.waterway) && waterwayValues.has(tags.waterway)) return 'waterway'
  return undefined
}

/**
 * The record of a way for one run, or `null` when it is not a crossing feature. A busy road is a
 * neighbour of many ways: the run keeps each way's record and its segments (its graph does not change),
 * and the segments of every feature go into the run's segment index once, when the record is made.
 */
function recordOf(way: OsmWay, context: RuleContext, state: RunState) {
  const cached = state.records.get(way.id)
  if (cached !== undefined) return cached
  const type = featureOf(way, context.graph)
  let record: WayRecord | null = null
  if (type) {
    record = {
      way,
      type,
      line: way.geometry(context.graph) === 'line',
      segments: segmentsOf(way, context.graph),
      mark: 0,
    }
    state.index.add(record, record.segments)
  }
  state.records.set(way.id, record)
  return record
}

/** What the run keeps for crossing_ways: the segment index and the record of each way it has seen */
type RunState = {
  index: SegmentIndex<WayRecord>
  records: Map<string, WayRecord | null>
}

/** The state of the run, made with the first check of the run */
function stateOf(context: RuleContext) {
  const key = 'crossing_ways:run'
  let state = context.memo.get(key) as RunState | undefined
  if (state === undefined) {
    state = { index: createSegmentIndex<WayRecord>(), records: new Map() }
    context.memo.set(key, state)
  }
  return state
}

/** Numbers the checks, so that a neighbour's mark names the check that marked it */
let checks = 0

/** A crossing found by the index: the segment of the validated way, the other segment, and the point */
type Found = {
  point: Point
  indexA: number
  segmentA: Segment
  owner: WayRecord
  indexB: number
  segmentB: Segment
}

/** iD's `taggedAsIndoor`: indoor features have a level */
function taggedAsIndoor(tags: OsmWay['tags']) {
  return hasTag(tags.indoor) || hasTag(tags.level) || tags.highway === 'corridor'
}

function allowsBridge(type: FeatureType) {
  return type === 'highway' || type === 'railway' || type === 'waterway' || type === 'aeroway'
}

function allowsTunnel(type: FeatureType) {
  return type === 'highway' || type === 'railway' || type === 'waterway'
}

/** Whether the two ways are allowed to cross on the map: iD's `isLegitCrossing` */
function isLegitCrossing(a: Side, b: Side) {
  const tagsA = a.way.tags
  const tagsB = b.way.tags

  // Indoor features on different levels do not interact
  if (
    taggedAsIndoor(tagsA) &&
    taggedAsIndoor(tagsB) &&
    (tagsA.level || '0') !== (tagsB.level || '0')
  )
    return true

  // A waterway may cross a highway that is a pier
  if (a.type === 'waterway' && b.type === 'highway' && tagsB.man_made === 'pier') return true
  if (b.type === 'waterway' && a.type === 'highway' && tagsA.man_made === 'pier') return true

  // Both on the same defined layer: they cross, whatever they are
  if (tagsA.layer !== undefined && tagsA.layer === tagsB.layer) return false

  // One is a bridge and the other is not, or one is a tunnel and the other is not
  const bridgeA = allowsBridge(a.type) && hasTag(tagsA.bridge)
  const bridgeB = allowsBridge(b.type) && hasTag(tagsB.bridge)
  if (bridgeA !== bridgeB) return true
  const tunnelA = allowsTunnel(a.type) && hasTag(tagsA.tunnel)
  const tunnelB = allowsTunnel(b.type) && hasTag(tagsB.tunnel)
  if (tunnelA !== tunnelB) return true

  return (tagsA.layer || '0') !== (tagsB.layer || '0')
}

function labelOf(side: Side) {
  return side.way.tags.name || defaultLabel[side.type]
}

/** "Connect the features": a new node where the two edges cross, inserted into both ways */
function connectFix(point: Point, first: Side, second: Side) {
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
  } satisfies Fix
}

/**
 * One issue for one crossing point. A road is listed first, so the message reads "road crosses
 * building"; two roads keep the way that was validated first. The id is the same from either way.
 */
function issueFor(validated: Side, other: Side, point: Point) {
  const connection = (side: Side) => ({
    type: side.type,
    tags: side.way.tags,
    line: side.line,
  })
  const [first, second] =
    validated.type === 'highway' || other.type !== 'highway'
      ? [validated, other]
      : [other, validated]

  // Order-independent id: the two ways sorted by id, each with the segment that crosses
  const [low, high] = [first, second].sort((x, y) =>
    x.way.id < y.way.id ? -1 : x.way.id > y.way.id ? 1 : 0,
  )
  const key = (side: Side) => `${side.way.id}@${side.segment.from}-${side.segment.to}`

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
    // In the order of the validated way first, as iD does
    data: {
      connectionTags: connectionTagsFor(connection(validated), connection(other)),
      featureTypes: [validated.type, other.type],
    },
  } satisfies Issue
}

/** Roads, aeroways, buildings, railways and waterways that cross without a junction */
export const crossingWays: Rule = {
  id: 'crossing_ways',
  label: 'Crossing ways',
  validate(entity, context) {
    if (!(entity instanceof OsmWay)) return []
    const graph = context.graph
    if (!featureOf(entity, graph)) return []

    const neighbours = context.waysNear(entity)
    if (neighbours.length === 0) return []

    // The neighbours' segments are all in the index before the first query: each neighbour is
    // marked with this check, and a query keeps only the entries of marked ways.
    const state = stateOf(context)
    const index = state.index
    const check = ++checks
    for (const other of neighbours) {
      const record = recordOf(other, context, state)
      if (record) record.mark = check
    }
    const validated = recordOf(entity, context, state)
    if (!validated) return []

    // Every crossing of a segment of the way with a segment of a neighbour: the box of the segment
    // selects the candidates, and only they are tested
    const found: Found[] = []
    const candidates: SegmentEntry<WayRecord>[] = []
    const segments = validated.segments
    for (let indexA = 0; indexA < segments.length; indexA++) {
      const segmentA = segments[indexA]
      if (!segmentA) continue
      index.near(segmentA.box, candidates)
      for (const entry of candidates) {
        if (entry.owner.mark !== check) continue
        const segmentB = entry.segment
        if (sharesNode(segmentA, segmentB)) continue
        const point = properIntersection(segmentA.a, segmentA.b, segmentB.a, segmentB.b)
        if (point)
          found.push({
            point,
            indexA,
            segmentA,
            owner: entry.owner,
            indexB: entry.index,
            segmentB,
          })
      }
    }
    // The order of the brute-force loops: the neighbours by id (as `waysNear` gives them), then the
    // segments of the way, then the segments of the neighbour
    if (found.length > 1) {
      found.sort(
        (x, y) =>
          (x.owner.way.id < y.owner.way.id ? -1 : x.owner.way.id > y.owner.way.id ? 1 : 0) ||
          x.indexA - y.indexA ||
          x.indexB - y.indexB,
      )
    }

    const issues: Issue[] = []
    for (const crossing of found) {
      const side: Side = {
        way: entity,
        type: validated.type,
        line: validated.line,
        segment: crossing.segmentA,
      }
      const otherSide: Side = {
        way: crossing.owner.way,
        type: crossing.owner.type,
        line: crossing.owner.line,
        segment: crossing.segmentB,
      }
      if (isLegitCrossing(side, otherSide)) continue
      issues.push(issueFor(side, otherSide, crossing.point))
    }
    return issues
  },
}
