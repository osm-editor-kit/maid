/**
 * The plan and the action of "move the side's tags to its separate way": the attributes of `sidewalk:left=separate`
 * (or a cycle track's) go from the road to the ways found on that side, and the road keeps only `sidewalk:left=separate`.
 */
import { type Action, actionChangeTags, type Graph, OsmWay } from '@osm-editor-kit/maid-model'
import { separateWays } from './find.ts'
import {
  canMoveSide,
  conflictingKeys,
  roadTagsWithout,
  sideAttributes,
  type Side,
  type SidePrefix,
  tagsForWay,
} from './side-tags.ts'

/** Why the tags cannot move: no way found on a side, or a found way has another value for `key` */
export type MoveRefusal =
  | { reason: 'no_way'; side: Side }
  | { reason: 'different_value'; side: Side; key: string; wayId: string }

export type MovePlan =
  | { refused: MoveRefusal }
  | {
      /** The ways that get tags, with what they get */
      ways: Array<{ id: string; tags: Record<string, string> }>
      roadTags: Record<string, string>
      /** One tag change per way, the road last */
      actions: Action[]
      /** Attributes that stay on the road because their separate way has another value */
      kept: Array<{ side: Side; key: string }>
    }

/** Found ways per graph and road, so that the edit menu, asked often for one graph, searches once */
const found = new WeakMap<Graph, Map<string, ReturnType<typeof separateWays>>>()

function cachedSeparateWays(graph: Graph, roadId: string, prefix: SidePrefix, side: Side) {
  let byKey = found.get(graph)
  if (!byKey) {
    byKey = new Map()
    found.set(graph, byKey)
  }
  const key = `${roadId} ${prefix} ${side}`
  let ways = byKey.get(key)
  if (!ways) {
    ways = separateWays(graph, roadId, prefix, side)
    byKey.set(key, ways)
  }
  return ways
}

/** Whether the operation is offered: one road whose sides are all separate and still have attributes */
export function moveApplies(
  graph: Graph,
  roadId: string,
  prefix: SidePrefix,
  sides: readonly Side[],
): boolean {
  const road = graph.hasEntity(roadId)
  return road instanceof OsmWay && sides.every((side) => canMoveSide(road.tags, prefix, side))
}

/**
 * What moving the attributes of `sides` changes. An attribute whose separate way already has another value stays on
 * the road (as the side's own key), so nothing is lost and the mapper decides; the others move. Refused when a side
 * has no separate way, or when nothing at all could move.
 */
export function moveSideTagsPlan(
  graph: Graph,
  roadId: string,
  prefix: SidePrefix,
  sides: readonly Side[],
): MovePlan {
  const road = graph.entity(roadId) as OsmWay
  const changes = new Map<string, Record<string, string>>()
  const kept = new Map<Side, Set<string>>()
  let firstConflict: MoveRefusal | undefined
  let moves = 0
  for (const side of sides) {
    const ways = cachedSeparateWays(graph, roadId, prefix, side)
    if (!ways.length) return { refused: { reason: 'no_way', side } }
    const attributes = sideAttributes(road.tags, prefix, side)
    const conflicts = new Set<string>()
    // a key that one piece of the separate way has otherwise stays on the road for all pieces
    for (const { id, reversed } of ways) {
      const before = changes.get(id) ?? (graph.entity(id) as OsmWay).tags
      const moved = tagsForWay(attributes, reversed)
      for (const key of conflictingKeys(before, moved)) {
        const attribute = attributes.find((a) => tagsForWay([a], reversed)[key] !== undefined)!
        conflicts.add(attribute.key)
        firstConflict ??= { reason: 'different_value', side, key, wayId: id }
      }
    }
    kept.set(side, conflicts)
    const moving = attributes.filter((attribute) => !conflicts.has(attribute.key))
    moves += moving.length
    for (const { id, reversed } of ways) {
      const before = changes.get(id) ?? { ...(graph.entity(id) as OsmWay).tags }
      changes.set(id, { ...before, ...tagsForWay(moving, reversed) })
    }
  }
  if (!moves && firstConflict) return { refused: firstConflict }

  const roadTags = roadTagsWithout(road.tags, prefix, sides, kept)
  const ways = [...changes]
    .filter(([id, tags]) => !sameTags((graph.entity(id) as OsmWay).tags, tags))
    .map(([id, tags]) => ({ id, tags }))
  const actions = [
    ...ways.map(({ id, tags }) => actionChangeTags(id, tags)),
    actionChangeTags(roadId, roadTags),
  ]
  return {
    ways,
    roadTags,
    actions,
    kept: [...kept].flatMap(([side, keys]) => [...keys].map((key) => ({ side, key }))),
  }
}

function sameTags(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}
