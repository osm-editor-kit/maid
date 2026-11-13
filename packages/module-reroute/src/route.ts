/**
 * The reroute's preview of a route relation, pure: the via points snapped to the routing graph, the stretch of members
 * they replace (and the occurrence the mapper picked when the stretch occurs more than once), the route the router finds
 * between them, and the plan of the edits (plan.ts), which also gives what the route changes and the role questions.
 * No React, no editing. Docs: docs/research/relation-handling.md, section 7.
 *
 * The router is the slow part, so its answer is kept per graph and pair of points (`routeBetween`): a change of an answer
 * or of the occurrence plans again on that route. The preview is kept too, so the map and the inspector section, which
 * both ask with the same inputs, get one preview (`previewReroute`).
 */
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import {
  bicycleProfile,
  buildRoutingGraph,
  findRoute,
  footProfile,
  mapperProfile,
  snapToGraph,
  snapToWay,
  type Profile,
  type RouteResult,
  type RoutingGraph,
  type Snap,
  type SplitPoint,
} from '@osm-editor-kit/maid-routing'
import type { RerouteRequest } from './apply-port.ts'
import { distanceToLineM, lineLengthM, wayLine, type Lonlat } from './geometry.ts'
import {
  planReroute,
  routeWaysOf,
  stretchesBetween,
  type PlanResult,
  type RouteWay,
} from './plan.ts'

/**
 * A point the person set, as longitude and latitude. `member`: for a start or an end at a support point of the route
 * (chain.ts), the member index of the way it lies on, so it snaps onto that way and no neighbour that shares the node.
 */
export type ViaPoint = { lon: number; lat: number; member?: number }

/** A via point after snapping: `loc` is where it is on the routing graph, or the pointer when no road is near */
export type Via = ViaPoint & { loc: Lonlat; snap?: Snap }

/** The members the route replaces: first and last index in the member list (inclusive, from <= to). `reversed`: the route
 * runs from `to` back to `from` */
export type Stretch = { from: number; to: number; reversed: boolean }

/** The state of the reroute the preview needs, besides the relation and the graph */
export type PreviewInput = {
  start?: ViaPoint
  end?: ViaPoint
  /** Points the new path must pass, in order from the start to the end (dragged out of the line, as in a route planner) */
  vias?: readonly ViaPoint[]
  /**
   * The member index of the way the reroute was started from (the edit menu on a way). The start and the end prefer
   * that way where it ties with a neighbour, and the stretches that hold it come first.
   */
  anchor?: number
  /** Which occurrence of a stretch that occurs more than once the mapper picked (0 is the first) */
  occurrence: number
  /** The mapper's answers to the role questions, by route segment index */
  roleChoices: Readonly<Record<number, string>>
  /** Whether an entity is read-only (the filters); a read-only way or relation refuses the plan. Absent: none is */
  readOnly?: (id: EntityID) => boolean
}

export type RoutePreview = {
  relationId: EntityID
  profile: Profile
  start?: Via
  end?: Via
  /** The points between, as the input gave them, snapped to any road or path */
  vias: Via[]
  /** Every stretch the two points give: more than one when the stretch occurs more than once in the relation */
  stretches: Stretch[]
  /** The stretch in use: `stretches[occurrence]` */
  stretch?: Stretch
  /** Set once both points are there */
  route?: RouteResult
  /** Set when the route is found and the stretch is known: the edits, and what they change */
  plan?: PlanResult
  /** The ids of the members of the stretch, as the plan must find them when applied */
  expectedIds: EntityID[]
  /** The length of the members the stretch replaces, whole ways, in metres */
  oldLengthM: number
  roleChoices: Readonly<Record<number, string>>
  /** The ways the route runs on, with their nodes and tags as they are now: the apply checks them again */
  routeWays: RouteWay[]
}

/** The profile a route relation is routed with (the mapper's: every highway can be reached), or undefined when the reroute does not work on it */
export function profileOfRoute(tags: Readonly<Record<string, string>>): Profile | undefined {
  if (tags.type !== 'route') return undefined
  switch (tags.route) {
    case 'bicycle':
    case 'mtb':
      return mapperProfile(bicycleProfile)
    case 'hiking':
    case 'foot':
    case 'walking':
      return mapperProfile(footProfile)
    case undefined:
    default:
      return undefined
  }
}

const routingGraphs = new WeakMap<Graph, Map<Profile, RoutingGraph>>()

/**
 * The routing graph of the data for one profile. Built on first use and kept for as long as the graph object is the
 * same: an edit makes a new graph object, a drag of a point does not.
 */
export function routingGraphOf(graph: Graph, profile: Profile): RoutingGraph {
  let byProfile = routingGraphs.get(graph)
  if (!byProfile) {
    byProfile = new Map()
    routingGraphs.set(graph, byProfile)
  }
  let routing = byProfile.get(profile)
  if (!routing) {
    routing = buildRoutingGraph(graph, profile)
    byProfile.set(profile, routing)
  }
  return routing
}

/** Snaps a point to the nearest road or path the profile may use (within the router's reach) */
function viaOf(routing: RoutingGraph, point: ViaPoint): Via {
  const snap = snapToGraph(routing, point.lon, point.lat)
  return { ...point, loc: snap ? snap.loc : [point.lon, point.lat], snap }
}

/** The member index of the way nearest to a location, and its distance; the first one at a tie, or `prefer` when it ties */
function nearestWayMember(
  graph: Graph,
  relation: OsmRelation,
  loc: Lonlat,
  prefer?: number,
): { index: number; distanceM: number } | undefined {
  let best: number | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  const lines = new Map<EntityID, number>()
  relation.members.forEach((member, index) => {
    if (member.type !== 'way') return
    let distance = lines.get(member.id)
    if (distance === undefined) {
      distance = distanceToLineM(loc, wayLine(graph, member.id))
      lines.set(member.id, distance)
    }
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  if (best === undefined) return undefined
  const preferred = prefer === undefined ? undefined : relation.members[prefer]
  if (preferred?.type === 'way' && (lines.get(preferred.id) ?? Infinity) <= bestDistance + TIE_M) {
    return { index: prefer!, distanceM: lines.get(preferred.id)! }
  }
  return { index: best, distanceM: bestDistance }
}

/** Two member ways this close to a point are a tie (a point on the node they share), in metres */
const TIE_M = 0.5
/** How far the start or the end may be from the route's own ways to snap onto them, in metres (the router's reach) */
const ON_ROUTE_M = 200

/**
 * The start or the end of the stretch: on the route's own way nearest to the point, so that the stretch begins and ends
 * on the route. Off the route (no member way within reach, or the nearest one is not routable): the nearest road.
 */
function endOf(
  graph: Graph,
  relation: OsmRelation,
  routing: RoutingGraph,
  point: ViaPoint,
  anchor: number | undefined,
): Via {
  const given = point.member === undefined ? undefined : relation.members[point.member]
  if (given?.type === 'way') {
    const snap = snapToWay(routing, given.id, point.lon, point.lat)
    if (snap) return { ...point, loc: snap.loc, snap }
  }
  const nearest = nearestWayMember(graph, relation, [point.lon, point.lat], anchor)
  if (nearest && nearest.distanceM <= ON_ROUTE_M) {
    const wayId = relation.members[nearest.index]!.id
    const snap = snapToWay(routing, wayId, point.lon, point.lat)
    if (snap) return { ...point, loc: snap.loc, snap }
  }
  return viaOf(routing, point)
}

/**
 * The stretches the two points give. When both lie on member ways, the member occurrences of those ways (plan.ts
 * `stretchesBetween`); otherwise the members nearest to each point, as one stretch.
 */
function stretchCandidates(
  graph: Graph,
  relation: OsmRelation,
  start: Via,
  end: Via,
  anchor: number | undefined,
): Stretch[] {
  // the ends at support points of the route: the members between them, exactly
  if (start.member !== undefined && end.member !== undefined && start.member <= end.member) {
    return [{ from: start.member, to: end.member, reversed: false }]
  }
  let found: Stretch[] = []
  if (start.snap && end.snap) {
    found = stretchesBetween(relation, start.snap.wayId, end.snap.wayId).map((stretch) => ({
      ...stretch,
      reversed: false,
    }))
    if (found.length === 0) {
      found = stretchesBetween(relation, end.snap.wayId, start.snap.wayId).map((stretch) => ({
        ...stretch,
        reversed: true,
      }))
    }
  }
  if (found.length === 0) {
    const first = nearestWayMember(graph, relation, start.loc, anchor)?.index
    const last = nearestWayMember(graph, relation, end.loc, anchor)?.index
    if (first === undefined || last === undefined) return []
    return [{ from: Math.min(first, last), to: Math.max(first, last), reversed: first > last }]
  }
  if (anchor === undefined || found.length < 2) return found
  // started from a way: the shortest stretches that hold it come first, so the first occurrence is the one meant
  const holds = (stretch: Stretch) => stretch.from <= anchor && anchor <= stretch.to
  return [...found].sort(
    (a, b) =>
      Number(holds(b)) - Number(holds(a)) || a.to - a.from - (b.to - b.from) || a.from - b.from,
  )
}

/** One key per snapped point: the router's answer depends on where the point is on the routing graph, not on the pointer */
function pointKey(via: Via | undefined): string {
  if (!via) return '-'
  const snap = via.snap
  return snap ? `${snap.edge}:${snap.segment}:${snap.t}` : `unsnapped:${via.loc[0]},${via.loc[1]}`
}

/** The router's answers kept per graph: a few pairs of points, so a drag back and forth finds its route again */
const ROUTES_PER_GRAPH = 8
const routes = new WeakMap<Graph, Map<string, RouteResult>>()

/** The route between the two points on this graph, found once for the pair (the router is the slow part) */
function routeBetween(
  graph: Graph,
  profile: Profile,
  routing: RoutingGraph,
  start: Via,
  end: Via,
): RouteResult {
  let known = routes.get(graph)
  if (!known) {
    known = new Map()
    routes.set(graph, known)
  }
  const key = `${profile.name}|${pointKey(start)}|${pointKey(end)}`
  const found = known.get(key)
  if (found) return found

  let route: RouteResult
  if (!start.snap) route = { ok: false, reason: 'start-not-routable', expanded: 0 }
  else if (!end.snap) route = { ok: false, reason: 'end-not-routable', expanded: 0 }
  else route = findRoute(routing, { snap: start.snap }, { snap: end.snap })

  if (known.size >= ROUTES_PER_GRAPH) {
    const oldest = known.keys().next()
    if (!oldest.done) known.delete(oldest.value)
  }
  known.set(key, route)
  return route
}

/**
 * Two legs as one route: the second leg starts where the first ends (a via point). Where both run on one way in one
 * direction through the via point, their two pieces are one segment and the via point is no split (a via point in the
 * middle of a way does not cut it).
 */
export function joinRoutes(first: RouteResult, second: RouteResult): RouteResult {
  if (!first.ok) return first
  if (!second.ok) return second
  const segments = [...first.segments]
  const splits = [...first.splits]
  let rest = second.segments
  let restSplits = second.splits
  const last = segments.at(-1)
  const next = rest[0]
  if (last && next && last.wayId === next.wayId && last.forward === next.forward) {
    const via = last.endSplit
    const { endSplit: _via, ...kept } = last
    segments[segments.length - 1] = {
      ...kept,
      toIndex: next.toIndex,
      lengthM: last.lengthM + next.lengthM,
      ...(next.endSplit && { endSplit: next.endSplit }),
    }
    rest = rest.slice(1)
    const same = (a: SplitPoint, b: SplitPoint | undefined) =>
      b !== undefined && a.wayId === b.wayId && a.segment === b.segment && a.t === b.t
    if (via) {
      const at = splits.findLastIndex((split) => same(split, via))
      if (at >= 0) splits.splice(at, 1)
    }
    if (next.startSplit) {
      const startSplit = next.startSplit
      const at = restSplits.findIndex((split) => same(split, startSplit))
      if (at >= 0) restSplits = restSplits.filter((_, index) => index !== at)
    }
  }
  return {
    ok: true,
    segments: [...segments, ...rest],
    splits: [...splits, ...restSplits],
    lengthM: first.lengthM + second.lengthM,
    cost: first.cost + second.cost,
    expanded: first.expanded + second.expanded,
  }
}

/** The route through the points in order: one leg per pair, each found once (`routeBetween`), joined */
function routeThrough(
  graph: Graph,
  profile: Profile,
  routing: RoutingGraph,
  points: readonly Via[],
): RouteResult {
  let route: RouteResult | undefined
  for (let index = 1; index < points.length; index++) {
    const leg = routeBetween(graph, profile, routing, points[index - 1]!, points[index]!)
    route = route ? joinRoutes(route, leg) : leg
    if (!route.ok) return route
  }
  return route ?? { ok: false, reason: 'no-path', expanded: 0 }
}

/** The length of the way members of a stretch, whole ways, in metres */
function stretchLengthM(graph: Graph, relation: OsmRelation, stretch: Stretch | undefined): number {
  if (!stretch) return 0
  let length = 0
  for (let index = stretch.from; index <= stretch.to; index++) {
    const member = relation.members[index]
    if (member?.type === 'way') length += lineLengthM(wayLine(graph, member.id))
  }
  return length
}

/**
 * The last preview, with the inputs it was made from. Reused while the inputs are the same objects and the read-only
 * answers it asked for are the same (`answers`): the map and the section ask in the same render.
 */
type PreviewMemo = {
  graph: Graph
  relation: OsmRelation
  start?: ViaPoint
  end?: ViaPoint
  vias?: readonly ViaPoint[]
  anchor?: number
  occurrence: number
  roleChoices: Readonly<Record<number, string>>
  /** Whether the input had a read-only check, and the answers the plan got from it */
  checked: boolean
  answers: Array<[EntityID, boolean]>
  preview: RoutePreview
}
let lastPreview: PreviewMemo | undefined

function answersHold(
  memo: PreviewMemo,
  readOnly: ((id: EntityID) => boolean) | undefined,
): boolean {
  if ((readOnly !== undefined) !== memo.checked) return false
  return memo.answers.every(([id, answer]) => readOnly?.(id) === answer)
}

/**
 * The preview for the state of the reroute on a route relation. Undefined when the relation is not one the reroute
 * works on. Each part appears as its inputs do: the start alone snaps, both points give the stretch and the route, and
 * the route with a stretch gives the plan.
 */
export function previewReroute(
  graph: Graph,
  relation: OsmRelation,
  input: PreviewInput,
): RoutePreview | undefined {
  const profile = profileOfRoute(relation.tags ?? {})
  if (!profile) return undefined
  const memo = lastPreview
  if (
    memo &&
    memo.graph === graph &&
    memo.relation === relation &&
    memo.start === input.start &&
    memo.end === input.end &&
    memo.vias === input.vias &&
    memo.anchor === input.anchor &&
    memo.occurrence === input.occurrence &&
    memo.roleChoices === input.roleChoices &&
    answersHold(memo, input.readOnly)
  ) {
    return memo.preview
  }

  // the plan asks the read-only check; its answers are kept, so the memo can tell when they would change
  const answers: Array<[EntityID, boolean]> = []
  const check = input.readOnly
  const readOnly =
    check &&
    ((id: EntityID) => {
      const answer = check(id)
      answers.push([id, answer])
      return answer
    })

  const routing = routingGraphOf(graph, profile)
  const preview: RoutePreview = {
    relationId: relation.id,
    profile,
    start: input.start ? endOf(graph, relation, routing, input.start, input.anchor) : undefined,
    end: input.end ? endOf(graph, relation, routing, input.end, input.anchor) : undefined,
    vias: (input.vias ?? []).map((point) => viaOf(routing, point)),
    stretches: [],
    expectedIds: [],
    oldLengthM: 0,
    roleChoices: input.roleChoices,
    routeWays: [],
  }
  if (preview.start && preview.end) {
    preview.stretches = stretchCandidates(graph, relation, preview.start, preview.end, input.anchor)
    preview.stretch = preview.stretches[Math.min(input.occurrence, preview.stretches.length - 1)]
    preview.oldLengthM = stretchLengthM(graph, relation, preview.stretch)
    // a via point with no road near is left out: its handle shows grey, and the route goes on without it
    const vias = preview.vias.filter((via) => via.snap !== undefined)
    preview.route = routeThrough(graph, profile, routing, [preview.start, ...vias, preview.end])
    if (preview.stretch) {
      const { from, to } = preview.stretch
      preview.expectedIds = relation.members.slice(from, to + 1).map((member) => member.id)
    }
    if (preview.route.ok && preview.stretch) {
      const { from, to, reversed } = preview.stretch
      preview.plan = planReroute({
        graph,
        relationId: relation.id,
        stretch: { from, to, reversed },
        expectedIds: preview.expectedIds,
        route: preview.route,
        roleChoices: input.roleChoices,
        readOnly,
      })
    }
    preview.routeWays = preview.route?.ok ? routeWaysOf(graph, preview.route) : []
  }

  lastPreview = {
    graph,
    relation,
    start: input.start,
    end: input.end,
    vias: input.vias,
    anchor: input.anchor,
    occurrence: input.occurrence,
    roleChoices: input.roleChoices,
    checked: check !== undefined,
    answers,
    preview,
  }
  return preview
}

/**
 * What the port is given to write the reroute, or undefined while the plan is not made. The port plans again on the data
 * as it is then, and checks the ways of the route (`routeWays`), so a change since the preview refuses rather than writes
 * a stale plan.
 */
export function requestOf(preview: RoutePreview): RerouteRequest | undefined {
  const { route, stretch, plan } = preview
  if (!route || !route.ok || !stretch || !plan || !plan.ok) return undefined
  return {
    relationId: preview.relationId,
    stretch: { from: stretch.from, to: stretch.to, reversed: stretch.reversed },
    expectedIds: preview.expectedIds,
    route,
    roleChoices: preview.roleChoices,
    routeWays: preview.routeWays,
  }
}
