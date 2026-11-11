/**
 * Merge a cycleway and a footway that run side by side into one foot and cycle path. Port of iD-Radnetz's
 * `merge_sidepaths.ts` (FixMyBerlin, ISC); which way survives and the merged tags are TILDA's `mergeSelection` and
 * `combinedPathTags`. The older kind keeps its geometry and gets the tags of both; a too long way is cut to the other's
 * length first; the other ways are deleted and their relation memberships move to the surviving ways.
 */
import {
  actionAddMidpoint,
  actionDeleteWay,
  actionSplit,
  type Graph,
  OsmNode,
  type OsmRelationMember,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import {
  combinedPathTags,
  commonTags,
  mergeSelection,
  type MergeSelection,
  type MergeWay,
  type PartKind,
  reverseTags,
} from '@tilda-geo/bicycle-infrastructure-tagging'
import { definedTags, roadLocs, type SignRules } from './extract.ts'
import { distanceToLineMetres, type Loc, lineLengthMetres, projectOnLine } from './geometry.ts'

/** Ways that run side by side: every node is at most this far from a way of the other kind */
const MAX_APART_METRES = 25
/** The longer way is only cut where it runs on for more than this past the end of the shorter one */
const MIN_OVERHANG_METRES = 5
/** A node of the longer way this close to the cut is used for it, instead of a new node */
const SNAP_TO_NODE_METRES = 3

/** Where the longer way is cut: at an existing node, or at a new node on the segment after `index` */
type CutPoint = { along: number; loc: Loc; nodeId?: string; index: number }

export type SidepathCut = {
  /** The longer way, which is cut to the length of the other one */
  wayId: string
  /** One or two points, ordered along the way */
  points: CutPoint[]
  /** The part between them is merged: metres from the start of the way */
  from: number
  to: number
}

export type MergeSidepathsSelection =
  | (MergeSelection & { cutPlan?: SidepathCut })
  | { disabled: 'apart' }

function wayOf(graph: Graph, id: string) {
  return graph.entity(id) as OsmWay
}

function locsOf(graph: Graph, id: string): Loc[] {
  return roadLocs(graph, wayOf(graph, id)) ?? []
}

/** From the first to the last node */
function direction(locs: Loc[]): Loc {
  const first = locs[0]!
  const last = locs[locs.length - 1]!
  return [last[0] - first[0], last[1] - first[1]]
}

function dot(a: Loc, b: Loc) {
  return a[0] * b[0] + a[1] * b[1]
}

/** A surviving way's tags with the other kind's tags, which are turned into its direction first */
function mergedTags(
  graph: Graph,
  survivor: OsmWay,
  deleted: OsmWay[],
  surviving: PartKind,
  rules: SignRules,
) {
  const along = direction(locsOf(graph, survivor.id))
  const other = commonTags(
    deleted.map((way) =>
      dot(along, direction(locsOf(graph, way.id))) < 0
        ? definedTags(reverseTags(way.tags))
        : way.tags,
    ),
  )
  const [bike, foot] = surviving === 'bike' ? [survivor.tags, other] : [other, survivor.tags]
  return combinedPathTags(bike, foot, { ...rules, primary: surviving })
}

/** A deleted way's place in its relations goes to the surviving ways, ordered along the deleted way */
function moveMemberships(graph: Graph, way: OsmWay, survivorIds: string[], replaced: Set<string>) {
  const locs = locsOf(graph, way.id)
  const along = direction(locs)
  const position = new Map(
    survivorIds.map((id) => {
      const other = locsOf(graph, id)
      const middle = other[Math.floor(other.length / 2)]!
      return [id, dot(along, [middle[0] - locs[0]![0], middle[1] - locs[0]![1]])]
    }),
  )
  const ordered = [...survivorIds].sort((a, b) => position.get(a)! - position.get(b)!)

  for (const relation of graph.parentRelations(way)) {
    const members: OsmRelationMember[] = []
    for (const member of relation.members) {
      if (member.id !== way.id) {
        members.push(member)
        continue
      }
      for (const id of ordered) {
        const key = `${relation.id}/${id}/${member.role}`
        if (replaced.has(key) || relation.memberByIdAndRole(id, member.role)) continue
        replaced.add(key)
        members.push({ id, type: 'way', role: member.role })
      }
    }
    graph.replace(relation.update({ members }))
  }
  return graph
}

/** Metres from the start of the line to each of its nodes */
function alongNodes(locs: Loc[]) {
  const result = [0]
  for (let i = 1; i < locs.length; i++)
    result.push(result[i - 1]! + lineLengthMetres([locs[i - 1]!, locs[i]!]))
  return result
}

/**
 * Where to cut the longer way so that it ends where the shorter one ends: at the points nearest to the shorter way's
 * ends, unless the longer way ends there anyway.
 */
function planCut(graph: Graph, longWay: OsmWay, shortWay: OsmWay): SidepathCut {
  const locs = locsOf(graph, longWay.id)
  const along = alongNodes(locs)
  const total = along[along.length - 1]!
  const ends = locsOf(graph, shortWay.id)

  const points: CutPoint[] = []
  const reached: number[] = []
  for (const end of [ends[0]!, ends[ends.length - 1]!]) {
    const projection = projectOnLine(end, locs)
    reached.push(projection.along)
    if (projection.along < MIN_OVERHANG_METRES || total - projection.along < MIN_OVERHANG_METRES)
      continue
    // an inner node nearby: cut there, the way keeps its shape
    const near = along
      .map((metres, index) => ({ index, apart: Math.abs(metres - projection.along) }))
      .filter(
        (node) =>
          node.index > 0 && node.index < locs.length - 1 && node.apart <= SNAP_TO_NODE_METRES,
      )
      .sort((a, b) => a.apart - b.apart)[0]
    points.push(
      near
        ? {
            along: along[near.index]!,
            loc: locs[near.index]!,
            nodeId: longWay.nodes[near.index],
            index: near.index,
          }
        : { along: projection.along, loc: projection.loc, index: projection.index },
    )
  }
  points.sort((a, b) => a.along - b.along)
  // both ends of the shorter way lead to the same place: one cut
  const distinct = points.filter(
    (point, i) => i === 0 || point.along - points[i - 1]!.along > SNAP_TO_NODE_METRES,
  )
  const [from, to] =
    distinct.length === 2
      ? [distinct[0]!.along, distinct[1]!.along]
      : distinct.length === 0
        ? [0, total]
        : // one cut: the part that the shorter way's middle runs along
          (reached[0]! + reached[1]!) / 2 < distinct[0]!.along
          ? [0, distinct[0]!.along]
          : [distinct[0]!.along, total]
  return { wayId: longWay.id, points: distinct, from, to }
}

/** Cuts the way; returns the piece between the cut points */
function cutWay(graph: Graph, plan: SidepathCut): string {
  if (!plan.points.length) return plan.wayId
  const before = wayOf(graph, plan.wayId)
  const along = new Map<string, number>(
    alongNodes(locsOf(graph, plan.wayId)).map((metres, i) => [before.nodes[i]!, metres]),
  )

  const nodeIds: string[] = []
  // from the end of the way, so the segment indexes of the earlier points stay valid
  for (const point of [...plan.points].reverse()) {
    if (point.nodeId) {
      nodeIds.push(point.nodeId)
      continue
    }
    const way = wayOf(graph, plan.wayId)
    const node = new OsmNode(graph.context, { loc: point.loc })
    actionAddMidpoint(
      { loc: point.loc, edge: [way.nodes[point.index]!, way.nodes[point.index + 1]!] },
      node,
    )(graph)
    along.set(node.id, point.along)
    nodeIds.push(node.id)
  }

  const split = actionSplit(nodeIds).limitWays([plan.wayId])
  split(graph)

  // the piece whose nodes all lie between the cut points
  const inside = (id: string) =>
    wayOf(graph, id).nodes.every((nodeId) => {
      const metres = along.get(nodeId)
      return metres !== undefined && metres >= plan.from - 0.01 && metres <= plan.to + 0.01
    })
  return [plan.wayId, ...split.getCreatedWayIDs()].find(inside) ?? plan.wayId
}

/**
 * How the ways merge (see `mergeSelection`), or `undefined` when they are not cycleways plus footways. Also checks that
 * they run side by side, and plans the cut of a way that is too long.
 */
export function mergeSidepathsSelection(
  graph: Graph,
  wayIds: readonly string[],
): MergeSidepathsSelection | undefined {
  const ways: MergeWay[] = []
  for (const id of wayIds) {
    const way = graph.hasEntity(id)
    if (!(way instanceof OsmWay) || way.isClosed()) return undefined
    const locs = roadLocs(graph, way)
    if (!locs) return undefined
    ways.push({
      id,
      tags: way.tags,
      // a way made in this session has no changeset yet (Maid's new ids start with a minus)
      changeset: way.isNew() ? undefined : Number(way.props.changeset) || 0,
      lengthMeters: lineLengthMetres(locs),
    })
  }
  const selection = mergeSelection(ways)
  if (!selection || selection.disabled) return selection

  if (selection.cut) {
    // two ways: the longer one is cut to the length of the other
    const longIsSurvivor = selection.cut === selection.surviving
    const longWay = wayOf(graph, (longIsSurvivor ? selection.survivors : selection.deleted)[0]!.id)
    const shortWay = wayOf(graph, (longIsSurvivor ? selection.deleted : selection.survivors)[0]!.id)
    const cutPlan = planCut(graph, longWay, shortWay)

    // the shorter way and the part it is merged with run side by side
    const longLocs = locsOf(graph, longWay.id)
    const shortLocs = locsOf(graph, shortWay.id)
    const along = alongNodes(longLocs)
    const part = [
      ...cutPlan.points.map((point) => point.loc),
      ...longLocs.filter((_loc, i) => along[i]! >= cutPlan.from && along[i]! <= cutPlan.to),
    ]
    const tooFar = (from: Loc[], to: Loc[]) =>
      from.some((loc) => distanceToLineMetres(loc, to) > MAX_APART_METRES)
    if (tooFar(shortLocs, longLocs) || tooFar(part, shortLocs)) return { disabled: 'apart' }
    return { ...selection, cutPlan }
  }

  // a footway that turns the corner is not the cycleway's other half
  const lines = (list: MergeWay[]) => list.map((way) => locsOf(graph, way.id))
  const survivors = lines(selection.survivors)
  const deleted = lines(selection.deleted)
  const apart = (from: Loc[][], to: Loc[][]) =>
    from.some((line) =>
      line.some(
        (loc) =>
          Math.min(...to.map((other) => distanceToLineMetres(loc, other))) > MAX_APART_METRES,
      ),
    )
  if (apart(survivors, deleted) || apart(deleted, survivors)) return { disabled: 'apart' }
  return selection
}

export type MergeResult = {
  /** The ways that stay, as paths */
  survivorIds: string[]
  /** `key=value` tags of the deleted ways that lost against the surviving way's value */
  dropped: string[]
}

/** Merges the ways in `graph` (changed in place, as Maid's actions do). Only call it with an enabled selection. */
export function mergeSidepaths(
  graph: Graph,
  selection: MergeSidepathsSelection,
  rules: SignRules,
): MergeResult {
  if ('disabled' in selection && selection.disabled) throw new Error('merge refused')
  const {
    surviving,
    survivors: s,
    deleted: d,
    cutPlan,
  } = selection as MergeSelection & {
    disabled: false
    cutPlan?: SidepathCut
  }
  let survivorIds = s.map((way) => way.id)
  let deletedIds = d.map((way) => way.id)

  // the longer way is cut to the length of the other; what runs on stays as it is
  if (cutPlan) {
    const piece = cutWay(graph, cutPlan)
    const replace = (ids: string[]) => ids.map((id) => (id === cutPlan.wayId ? piece : id))
    survivorIds = replace(survivorIds)
    deletedIds = replace(deletedIds)
  }
  const survivors = survivorIds.map((id) => wayOf(graph, id))
  const deleted = deletedIds.map((id) => wayOf(graph, id))
  const dropped = new Set<string>()
  for (const survivor of survivors) {
    const result = mergedTags(graph, survivor, deleted, surviving, rules)
    for (const tag of result.dropped) dropped.add(tag)
    graph.replace(survivor.update({ tags: definedTags(result.tags) }))
  }
  const replaced = new Set<string>()
  for (const way of deleted) {
    moveMemberships(graph, way, survivorIds, replaced)
    actionDeleteWay(way.id)(graph)
  }
  graph.commit()
  return { survivorIds, dropped: [...dropped] }
}
