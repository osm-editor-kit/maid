/**
 * The reroute's preview of a route relation, pure: the via points snapped to the routing graph, the stretch of members
 * they replace (and the occurrence the mapper picked when the stretch occurs more than once), the route the router finds
 * between them, and the plan of the edits (plan.ts), which also gives what the route changes and the role questions.
 * No React, no editing. Docs: docs/research/relation-handling.md, section 7.
 */
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import {
  bicycleProfile,
  buildRoutingGraph,
  findRoute,
  footProfile,
  snapToGraph,
  type Profile,
  type RouteResult,
  type RoutingGraph,
  type Snap,
} from '@osm-editor-kit/maid-routing'
import type { RerouteRequest } from './apply-port.ts'
import { distanceToLineM, lineLengthM, wayLine, type Lonlat } from './geometry.ts'
import { planReroute, stretchesBetween, type PlanResult } from './plan.ts'

/** A point the person set, as longitude and latitude */
export type ViaPoint = { lon: number; lat: number }

/** A via point after snapping: `loc` is where it is on the routing graph, or the pointer when no road is near */
export type Via = ViaPoint & { loc: Lonlat; snap?: Snap }

/** The members the route replaces: first and last index in the member list (inclusive, from <= to) */
export type Stretch = { from: number; to: number; reversed: boolean }

/** The state of the reroute the preview needs, besides the relation and the graph */
export type PreviewInput = {
  start?: ViaPoint
  end?: ViaPoint
  /** Which occurrence of a stretch that occurs more than once the mapper picked (0 is the first) */
  occurrence: number
  /** The mapper's answers to the role questions, by route segment index */
  roleChoices: Readonly<Record<number, string>>
}

export type RoutePreview = {
  relationId: EntityID
  profile: Profile
  start?: Via
  end?: Via
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
}

/** The profile a route relation is routed with, or undefined when the reroute does not work on it */
export function profileOfRoute(tags: Readonly<Record<string, string>>): Profile | undefined {
  if (tags.type !== 'route') return undefined
  switch (tags.route) {
    case 'bicycle':
    case 'mtb':
      return bicycleProfile
    case 'hiking':
    case 'foot':
    case 'walking':
      return footProfile
    case undefined:
    default:
      return undefined
  }
}

const routingGraphs = new WeakMap<Graph, Map<string, RoutingGraph>>()

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
  let routing = byProfile.get(profile.name)
  if (!routing) {
    routing = buildRoutingGraph(graph, profile)
    byProfile.set(profile.name, routing)
  }
  return routing
}

/** Snaps a point to the nearest road or path the profile may use (within the router's reach) */
function viaOf(routing: RoutingGraph, point: ViaPoint): Via {
  const snap = snapToGraph(routing, point.lon, point.lat)
  return { ...point, loc: snap ? snap.loc : [point.lon, point.lat], snap }
}

/** The member index of the way nearest to a location; the first one at a tie */
function nearestWayMember(graph: Graph, relation: OsmRelation, loc: Lonlat): number | undefined {
  let best: number | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  relation.members.forEach((member, index) => {
    if (member.type !== 'way') return
    const distance = distanceToLineM(loc, wayLine(graph, member.id))
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/**
 * The stretches the two points give. When both lie on member ways, the member occurrences of those ways (plan.ts
 * `stretchesBetween`); otherwise the members nearest to each point, as one stretch.
 */
export function stretchCandidates(
  graph: Graph,
  relation: OsmRelation,
  start: Via,
  end: Via,
): Stretch[] {
  if (start.snap && end.snap) {
    const exact = stretchesBetween(relation, start.snap.wayId, end.snap.wayId)
    if (exact.length > 0) return exact.map((stretch) => ({ ...stretch, reversed: false }))
  }
  const first = nearestWayMember(graph, relation, start.loc)
  const last = nearestWayMember(graph, relation, end.loc)
  if (first === undefined || last === undefined) return []
  return [{ from: Math.min(first, last), to: Math.max(first, last), reversed: first > last }]
}

function routeBetween(routing: RoutingGraph, start: Via, end: Via): RouteResult {
  if (!start.snap) return { ok: false, reason: 'start-not-routable', expanded: 0 }
  if (!end.snap) return { ok: false, reason: 'end-not-routable', expanded: 0 }
  return findRoute(routing, { snap: start.snap }, { snap: end.snap })
}

/** The length of the way members of a stretch, whole ways, in metres */
export function stretchLengthM(
  graph: Graph,
  relation: OsmRelation,
  stretch: Stretch | undefined,
): number {
  if (!stretch) return 0
  let length = 0
  for (let index = stretch.from; index <= stretch.to; index++) {
    const member = relation.members[index]
    if (member?.type === 'way') length += lineLengthM(wayLine(graph, member.id))
  }
  return length
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
  const routing = routingGraphOf(graph, profile)
  const preview: RoutePreview = {
    relationId: relation.id,
    profile,
    start: input.start ? viaOf(routing, input.start) : undefined,
    end: input.end ? viaOf(routing, input.end) : undefined,
    stretches: [],
    expectedIds: [],
    oldLengthM: 0,
    roleChoices: input.roleChoices,
  }
  if (!preview.start || !preview.end) return preview
  preview.stretches = stretchCandidates(graph, relation, preview.start, preview.end)
  preview.stretch = preview.stretches[Math.min(input.occurrence, preview.stretches.length - 1)]
  preview.oldLengthM = stretchLengthM(graph, relation, preview.stretch)
  preview.route = routeBetween(routing, preview.start, preview.end)
  if (preview.stretch) {
    const { from, to } = preview.stretch
    preview.expectedIds = relation.members.slice(from, to + 1).map((member) => member.id)
  }
  if (preview.route.ok && preview.stretch) {
    const { from, to } = preview.stretch
    preview.plan = planReroute({
      graph,
      relationId: relation.id,
      stretch: { from, to },
      expectedIds: preview.expectedIds,
      route: preview.route,
      roleChoices: input.roleChoices,
    })
  }
  return preview
}

/**
 * What the port is given to write the reroute, or undefined while the plan is not made. Apply plans again on the data
 * as it is then, so a change since the preview refuses rather than writes a stale plan.
 */
export function requestOf(preview: RoutePreview): RerouteRequest | undefined {
  const { route, stretch, plan } = preview
  if (!route || !route.ok || !stretch || !plan || !plan.ok) return undefined
  return {
    relationId: preview.relationId,
    stretch: { from: stretch.from, to: stretch.to },
    expectedIds: preview.expectedIds,
    route,
    roleChoices: preview.roleChoices,
  }
}
