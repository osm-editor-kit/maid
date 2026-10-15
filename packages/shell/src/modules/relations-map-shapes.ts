/**
 * What a relation draws on the map, as GeoJSON for relations-map.tsx. Pure: plain graphs in, features out, so it is
 * tested without MapLibre (relations-map-shapes.test.ts).
 *
 * A route (`type=route`): the two ends of each gap the sidebar shows (routeGaps in relations-logic.ts), and the travel
 * direction of each way member, for arrows. A superrelation (`route_master`, `superroute`, or any relation with relation
 * members): its own way members, and the way members of each sub-route, drawn lighter unless a sub-route is hovered in
 * the sidebar; then only that sub-route is strong.
 */
import { OsmNode, OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { cssSupportsColour, routeGaps } from './relations-logic.ts'

/** lon, lat */
export type Position = [number, number]

/**
 * GeoJSON as the map takes it: the shapes of the GeoJSON spec, written here because the shell has no @types/geojson of
 * its own. Structurally the same as the geojson types, so react-map-gl's Source takes them.
 */
type Geometry<Kind extends string, Coordinates> = { type: Kind; coordinates: Coordinates }
type LineString = Geometry<'LineString', Position[]>
type Point = Geometry<'Point', Position>
type Feature<G> = { type: 'Feature'; properties: Record<string, string | number>; geometry: G }
type FeatureCollection<G> = { type: 'FeatureCollection'; features: Feature<G>[] }

/** The way a route is travelled: along the way's node order, or against it */
export type Travel = 'forward' | 'backward'

/** The renderer's hover colour: the colour of a route or sub-route without a usable `colour` tag */
export const DEFAULT_COLOUR = '#f6634f'

/** Stops, platforms and other nodes of a route are not on its line: the same rule as relations-logic.ts */
const STOP_OR_PLATFORM_ROLE = /^(stop|platform)(_|$)/

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** A plain colour name (`red`, `darkgreen`): MapLibre reads the CSS names; functions such as `oklch()` are left out */
const COLOUR_NAME = /^[a-z]+$/i

/**
 * The relation's `colour` tag when the map can paint it, else undefined: a hex value, or a colour name the browser
 * knows (the same check as the sidebar's dot, relations-logic.ts `cssSupportsColour`)
 */
export function drawableColour(
  value: string | undefined,
  supports: (value: string) => boolean = cssSupportsColour,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (HEX_COLOUR.test(trimmed)) return trimmed
  return COLOUR_NAME.test(trimmed) && supports(trimmed) ? trimmed : undefined
}

/** A short text for a relation on the map: its ref, else its name, else nothing */
export function mapLabelOf(tags: Record<string, string>): string {
  return tags.ref?.trim() || tags.name?.trim() || ''
}

/** What the map draws for a relation: a route (gaps and arrows), a superrelation (groups), or nothing */
export function drawingKind(relation: OsmRelation): 'route' | 'group' | undefined {
  if (relation.tags.type === 'route') return 'route'
  if (relation.tags.type === 'route_master' || relation.tags.type === 'superroute') return 'group'
  if (relation.members.some((member) => member.type === 'relation')) return 'group'
  return undefined
}

/** The position of a node, or undefined when it is not loaded */
function positionOf(graph: Graph, nodeId: EntityID): Position | undefined {
  const node = graph.hasEntity(nodeId)
  if (!(node instanceof OsmNode) || !node.loc) return undefined
  return [node.loc[0], node.loc[1]]
}

/** The coordinates of a loaded way in node order. Undefined when a node of it is not loaded: no partial line. */
export function wayPositions(graph: Graph, way: OsmWay): Position[] | undefined {
  const out: Position[] = []
  for (const nodeId of way.nodes) {
    const at = positionOf(graph, nodeId)
    if (!at) return undefined
    out.push(at)
  }
  return out.length >= 2 ? out : undefined
}

/**
 * Squared distance for comparing two points that are close together: longitude scaled by the cosine of the
 * latitude, so one degree of longitude counts as much as a degree of latitude at the same place.
 */
function distance2(p: Position, q: Position): number {
  const x = (p[0] - q[0]) * Math.cos((((p[1] + q[1]) / 2) * Math.PI) / 180)
  const y = p[1] - q[1]
  return x * x + y * y
}

/** The length of a line, in the same rough units as distance2 (a comparison, not a distance in metres) */
function roughLength(positions: readonly Position[]): number {
  let sum = 0
  for (let i = 1; i < positions.length; i++)
    sum += Math.sqrt(distance2(positions[i - 1]!, positions[i]!))
  return sum
}

/** The nodes where a way can meet another: its two ends, or every node of a closed way (as relations-logic.ts) */
function touchPoints(way: OsmWay): EntityID[] {
  if (way.isClosed()) return way.nodes
  return [way.first(), way.last()].filter((node): node is EntityID => node !== undefined)
}

/** The first and last node of a way (the same node twice for a closed way) */
function endsOf(way: OsmWay): EntityID[] {
  return [way.first(), way.last()].filter((node): node is EntityID => node !== undefined)
}

/** The way members of a route in their order, stops and platforms left out. `index` is the place in relation.members. */
type ChainLink = { index: number; role: string; way: OsmWay | undefined }

function chainOf(graph: Graph, relation: OsmRelation): ChainLink[] {
  const chain: ChainLink[] = []
  relation.members.forEach((member, index) => {
    if (member.type !== 'way' || STOP_OR_PLATFORM_ROLE.test(member.role)) return
    const entity = graph.hasEntity(member.id)
    chain.push({ index, role: member.role, way: entity instanceof OsmWay ? entity : undefined })
  })
  return chain
}

/** A gap of a route: the two ends that are nearest each other, one on each side of the gap */
export type GapEnds = { index: number; from: Position; to: Position }

/**
 * The ends of each gap of a route, the same gaps as routeGaps gives. `index` is the earlier member, as routeGaps has
 * it. A gap whose ends are not loaded has no entry; a gap is never drawn between ends that are far apart on purpose
 * (the nearer pair is taken, which is where the mapper's gap is).
 */
export function routeGapEnds(graph: Graph, relation: OsmRelation): GapEnds[] {
  const chain = chainOf(graph, relation)
  const out: GapEnds[] = []
  for (const index of routeGaps(graph, relation)) {
    const at = chain.findIndex((link) => link.index === index)
    const before = chain[at]?.way
    const after = chain[at + 1]?.way
    if (!before || !after) continue
    const ends = closestEnds(graph, before, after)
    if (ends) out.push({ index, from: ends[0], to: ends[1] })
  }
  return out
}

/** The pair of end positions (one of each way) that are nearest each other. Undefined when neither way has loaded ends. */
function closestEnds(graph: Graph, a: OsmWay, b: OsmWay): [Position, Position] | undefined {
  const as = endsOf(a)
    .map((id) => positionOf(graph, id))
    .filter((p): p is Position => p !== undefined)
  const bs = endsOf(b)
    .map((id) => positionOf(graph, id))
    .filter((p): p is Position => p !== undefined)
  let best: { p: Position; q: Position; d: number } | undefined
  for (const p of as)
    for (const q of bs) {
      const d = distance2(p, q)
      if (!best || d < best.d) best = { p, q, d }
    }
  return best && [best.p, best.q]
}

/** How a way meets a neighbour in the chain: at its first node, its last, both (a loop), or not at all. */
function touchOf(
  way: OsmWay,
  neighbour: OsmWay | undefined,
): 'first' | 'last' | 'both' | undefined {
  if (!neighbour) return undefined
  const touch = new Set(touchPoints(neighbour))
  const first = way.first()
  const last = way.last()
  const atFirst = first !== undefined && touch.has(first)
  const atLast = last !== undefined && touch.has(last)
  if (atFirst && atLast) return 'both'
  if (atFirst) return 'first'
  if (atLast) return 'last'
  return undefined
}

/**
 * The travel direction of a way between its neighbours in the chain. The node it shares with the way before says where
 * the route enters it; the node it shares with the way after says where it leaves. Neither: the role (`forward` or
 * `backward`, which mean the same thing). A closed way (a roundabout) has no direction the chain can tell, and a
 * loop with both neighbours at both ends has none either.
 */
export function travelOf(
  way: OsmWay,
  before: OsmWay | undefined,
  after: OsmWay | undefined,
  role: string,
): Travel | undefined {
  if (way.isClosed()) return undefined
  const entered = touchOf(way, before)
  if (entered === 'first') return 'forward'
  if (entered === 'last') return 'backward'
  if (entered === 'both') return undefined
  const left = touchOf(way, after)
  if (left === 'last') return 'forward'
  if (left === 'first') return 'backward'
  if (left === 'both') return undefined
  if (role === 'forward' || role === 'backward') return role
  return undefined
}

/**
 * The travel direction of each way member of a route, keyed by its index in relation.members. Members whose direction
 * cannot be told are left out (they get no arrows). Stops and platforms are not members of the line.
 */
export function memberTravel(graph: Graph, relation: OsmRelation): Map<number, Travel> {
  const chain = chainOf(graph, relation)
  const out = new Map<number, Travel>()
  chain.forEach((link, at) => {
    if (!link.way) return
    const travel = travelOf(link.way, chain[at - 1]?.way, chain[at + 1]?.way, link.role)
    if (travel) out.set(link.index, travel)
  })
  return out
}

/** A GeoJSON line with the given properties */
function lineFeature(
  coordinates: Position[],
  properties: Record<string, string | number>,
): Feature<LineString> {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
}

/** A GeoJSON point with the given properties */
function pointFeature(
  position: Position,
  properties: Record<string, string | number>,
): Feature<Point> {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: position } }
}

/**
 * Each way member of a route with a known direction, as a line in its travel direction: the node order for `forward`,
 * reversed for `backward`, so an arrow pattern along the line points the way the route goes.
 */
export function arrowFeatures(graph: Graph, relation: OsmRelation): FeatureCollection<LineString> {
  const travel = memberTravel(graph, relation)
  const features: Feature<LineString>[] = []
  for (const link of chainOf(graph, relation)) {
    const direction = travel.get(link.index)
    if (!direction || !link.way) continue
    const positions = wayPositions(graph, link.way)
    if (!positions) continue
    features.push(lineFeature(direction === 'backward' ? positions.reverse() : positions, {}))
  }
  return { type: 'FeatureCollection', features }
}

/** Two points per gap of a route: one at each end. */
export function gapFeatures(graph: Graph, relation: OsmRelation): FeatureCollection<Point> {
  const features: Feature<Point>[] = []
  for (const gap of routeGapEnds(graph, relation)) {
    features.push(
      pointFeature(gap.from, { gap: gap.index }),
      pointFeature(gap.to, { gap: gap.index }),
    )
  }
  return { type: 'FeatureCollection', features }
}

/**
 * The members of a superrelation as the map shows them: its own way members (`direct`), and the way members of each
 * loaded sub-route (`subRoutes`), one level down as related.ts does. Sub-routes that are not loaded are left out.
 */
export type SubRoute = { id: string; colour: string; label: string; ways: EntityID[] }

export function subRoutesOf(
  graph: Graph,
  relation: OsmRelation,
): { direct: EntityID[]; subRoutes: SubRoute[] } {
  const direct: EntityID[] = []
  const subRoutes: SubRoute[] = []
  for (const member of relation.members) {
    if (member.type === 'way') {
      direct.push(member.id)
      continue
    }
    if (member.type !== 'relation' || member.id === relation.id) continue
    const sub = graph.hasEntity(member.id)
    if (!(sub instanceof OsmRelation)) continue
    const ways: EntityID[] = []
    for (const inner of sub.members)
      if (inner.type === 'way' && inner.id !== relation.id) ways.push(inner.id)
    subRoutes.push({
      id: sub.id,
      colour: drawableColour(sub.tags.colour) ?? DEFAULT_COLOUR,
      label: mapLabelOf(sub.tags),
      ways,
    })
  }
  return { direct, subRoutes }
}

/** The lines of a superrelation and one label line per sub-route */
export type GroupDrawing = {
  lines: FeatureCollection<LineString>
  labels: FeatureCollection<LineString>
}

/**
 * The lines of a superrelation. With no sub-route hovered, the superrelation's own way members are strong and the
 * ways of its sub-routes are lighter. With a sub-route hovered (`hovered` is its id), only that sub-route's ways are
 * strong. A way that is in two groups is drawn once, in the group that is strong (or the first one). Each sub-route
 * gets one label, on its longest loaded way, in its colour.
 */
export function groupFeatures(
  graph: Graph,
  relation: OsmRelation,
  hovered: string | null,
): GroupDrawing {
  const { direct, subRoutes } = subRoutesOf(graph, relation)
  const owners: { id: string | null; colour: string; ways: EntityID[] }[] = [
    { id: null, colour: drawableColour(relation.tags.colour) ?? DEFAULT_COLOUR, ways: direct },
    ...subRoutes.map((sub) => ({ id: sub.id, colour: sub.colour, ways: sub.ways })),
  ]
  const isStrong = (owner: { id: string | null }) =>
    hovered === null ? owner.id === null : owner.id === hovered
  // the strong owners first, so a way in both a strong and a light group takes the strong colour
  const ordered = [...owners.filter(isStrong), ...owners.filter((owner) => !isStrong(owner))]
  const positions = new Map<EntityID, Position[] | undefined>()
  const positionsOf = (wayId: EntityID) => {
    if (!positions.has(wayId)) {
      const way = graph.hasEntity(wayId)
      positions.set(wayId, way instanceof OsmWay ? wayPositions(graph, way) : undefined)
    }
    return positions.get(wayId)
  }
  const claimed = new Set<EntityID>()
  const lines: Feature<LineString>[] = []
  for (const owner of ordered) {
    for (const wayId of owner.ways) {
      if (claimed.has(wayId)) continue
      const line = positionsOf(wayId)
      if (!line) continue
      claimed.add(wayId)
      lines.push(lineFeature(line, { colour: owner.colour, strong: isStrong(owner) ? 1 : 0 }))
    }
  }
  const labels: Feature<LineString>[] = []
  for (const sub of subRoutes) {
    if (!sub.label) continue
    let longest: Position[] | undefined
    let longestLength = -1
    for (const wayId of sub.ways) {
      const line = positionsOf(wayId)
      if (!line) continue
      const length = roughLength(line)
      if (length > longestLength) {
        longest = line
        longestLength = length
      }
    }
    if (longest) labels.push(lineFeature(longest, { label: sub.label, colour: sub.colour }))
  }
  return {
    lines: { type: 'FeatureCollection', features: lines },
    labels: { type: 'FeatureCollection', features: labels },
  }
}

/** Everything the map draws for one selected relation: empty collections for what does not apply to its kind */
export type Drawing = {
  gaps: FeatureCollection<Point>
  arrows: FeatureCollection<LineString>
  groups: FeatureCollection<LineString>
  labels: FeatureCollection<LineString>
}

const NO_POINTS: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }
const NO_LINES: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] }

/** The drawing of the relation, or undefined when its kind draws nothing on the map */
export function drawingOf(
  graph: Graph,
  relation: OsmRelation,
  hovered: string | null,
): Drawing | undefined {
  const kind = drawingKind(relation)
  if (kind === 'route')
    return {
      gaps: gapFeatures(graph, relation),
      arrows: arrowFeatures(graph, relation),
      groups: NO_LINES,
      labels: NO_LINES,
    }
  if (kind === 'group') {
    const group = groupFeatures(graph, relation, hovered)
    return { gaps: NO_POINTS, arrows: NO_LINES, groups: group.lines, labels: group.labels }
  }
  return undefined
}

// --- The sub-route the sidebar points at -----------------------------------------------------------------------
// A row of a superrelation's member list says which sub-route it is, through here (the sidebar sets it on hover and
// focus, the map reads it). Plain module state with listeners, so the map can read it with useSyncExternalStore.

let hoveredSubRoute: string | null = null
const hoverListeners = new Set<() => void>()

/** The sub-route whose row the pointer or the focus is on, or null */
export function subRouteHovered(): string | null {
  return hoveredSubRoute
}

/** Sets the sub-route the sidebar points at (null for none). Listeners are told only when it changes. */
export function setSubRouteHovered(id: string | null) {
  if (id === hoveredSubRoute) return
  hoveredSubRoute = id
  for (const listener of hoverListeners) listener()
}

/** Calls `listener` when the sub-route the sidebar points at changes. Returns the function that stops it. */
export function onSubRouteHovered(listener: () => void): () => void {
  hoverListeners.add(listener)
  return () => {
    hoverListeners.delete(listener)
  }
}
