// A separate cycleway with a footway right next to it: `traffic_mode:<side>=foot` likely belongs on it (the bike part
// of a foot and cycle path that is mapped as two ways). The section asks; TILDA reads only `traffic_mode:right=foot`
// for `footAndCyclewaySegregated` so far. Ported from the iD Radnetz Berlin fork (validations/cycleway_traffic_mode.ts
// and sidepath/find_sidewalk.ts), as plain geometry on lon/lat points.
import { type Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { partKind } from '@tilda-geo/bicycle-infrastructure-tagging'
import type { Tags } from './cards.ts'

export type Loc = readonly [number, number]

/** A footway this close to the cycleway runs right next to it */
export const NEXT_TO_METERS = 5
/** A footway is the cycleway's other half when this share of it runs along it, or it runs along this share of the cycleway */
const NEAR_SHARE = 0.5
const COVER_SHARE = 0.3
/** The part that runs along must stretch this far (or half the cycleway, if shorter): a crossing footway does not */
const MIN_SPREAD_METERS = 5
/** Spacing of the points that are checked along a way */
const SAMPLE_METERS = 2
const METERS_PER_DEGREE = 111_320

const SIDE_KEYS = ['traffic_mode:left', 'traffic_mode:right', 'traffic_mode:both']

/** A crossing is its own TILDA category: `traffic_mode` is never asked for there */
function isCrossing(tags: Tags) {
  return tags.cycleway === 'crossing' || tags.path === 'crossing' || tags.footway === 'crossing'
}

/** `traffic_mode` already says a footway is next to it, or is set on both sides; or it is not needed (a crossing) */
export function trafficModeKnown(tags: Tags) {
  if (isCrossing(tags)) return true
  if (SIDE_KEYS.some((key) => tags[key] === 'foot')) return true
  if (tags['traffic_mode:both'] !== undefined) return true
  return tags['traffic_mode:left'] !== undefined && tags['traffic_mode:right'] !== undefined
}

/** A way the question is about: the cycle part alone, not closed, `traffic_mode` not known yet */
export function asksForFootway(tags: Tags, closed: boolean) {
  return !closed && partKind({ ...tags }) === 'bike' && !trafficModeKnown(tags)
}

/** Metres between two points, flat around the first one (a few metres apart only) */
function scale(lat: number) {
  return Math.cos((lat * Math.PI) / 180)
}

function lengthMeters(line: readonly Loc[]) {
  let length = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    length += Math.hypot((b[0] - a[0]) * scale(a[1]), b[1] - a[1]) * METERS_PER_DEGREE
  }
  return length
}

type Projection = { distance: number; along: number; index: number }

/** The point of `line` nearest to `point`: its distance, how far along the line it is, and its segment */
export function projectOnLine(point: Loc, line: readonly Loc[]): Projection {
  const k = scale(point[1])
  const xy = line.map(
    (loc) =>
      [
        (loc[0] - point[0]) * k * METERS_PER_DEGREE,
        (loc[1] - point[1]) * METERS_PER_DEGREE,
      ] as const,
  )
  const first = xy[0] ?? [0, 0]
  let best: Projection = { distance: Math.hypot(first[0], first[1]), along: 0, index: 0 }
  let walked = 0
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1]!
    const [bx, by] = xy[i]!
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy)
    if (length > 0) {
      const share = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length)))
      const distance = Math.hypot(ax + share * dx, ay + share * dy)
      if (distance < best.distance)
        best = { distance, along: walked + share * length, index: i - 1 }
    }
    walked += length
  }
  return best
}

/** The nodes of the line plus points at most `step` metres apart in between */
function samplePoints(line: readonly Loc[], step: number): Loc[] {
  const first = line[0]
  if (!first) return []
  const points: Loc[] = [first]
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const pieces = Math.max(1, Math.ceil(lengthMeters([a, b]) / step))
    for (let piece = 1; piece <= pieces; piece++) {
      const share = piece / pieces
      points.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share])
    }
  }
  return points
}

/** The footway runs along the cycleway for a stretch, not across it */
export function runsAlong(bike: readonly Loc[], foot: readonly Loc[], nearMeters = NEXT_TO_METERS) {
  if (bike.length < 2 || foot.length < 2) return false
  const bikePoints = samplePoints(bike, SAMPLE_METERS)
  const points = samplePoints(foot, SAMPLE_METERS)
  const near = points.filter((point) => projectOnLine(point, bike).distance <= nearMeters)
  if (near.length === 0) return false
  const covered = bikePoints.filter(
    (point) => projectOnLine(point, foot).distance <= nearMeters,
  ).length
  if (near.length / points.length < NEAR_SHARE && covered / bikePoints.length < COVER_SHARE)
    return false
  const along = near.map((point) => projectOnLine(point, bike).along)
  const minSpread = Math.min(MIN_SPREAD_METERS, lengthMeters(bike) / 2)
  return Math.max(...along) - Math.min(...along) >= minSpread
}

/** On which side of the cycleway (in its drawing direction) the footways lie, by majority of their points nearby */
export function sideOf(
  bike: readonly Loc[],
  feet: readonly (readonly Loc[])[],
): 'left' | 'right' | undefined {
  let vote = 0
  for (const foot of feet) {
    for (const point of foot) {
      const near = projectOnLine(point, bike)
      if (near.distance > NEXT_TO_METERS + 1) continue
      const a = bike[near.index]!
      const b = bike[near.index + 1] ?? a
      const k = scale(point[1])
      const cross = (b[0] - a[0]) * k * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) * k
      vote += Math.sign(cross)
    }
  }
  return vote > 0 ? 'left' : vote < 0 ? 'right' : undefined
}

function locsOf(graph: Graph, way: OsmWay): Loc[] | undefined {
  const locs: Loc[] = []
  for (const id of way.nodes) {
    const node = graph.hasEntity(id)
    const loc = node instanceof OsmNode ? node.loc : undefined
    if (!loc) return undefined
    locs.push([loc[0], loc[1]])
  }
  return locs
}

/** Every way of the graph: the loaded ones that were not edited, and the edited ones */
function* waysOf(graph: Graph) {
  for (const [id, entity] of graph.base.entities)
    if (entity instanceof OsmWay && !graph.local.entities.has(id)) yield entity
  for (const entity of graph.local.entities.values()) if (entity instanceof OsmWay) yield entity
}

function boxOf(line: readonly Loc[], padMeters: number) {
  const lons = line.map((loc) => loc[0])
  const lats = line.map((loc) => loc[1])
  const lat = lats[0] ?? 0
  const padLat = padMeters / METERS_PER_DEGREE
  const padLon = padLat / Math.max(0.01, scale(lat))
  return {
    minLon: Math.min(...lons) - padLon,
    maxLon: Math.max(...lons) + padLon,
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
  }
}

/**
 * The footways right next to a cycleway in the loaded data, and the side they lie on; undefined when the way does not
 * ask (not a cycleway alone, `traffic_mode` known) or none is there. Walks all ways of the graph once: called for the
 * one selected way, when its graph changes.
 */
export function footwayNextTo(graph: Graph, wayId: string) {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay) || !asksForFootway(way.tags, way.isClosed())) return undefined
  const bike = locsOf(graph, way)
  if (!bike || bike.length < 2) return undefined
  const box = boxOf(bike, NEXT_TO_METERS + 1)
  const feet: Loc[][] = []
  const ids: string[] = []
  for (const other of waysOf(graph)) {
    if (other.id === way.id || other.isClosed() || partKind({ ...other.tags }) !== 'foot') continue
    const locs = locsOf(graph, other)
    if (!locs || locs.length < 2) continue
    const own = boxOf(locs, 0)
    const overlaps =
      own.minLon <= box.maxLon &&
      own.maxLon >= box.minLon &&
      own.minLat <= box.maxLat &&
      own.maxLat >= box.minLat
    if (!overlaps || !runsAlong(bike, locs)) continue
    feet.push(locs)
    ids.push(other.id)
  }
  return ids.length > 0 ? { footIds: ids, side: sideOf(bike, feet) } : undefined
}
