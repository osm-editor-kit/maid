// The pure part of a reroute: given the loaded graph, a route relation, the stretch of its members to
// replace and a route from the router (packages/routing), return the actions that write the route into
// the relation as one edit, and what the preview shows. Nothing here touches the editor or the network.
// Why and what was decided: docs/research/relation-handling.md, section 7 (decided 2026-10-15).
//
// The actions, in order:
// 1. The new nodes are added to their ways (the router never creates nodes).
// 2. The stretch's members are removed from the route relation. Until step 4 the route is not a parent of
//    any way that is split, so the split does not run iD's pair insertion on the route (which joins the
//    route's members and may reorder them). Members outside the stretch are not touched at all.
// 3. The ways are split where the route starts or ends inside a way, as iD does. Other relations of a
//    split way get the new part (iD's behaviour, listed as `otherRelationsTouched`).
// 4. The route's ways and its point members go back into the stretch's place, in the relation's member
//    order (the route's travel order, reversed when the stretch runs against the member order), with roles.
//
// The plan is simulated on a copy of the graph, so the ids of the new parts are known before anything is
// applied and the plan can be checked (members, parts) in tests and in the preview.
//
// A refusal carries a code only: the words for it are the module's texts (RerouteSection), not English here.
import {
  actionAddEntity,
  actionAddMember,
  actionAddVertex,
  actionDeleteMembers,
  actionSplit,
  Graph,
  OsmNode,
  OsmRelation,
  OsmWay,
  type Action,
  type OsmRelationMember,
} from '@osm-editor-kit/maid-model'
import {
  bicycleProfile,
  haversine,
  type RouteResult,
  type SplitPoint,
} from '@osm-editor-kit/maid-routing'
import { distanceToLineM, nodeLonlat, segmentLine, type Lonlat } from './geometry.ts'

/** Points further than this from the new path are flagged for review, in metres */
const FAR_POINT_M = 25

/** A route shorter than this is a point, not a route: the start and the end are the same place, in metres */
const SAME_PLACE_M = 1

type LonLat = Lonlat

/** The access profile a route relation uses, from its `route` tag. Undefined: no profile here */
type RouteKind = 'bicycle' | 'foot'

function routeKindOf(route: string | undefined): RouteKind | undefined {
  if (route === 'bicycle' || route === 'mtb') return 'bicycle'
  if (route === 'hiking' || route === 'foot' || route === 'walking') return 'foot'
  return undefined
}

/**
 * Every stretch of the relation that starts with the member `startWayId` and ends with `endWayId`
 * (member indexes, inclusive). A way that occurs more than once gives more than one stretch: the UI
 * asks which one the mapper means.
 */
export function stretchesBetween(
  relation: OsmRelation,
  startWayId: EntityID,
  endWayId: EntityID,
): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  const members = relation.members
  for (let from = 0; from < members.length; from++) {
    if (members[from]!.type !== 'way' || members[from]!.id !== startWayId) continue
    for (let to = from; to < members.length; to++) {
      if (members[to]!.type === 'way' && members[to]!.id === endWayId) out.push({ from, to })
    }
  }
  return out
}

export interface PlanInput {
  graph: Graph
  /** The route relation to change */
  relationId: EntityID
  /**
   * Member indexes of the stretch to replace, from the first to the last way member (`from` may equal `to`).
   * `reversed`: the route runs from `to` back to `from`, against the member order of the relation
   */
  stretch: { from: number; to: number; reversed?: boolean }
  /** The ids of `members[from..to]` as the preview showed them. Any difference refuses the plan */
  expectedIds: EntityID[]
  /** The router's answer for the new path */
  route: RouteResult
  /** Roles the mapper chose for questions, by route segment (index into `route.segments`) */
  roleChoices?: Record<number, string>
  /** Point members further than this from the new path are flagged. Default `FAR_POINT_M` */
  farM?: number
  /**
   * Whether the filters make an entity read-only. When the relation, a way of the stretch or a way the route
   * splits is read-only, the plan is refused. Absent: nothing is read-only.
   */
  readOnly?: (id: EntityID) => boolean
}

export type PlanRefusal =
  | 'no-route'
  | 'same-place'
  | 'relation-missing'
  | 'not-a-route'
  | 'unsupported-route'
  | 'bad-stretch'
  | 'relation-changed'
  | 'read-only'
  | 'way-not-loaded'
  | 'closed-way-split'
  | 'split-way-used-outside'
  | 'split-not-resolved'
  | 'internal'

/**
 * Why the rules cannot decide a role. The texts are the module's (RerouteSection): `two-way-*` for a two-way
 * way the data splits between empty and forward, `against-node-order` and `one-way-backward` for a one-way way
 */
export type RoleReason =
  | 'two-way-sidewalk'
  | 'two-way-sidepath'
  | 'two-way-cycleway-on-road'
  | 'not-routed'
  | 'against-node-order'
  | 'one-way-backward'
  | 'loop'

/** A role the rules cannot decide: the preview asks the mapper, with the most common answer first */
export interface RoleQuestion {
  /** Index into `route.segments` (the key of `roleChoices`) */
  segment: number
  /** The way that will be the member (its id after the splits) */
  wayId: EntityID
  options: string[]
  suggested: string
  reason: RoleReason
}

/** A way the route puts in the stretch. Includes ways that were already in the stretch */
export interface AddedMember {
  /** Index into `route.segments` (the way is routed in travel order, whatever the order of the relation) */
  segment: number
  /** Index in the route relation after the apply */
  index: number
  /** The way's id after the splits */
  id: EntityID
  /** The way the segment was routed on before the splits */
  fromWayId: EntityID
  role: string
}

/** An old way member of the stretch that is not in the new route (multiset difference by way id) */
export interface RemovedMember {
  /** Index in the route relation before the apply */
  index: number
  id: EntityID
  type: 'way'
  role: string
}

export interface SplitWay {
  /** The way before the split (it keeps its id on one of the two parts) */
  wayId: EntityID
  /** The id given to the new part. Which part keeps `wayId` is decided by the split (the longer one) */
  newWayId: EntityID
  /** The new node where the way is split */
  nodeId: EntityID
  loc: LonLat
  /** The route segment that starts or ends at the split */
  segment: number
}

export interface PointReview {
  /** Index in the route relation before the apply */
  index: number
  id: EntityID
  type: OsmRelationMember['type']
  role: string
  /** Distance to the new path in metres, null when the point is not loaded or not a node */
  distanceM: number | null
  /** Over `farM`, or unknown */
  far: boolean
}

export interface ReroutePlan {
  ok: true
  actions: Action[]
  /** The ways the route puts in the relation, in the order the relation holds them */
  addedMembers: AddedMember[]
  removedMembers: RemovedMember[]
  splitWays: SplitWay[]
  /** Relations other than the route that get the new part of a split way */
  otherRelationsTouched: EntityID[]
  rolesToAsk: RoleQuestion[]
  pointsToReview: PointReview[]
  /** The route relation's members after the apply, as the simulation found them */
  members: OsmRelationMember[]
  /** Length of the new path, from the router */
  lengthM: number
}

export type PlanResult = ReroutePlan | { ok: false; reason: PlanRefusal }

/** A way a route runs on, as it is when the route is found: its nodes and tags, to check at the apply */
export interface RouteWay {
  id: EntityID
  nodes: EntityID[]
  tags: Record<string, string>
}

/** The ways a route runs on (its segments and the ways it splits), with their nodes and tags now */
export function routeWaysOf(graph: Graph, route: RouteResult): RouteWay[] {
  if (!route.ok) return []
  const ids = new Set<EntityID>()
  for (const segment of route.segments) ids.add(segment.wayId)
  for (const split of route.splits) ids.add(split.wayId)
  return [...ids].map((id) => {
    const way = graph.hasEntity(id)
    return way instanceof OsmWay
      ? { id, nodes: [...way.nodes], tags: { ...way.tags } }
      : { id, nodes: [], tags: {} }
  })
}

/**
 * The first of the ways whose nodes or tags differ from the route's, or are gone; undefined when none differs.
 * A route is planned on the ways as they are, so the plan made on a route that changed would be wrong.
 */
export function changedRouteWay(graph: Graph, ways: readonly RouteWay[]): EntityID | undefined {
  return ways.find((route) => {
    const now = graph.hasEntity(route.id)
    if (!(now instanceof OsmWay)) return true
    if (now.nodes.length !== route.nodes.length) return true
    if (now.nodes.some((id, k) => id !== route.nodes[k])) return true
    const keys = Object.keys(now.tags)
    return (
      keys.length !== Object.keys(route.tags).length ||
      keys.some((key) => now.tags[key] !== route.tags[key])
    )
  })?.id
}

/** Roles for the two kinds of way, in the order the guided choice shows them */
const TWO_WAY_OPTIONS = ['', 'forward', 'backward']
const ONE_WAY_OPTIONS = ['forward', '', 'backward']
const ONE_WAY_BACK_OPTIONS = ['', 'backward', 'forward']

/** Highway kinds that are side ways, not roads: a `cycleway=*` tag on them is not a question */
const SIDE_KINDS = new Set([
  'cycleway',
  'footway',
  'path',
  'track',
  'bridleway',
  'pedestrian',
  'steps',
  'corridor',
])

interface RoleDecision {
  role: string
  question?: { options: string[]; suggested: string; reason: RoleReason }
}

/**
 * The role of a new member, by Tobias's rule (decided 2026-10-15, data in relation-handling.md section 7):
 * - hiking and foot routes: empty
 * - bicycle, two-way way: empty, unless the kind is one the data splits (a question)
 * - bicycle, one-way way the route follows in node order: `forward`
 * - bicycle, one-way way the route runs against node order: a question; `backward` is never set
 * - loops and ways the route runs over twice: every member is a question
 * `forward` is the direction the relation runs over the way, which is the reverse of the travel when the stretch
 * runs against the member order.
 */
function roleFor(
  kind: RouteKind,
  tags: Readonly<Record<string, string>>,
  forward: boolean,
  loop: boolean,
): RoleDecision {
  if (kind === 'foot') return { role: '' }
  const rule = bicycleProfile.wayRule(tags)
  if (!rule) {
    return {
      role: '',
      question: { options: TWO_WAY_OPTIONS, suggested: '', reason: 'not-routed' },
    }
  }

  let role: string
  let options: string[]
  let reason: RoleReason | undefined
  if (rule.forward && rule.backward) {
    role = ''
    options = TWO_WAY_OPTIONS
    reason = unclearTwoWay(tags)
  } else if (rule.forward) {
    role = forward ? 'forward' : ''
    options = ONE_WAY_OPTIONS
    if (!forward) reason = 'against-node-order'
  } else {
    role = ''
    options = ONE_WAY_BACK_OPTIONS
    reason = 'one-way-backward'
  }
  if (reason === undefined && loop) reason = 'loop'
  if (reason === undefined) return { role }
  return { role, question: { options, suggested: role, reason } }
}

/** Two-way bicycle ways whose kind the data splits between empty and forward: a question, else undefined */
function unclearTwoWay(tags: Readonly<Record<string, string>>): RoleReason | undefined {
  if (tags.footway === 'sidewalk') return 'two-way-sidewalk'
  if (tags.is_sidepath === 'yes') return 'two-way-sidepath'
  const highway = tags.highway
  const onRoad = highway !== undefined && !SIDE_KINDS.has(highway)
  if (
    onRoad &&
    Object.keys(tags).some((key) => key === 'cycleway' || key.startsWith('cycleway:'))
  ) {
    return 'two-way-cycleway-on-road'
  }
  return undefined
}

function countBy<T>(items: T[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return counts
}

/**
 * Plans the reroute of `input.stretch` onto `input.route`. The returned actions, run in order with
 * `editor.history.perform(...actions)`, make one undo step. The plan does not change the graph it is given.
 */
export function planReroute(input: PlanInput): PlanResult {
  const { graph, relationId, stretch, expectedIds, route } = input
  const farM = input.farM ?? FAR_POINT_M
  const refuse = (reason: PlanRefusal): PlanResult => ({ ok: false, reason })

  // 1. The route and the relation
  if (!route.ok) return refuse('no-route')
  if (route.segments.length === 0 || route.lengthM < SAME_PLACE_M) return refuse('same-place')

  const relation = graph.hasEntity(relationId)
  if (!(relation instanceof OsmRelation)) return refuse('relation-missing')
  if (relation.tags.type !== 'route') return refuse('not-a-route')
  const kind = routeKindOf(relation.tags.route)
  if (!kind) return refuse('unsupported-route')

  const members = relation.members
  const { from, to } = stretch
  const reversed = stretch.reversed === true
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to >= members.length ||
    from > to ||
    members[from]!.type !== 'way' ||
    members[to]!.type !== 'way'
  ) {
    return refuse('bad-stretch')
  }
  const stretchMembers = members.slice(from, to + 1)
  if (
    expectedIds.length !== stretchMembers.length ||
    stretchMembers.some((m, k) => m.id !== expectedIds[k])
  ) {
    return refuse('relation-changed')
  }

  // The ways this plan changes: the relation, the ways of the stretch and the ways the route splits
  const readOnly = input.readOnly
  if (readOnly) {
    const changed = [
      relationId,
      ...stretchMembers.filter((m) => m.type === 'way').map((m) => m.id),
      ...route.splits.map((split) => split.wayId),
    ]
    if (changed.some((id) => readOnly(id))) return refuse('read-only')
  }

  // 2. The ways of the route, and the splits
  const origWays = new Map<EntityID, OsmWay>()
  for (const segment of route.segments) {
    const way = graph.hasEntity(segment.wayId)
    if (!(way instanceof OsmWay)) return refuse('way-not-loaded')
    origWays.set(segment.wayId, way)
  }
  const outsideIds = new Set(
    members.filter((_, index) => index < from || index > to).map((m) => m.id),
  )
  for (const split of route.splits) {
    const way = graph.hasEntity(split.wayId)
    if (!(way instanceof OsmWay)) return refuse('way-not-loaded')
    if (way.isClosed()) return refuse('closed-way-split')
    if (outsideIds.has(split.wayId)) return refuse('split-way-used-outside')
    origWays.set(split.wayId, way)
  }
  for (const way of origWays.values()) {
    if (way.nodes.some((id) => !nodeLonlat(graph, id))) return refuse('way-not-loaded')
  }

  // 3. The new nodes, the vertex inserts and the splits, simulated on a copy of the graph
  const splitNodes = route.splits.map((split) => new OsmNode(graph.context, { loc: split.loc }))
  const splitWayIds = route.splits.map(() => new OsmWay(graph.context, { nodes: [] }).id)
  const actions: Action[] = []
  let sim = new Graph(graph)
  const run = (action: Action): void => {
    actions.push(action)
    sim = action(sim)
  }

  // Vertices go in from the end of each way, so the earlier segment indexes stay valid. Within one
  // segment, the point nearer the segment's end goes in first.
  const vertexOrder = route.splits
    .map((split, i) => ({ split, i }))
    .sort((a, b) => b.split.segment - a.split.segment || b.split.t - a.split.t)
  for (const { split, i } of vertexOrder) {
    const way = origWays.get(split.wayId)!
    if (split.segment < 0 || split.segment + 1 >= way.nodes.length)
      return refuse('split-not-resolved')
    run(actionAddEntity(splitNodes[i]!))
    run(actionAddVertex(split.wayId, splitNodes[i]!.id, split.segment + 1))
  }

  run(
    actionDeleteMembers(
      relationId,
      Array.from({ length: to - from + 1 }, (_, k) => from + k),
      false,
    ),
  )

  // family: the ids of the parts of each split way, the original first
  const family = new Map<EntityID, EntityID[]>()
  for (const [i, split] of route.splits.entries()) {
    const parts = family.get(split.wayId) ?? [split.wayId]
    const nodeId = splitNodes[i]!.id
    const holds = parts.some((id) => {
      const part = sim.hasEntity(id)
      return part instanceof OsmWay && part.nodes.includes(nodeId)
    })
    if (!holds) return refuse('split-not-resolved')
    run(actionSplit(nodeId, [splitWayIds[i]!]))
    family.set(split.wayId, [...parts, splitWayIds[i]!])
  }

  const afterSplits = sim.hasEntity(relationId)
  if (
    !(afterSplits instanceof OsmRelation) ||
    afterSplits.members.length !== members.length - stretchMembers.length
  ) {
    return refuse('internal')
  }

  // 4. The part of each route segment: the part that holds both of its end nodes
  const partIds: EntityID[] = []
  const segmentOfSplit: number[] = []
  for (const [i, segment] of route.segments.entries()) {
    const way = origWays.get(segment.wayId)!
    const endNodeOf = (split: SplitPoint | undefined, index: number): EntityID | undefined => {
      if (split === undefined) return way.nodes[index]
      const at = route.splits.findIndex(
        (s) => s.wayId === split.wayId && s.segment === split.segment && s.t === split.t,
      )
      if (at < 0) return undefined
      segmentOfSplit[at] = i
      return splitNodes[at]!.id
    }
    const startNode = endNodeOf(segment.startSplit, segment.fromIndex)
    const endNode = endNodeOf(segment.endSplit, segment.toIndex)
    if (startNode === undefined || endNode === undefined) return refuse('split-not-resolved')
    const part = (family.get(segment.wayId) ?? [segment.wayId]).find((id) => {
      const way = sim.hasEntity(id)
      return way instanceof OsmWay && way.nodes.includes(startNode) && way.nodes.includes(endNode)
    })
    if (part === undefined) return refuse('split-not-resolved')
    partIds.push(part)
  }

  // 5. Roles and questions. The segments are written in the relation's order: travel order, or its reverse
  // when the stretch runs against the member order (then each segment also runs the other way round)
  const segmentLines: LonLat[][] = []
  for (const [i, segment] of route.segments.entries()) {
    const line = segmentLine(graph, segment)
    if (line.length === 0) return refuse('way-not-loaded')
    segmentLines[i] = line
  }
  const first = segmentLines[0]![0]!
  const last = segmentLines[segmentLines.length - 1]!.at(-1)!
  const closedRoute = haversine(first[0], first[1], last[0], last[1]) < 1
  const segmentsOf = countBy(route.segments.map((segment) => segment.wayId))
  const order = route.segments.map((_, i) => i)
  if (reversed) order.reverse()

  const roles: string[] = []
  const rolesToAsk: RoleQuestion[] = []
  for (const [i, segment] of route.segments.entries()) {
    const choice = input.roleChoices?.[i]
    if (choice !== undefined) {
      roles[i] = choice
      continue
    }
    const tags = origWays.get(segment.wayId)!.tags
    const loop = closedRoute || (segmentsOf.get(segment.wayId) ?? 0) > 1
    const forward = reversed ? !segment.forward : segment.forward
    const decision = roleFor(kind, tags, forward, loop)
    roles[i] = decision.role
    if (decision.question) {
      rolesToAsk.push({ segment: i, wayId: partIds[i]!, ...decision.question })
    }
  }

  // 6. Point members of the stretch stay, next to the new way nearest to them
  const before: OsmRelationMember[][] = route.segments.map(() => [])
  const after: OsmRelationMember[][] = route.segments.map(() => [])
  const pointsToReview: PointReview[] = []
  const lastInOrder = order[order.length - 1]!
  for (const [k, m] of stretchMembers.entries()) {
    if (m.type === 'way') continue
    const index = from + k
    const kept: OsmRelationMember = { id: m.id, type: m.type, role: m.role }
    const loc = m.type === 'node' ? nodeLonlat(graph, m.id) : undefined
    if (!loc) {
      after[lastInOrder]!.push(kept)
      pointsToReview.push({
        index,
        id: m.id,
        type: m.type,
        role: m.role,
        distanceM: null,
        far: true,
      })
      continue
    }
    let nearest = 0
    let best = Infinity
    for (const [i, line] of segmentLines.entries()) {
      const d = distanceToLineM(loc, line)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    const line = segmentLines[nearest]!
    const nearStart = haversine(loc[0], loc[1], line[0]![0], line[0]![1])
    const nearEnd = haversine(loc[0], loc[1], line.at(-1)![0], line.at(-1)![1])
    // the first end in the relation's order is the travel end when the stretch is reversed
    const nearFirst = reversed ? nearEnd < nearStart : nearStart < nearEnd
    ;(nearFirst ? before : after)[nearest]!.push(kept)
    pointsToReview.push({
      index,
      id: m.id,
      type: m.type,
      role: m.role,
      distanceM: Math.round(best * 10) / 10,
      far: best > farM,
    })
  }

  // 7. The new stretch, and the members the relation ends up with
  const newStretch: OsmRelationMember[] = []
  const addedMembers: AddedMember[] = []
  for (const i of order) {
    newStretch.push(...before[i]!)
    addedMembers.push({
      segment: i,
      index: from + newStretch.length,
      id: partIds[i]!,
      fromWayId: route.segments[i]!.wayId,
      role: roles[i]!,
    })
    newStretch.push({ id: partIds[i]!, type: 'way', role: roles[i]! })
    newStretch.push(...after[i]!)
  }
  // `actionAddMember` with an index inserts the member as it is: the join of iD runs only without one
  newStretch.forEach((m, k) => run(actionAddMember(relationId, m, from + k)))

  const result = sim.hasEntity(relationId)
  const expected = [...members.slice(0, from), ...newStretch, ...members.slice(to + 1)]
  if (!(result instanceof OsmRelation) || !sameMembers(result.members, expected)) {
    return refuse('internal')
  }

  // 8. What the preview shows
  const left = countBy(partIds)
  const removedMembers: RemovedMember[] = []
  for (const [k, m] of stretchMembers.entries()) {
    if (m.type !== 'way') continue
    const count = left.get(m.id) ?? 0
    if (count > 0) {
      left.set(m.id, count - 1)
    } else {
      removedMembers.push({ index: from + k, id: m.id, type: 'way', role: m.role })
    }
  }

  const splitWays: SplitWay[] = route.splits.map((split, i) => ({
    wayId: split.wayId,
    newWayId: splitWayIds[i]!,
    nodeId: splitNodes[i]!.id,
    loc: split.loc,
    segment: segmentOfSplit[i] ?? -1,
  }))

  const otherRelations = new Set<EntityID>()
  for (const split of route.splits) {
    for (const parent of graph.parentRelations(origWays.get(split.wayId)!)) {
      if (parent.id !== relationId) otherRelations.add(parent.id)
    }
  }

  return {
    ok: true,
    actions,
    addedMembers,
    removedMembers,
    splitWays,
    otherRelationsTouched: [...otherRelations],
    rolesToAsk,
    pointsToReview,
    members: result.members,
    lengthM: route.lengthM,
  }
}

function sameMembers(a: OsmRelationMember[], b: OsmRelationMember[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, k) => m.id === b[k]!.id && m.type === b[k]!.type && m.role === b[k]!.role)
  )
}
