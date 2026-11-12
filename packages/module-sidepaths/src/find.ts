/**
 * The separate ways along one side of a road: the sidewalk of `sidewalk:left=separate`, the cycle track of
 * `cycleway:right=separate`. Found by position, as the iD fork iD-Radnetz finds the footway next to an extracted
 * cycle track (`modules/sidepath/find_sidewalk.ts`), but measured from the road and only on the asked side.
 */
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { type Loc, lineLengthMetres, projectOnLine, samplePoints } from './geometry.ts'
import type { Side, SidePrefix, Tags } from './side-tags.ts'

/** Points of a separate way at most this far from the road run along it: wide roads with parking and a cycle track fit in */
const NEAR_METRES = 25
/** …and at least this far: a line on the road is not its separate side */
const MIN_APART_METRES = 1
/** A way runs along the road when this share of its points does, or when it runs along this share of the road */
const NEAR_SHARE = 0.5
const COVER_SHARE = 0.3
/** The part that runs along must stretch this far (or half the road, if that is shorter): a crossing does not */
const MIN_SPREAD_METRES = 5
/** Spacing of the points that are checked */
const SAMPLE_METRES = 2

/**
 * Whether a way can be the separate part of this kind. A sidewalk: `footway=sidewalk`, or a footway or path marked
 * `is_sidepath=yes`. A cycle track: a cycleway that is not a crossing, or a path for bicycles marked as a side path.
 * Crossings, pedestrian areas and footways of their own (a named lane) run near a road too, so they do not count
 * (seen on the medium fixture, 2026-11-10).
 */
export function isSeparatePart(tags: Tags, prefix: SidePrefix): boolean {
  const { highway } = tags
  const sidepath = tags.is_sidepath === 'yes'
  if (prefix === 'sidewalk') {
    if (highway === 'footway')
      return tags.footway === 'sidewalk' || (sidepath && tags.footway !== 'crossing')
    return highway === 'path' && tags.foot !== 'no' && (sidepath || tags.path === 'sidewalk')
  }
  if (highway === 'cycleway') return tags.cycleway !== 'crossing' && tags.name === undefined
  return highway === 'path' && tags.bicycle !== 'no' && sidepath
}

function locsOf(graph: Graph, way: OsmWay): Loc[] | undefined {
  const locs: Loc[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    locs.push([node.loc[0], node.loc[1]])
  }
  return locs
}

/** Every way of the graph: the loaded ones as the edits left them, and the new ones */
function* waysOf(graph: Graph): Generator<OsmWay> {
  const seen = new Set<string>()
  for (const [id, entity] of graph.local.entities) {
    seen.add(id)
    if (entity instanceof OsmWay) yield entity
  }
  for (const [id, entity] of graph.base.entities) {
    if (!seen.has(id) && entity instanceof OsmWay) yield entity
  }
}

type Box = { minLon: number; minLat: number; maxLon: number; maxLat: number }

function boxOf(locs: readonly Loc[], padMetres: number): Box {
  const lats = locs.map((loc) => loc[1])
  const lons = locs.map((loc) => loc[0])
  const padLat = padMetres / 111_320
  const padLon = padLat / Math.max(0.1, Math.cos(((lats[0] ?? 0) * Math.PI) / 180))
  return {
    minLon: Math.min(...lons) - padLon,
    maxLon: Math.max(...lons) + padLon,
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
  }
}

function inBox(loc: Loc, box: Box) {
  return (
    loc[0] >= box.minLon && loc[0] <= box.maxLon && loc[1] >= box.minLat && loc[1] <= box.maxLat
  )
}

/** A found separate way and whether it runs against the road */
export type SeparateWay = { id: string; reversed: boolean }

/** A found separate way with where it runs along the road, to tell pieces of one sidewalk from two sidewalks */
export type SeparateWayDetails = SeparateWay & {
  /** Metres along the road where the part that runs along it starts and ends */
  from: number
  to: number
  /** Its median distance from the road, in metres */
  distance: number
  /** Its first and last node, to join the pieces of one sidewalk */
  ends: [string, string]
  locs: Loc[]
}

/**
 * The ways of this kind on `side` of the road that run along it: at least half of a way's points lie on that side
 * within a few metres of the road, or the way runs along a third of the road (a long sidewalk beside a short road
 * piece). Ways that only touch or cross the road do not stretch along it. In id order.
 */
export function separateWays(
  graph: Graph,
  roadId: string,
  prefix: SidePrefix,
  side: Side,
): SeparateWay[] {
  return separateWayDetails(graph, roadId, prefix, side).map(({ id, reversed }) => ({
    id,
    reversed,
  }))
}

/** `separateWays` with where each way runs along the road (`SeparateWayDetails`) */
export function separateWayDetails(
  graph: Graph,
  roadId: string,
  prefix: SidePrefix,
  side: Side,
): SeparateWayDetails[] {
  const road = graph.hasEntity(roadId)
  if (!(road instanceof OsmWay)) return []
  const roadLocs = locsOf(graph, road)
  if (!roadLocs || roadLocs.length < 2) return []
  const roadLength = lineLengthMetres(roadLocs)
  const roadPoints = samplePoints(roadLocs, SAMPLE_METRES)
  const minSpread = Math.min(MIN_SPREAD_METRES, roadLength / 2)
  const box = boxOf(roadLocs, NEAR_METRES)

  const onSide = (point: Loc) => {
    const projection = projectOnLine(point, roadLocs)
    return (
      projection.side === side &&
      projection.distance >= MIN_APART_METRES &&
      projection.distance <= NEAR_METRES
    )
  }

  const result: SeparateWayDetails[] = []
  for (const way of waysOf(graph)) {
    if (way.id === roadId || way.isClosed() || !isSeparatePart(way.tags, prefix)) continue
    const locs = locsOf(graph, way)
    if (!locs || locs.length < 2 || !locs.some((loc) => inBox(loc, box))) continue

    const points = samplePoints(locs, SAMPLE_METRES)
    const near = points.filter(onSide)
    if (!near.length) continue
    // how much of the road the way runs along: the road's points near the way, measured from the way
    const covered = roadPoints.filter((point) => {
      const distance = projectOnLine(point, locs).distance
      return distance >= MIN_APART_METRES && distance <= NEAR_METRES
    }).length
    if (near.length / points.length < NEAR_SHARE && covered / roadPoints.length < COVER_SHARE)
      continue

    const along = near.map((point) => projectOnLine(point, roadLocs).along)
    if (Math.max(...along) - Math.min(...along) < minSpread) continue

    // the direction: where the way's ends lie along the road
    const start = projectOnLine(locs[0]!, roadLocs).along
    const end = projectOnLine(locs[locs.length - 1]!, roadLocs).along
    const distances = near
      .map((point) => projectOnLine(point, roadLocs).distance)
      .sort((a, b) => a - b)
    result.push({
      id: way.id,
      reversed: end < start,
      from: Math.min(...along),
      to: Math.max(...along),
      distance: distances[Math.floor(distances.length / 2)]!,
      ends: [way.nodes[0]!, way.nodes[way.nodes.length - 1]!],
      locs,
    })
  }
  return result.sort((a, b) => a.id.localeCompare(b.id))
}

/** Points of a footway this close to the extracted cycle track run along it */
const FOOT_NEAR_METRES = 7

/**
 * The footways that run along a cycle track (iD-Radnetz's `sidewalkCandidates`): footways (or paths for pedestrians,
 * TILDA's `partKind`) of which at least half runs within a few metres of it, or that run along a third of it. A
 * footway that crosses the cycle track does not stretch along it. In id order.
 */
export function footwaysAlong(
  graph: Graph,
  bikeWayId: string,
  isFoot: (tags: Tags) => boolean,
): string[] {
  const bike = graph.hasEntity(bikeWayId)
  if (!(bike instanceof OsmWay)) return []
  const bikeLocs = locsOf(graph, bike)
  if (!bikeLocs || bikeLocs.length < 2) return []
  const bikePoints = samplePoints(bikeLocs, SAMPLE_METRES)
  const minSpread = Math.min(MIN_SPREAD_METRES, lineLengthMetres(bikeLocs) / 2)
  const box = boxOf(bikeLocs, FOOT_NEAR_METRES)

  const result: string[] = []
  for (const way of waysOf(graph)) {
    if (way.id === bikeWayId || way.isClosed() || !isFoot(way.tags)) continue
    const locs = locsOf(graph, way)
    if (!locs || locs.length < 2 || !locs.some((loc) => inBox(loc, box))) continue
    const points = samplePoints(locs, SAMPLE_METRES)
    const near = points.filter(
      (point) => projectOnLine(point, bikeLocs).distance <= FOOT_NEAR_METRES,
    )
    if (!near.length) continue
    const covered = bikePoints.filter(
      (point) => projectOnLine(point, locs).distance <= FOOT_NEAR_METRES,
    ).length
    if (near.length / points.length < NEAR_SHARE && covered / bikePoints.length < COVER_SHARE)
      continue
    const along = near.map((point) => projectOnLine(point, bikeLocs).along)
    if (Math.max(...along) - Math.min(...along) >= minSpread) result.push(way.id)
  }
  return result.sort()
}
