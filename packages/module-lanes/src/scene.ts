/**
 * The cross-section scene of a road and the roads it continues into: the way before and the way after, each turned
 * into the selected way's direction, so the diagram reads as one street with travel upwards. Pure, from the editor's
 * graph.
 */
import {
  buildRoadSpaceSegment,
  layoutRoadSpace,
  type RoadSpaceScene,
  type RoadSpaceSegment,
} from '@osm-editor-kit/osm-lane-diagram'
import { normalizeTagsForDirection } from '@osm-editor-kit/osm-way-chain'
import { plainTags, type Tags } from './edit.ts'
import { isLaneRoad } from './roads.ts'

/** What the scene reads of an entity of the model's graph */
export type GraphEntity = {
  readonly id: string
  readonly tags: Tags
  readonly nodes?: readonly string[]
}

/** The part of the model's Graph that the scene reads (`editor.history.staging.graph`) */
export type GraphLike = {
  hasEntity(id: string): GraphEntity | undefined
  parentWays(entity: GraphEntity): readonly GraphEntity[]
}

/** The number in an entity id (`w123` → 123, `w-1` → -1), as the lane diagram names its slots */
export function osmNumber(id: string): number {
  return Number(id.slice(1))
}

type Neighbour = { id: string; tags: Record<string, string> }

/**
 * The road that continues the way at one of its ends: a lane road that ends there too, with the same name (or, without
 * a name, the same highway type). `atEnd`: the way's last node, else its first. The neighbour's tags are turned into
 * the way's direction when it was drawn the other way round.
 */
export function neighbourAt(
  graph: GraphLike,
  way: GraphEntity,
  atEnd: boolean,
): Neighbour | undefined {
  const nodes = way.nodes ?? []
  const nodeId = atEnd ? nodes.at(-1) : nodes[0]
  const node = nodeId === undefined ? undefined : graph.hasEntity(nodeId)
  if (!node || nodeId === undefined) return undefined
  const sameRoad = (other: GraphEntity) =>
    way.tags.name !== undefined
      ? other.tags.name === way.tags.name
      : other.tags.name === undefined && other.tags.highway === way.tags.highway
  for (const other of graph.parentWays(node)) {
    if (other.id === way.id || !isLaneRoad(other.tags) || !sameRoad(other)) continue
    const otherNodes = other.nodes ?? []
    const first = otherNodes[0] === nodeId
    const last = otherNodes.at(-1) === nodeId
    if (!first && !last) continue
    // after the way's end the neighbour should start there; before its start, end there. Else it runs against it.
    const reversed = atEnd ? last : first
    return { id: other.id, tags: normalizeTagsForDirection(plainTags(other.tags), reversed) }
  }
  return undefined
}

export type LaneScene = {
  scene: RoadSpaceScene
  /** The selected way's segment: its slots in cross-section order */
  current: RoadSpaceSegment
  before?: string
  after?: string
}

/** The scene of a way with its neighbours: the way after on top, the way before below, travel upwards */
export function laneScene(graph: GraphLike, way: GraphEntity): LaneScene {
  const before = neighbourAt(graph, way, false)
  const after = neighbourAt(graph, way, true)
  const current = buildRoadSpaceSegment(plainTags(way.tags), {
    wayId: osmNumber(way.id),
    role: 'current',
  })
  const segments: RoadSpaceSegment[] = []
  if (after)
    segments.push(buildRoadSpaceSegment(after.tags, { wayId: osmNumber(after.id), role: 'next' }))
  segments.push(current)
  if (before)
    segments.push(buildRoadSpaceSegment(before.tags, { wayId: osmNumber(before.id), role: 'prev' }))
  return { scene: layoutRoadSpace({ segments }), current, before: before?.id, after: after?.id }
}
