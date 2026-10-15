import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'

// Plain planar geometry on [lon, lat] pairs. No map and no projection: the rules only need to
// know whether two segments cross and whether two boxes overlap, and both work in degrees.

export type Point = [number, number]

/** The [lon, lat] of a node in the graph, or `undefined` if it is missing or has no location */
export function nodeLoc(graph: Graph, id: string) {
  const node = graph.hasEntity(id)
  if (!(node instanceof OsmNode) || !node.loc) return undefined
  return [node.loc[0], node.loc[1]] satisfies Point
}

/**
 * The nodes where a way can meet another: its two ends, or every node of a closed way (a roundabout). Ported from
 * the route gap rule (rules/route-gap.ts), which the sidebar and the map use through `routeJoins`.
 */
export function touchPoints(way: OsmWay): string[] {
  if (way.isClosed()) return way.nodes
  return [way.first(), way.last()].filter((node): node is string => node !== undefined)
}

/** The first point of a feature, to show where the issue is */
export function locationOf(entity: OsmEntity, graph: Graph) {
  if (entity instanceof OsmNode)
    return entity.loc ? ([entity.loc[0], entity.loc[1]] satisfies Point) : undefined
  if (!(entity instanceof OsmWay)) return undefined
  const first = entity.first()
  return first ? nodeLoc(graph, first) : undefined
}

export type Box = {
  readonly minLon: number
  readonly minLat: number
  readonly maxLon: number
  readonly maxLat: number
}

/** The box around some points, or `undefined` for none */
export function boxOf(points: readonly Point[]) {
  const first = points[0]
  if (!first) return undefined
  let minLon = first[0]
  let minLat = first[1]
  let maxLon = first[0]
  let maxLat = first[1]
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLon, minLat, maxLon, maxLat }
}

export function boxesOverlap(a: Box, b: Box) {
  return (
    a.minLon <= b.maxLon && b.minLon <= a.maxLon && a.minLat <= b.maxLat && b.minLat <= a.maxLat
  )
}

/**
 * The point where segment p0-p1 crosses segment q0-q1, if they cross properly: each one passes
 * through the interior of the other. Touching at an end point is not a proper crossing, and
 * neither is parallel or collinear.
 */
export function properIntersection(p0: Point, p1: Point, q0: Point, q1: Point) {
  const rx = p1[0] - p0[0]
  const ry = p1[1] - p0[1]
  const sx = q1[0] - q0[0]
  const sy = q1[1] - q0[1]
  const denominator = rx * sy - ry * sx
  if (denominator === 0) return undefined

  const qpx = q0[0] - p0[0]
  const qpy = q0[1] - p0[1]
  const t = (qpx * sy - qpy * sx) / denominator
  const u = (qpx * ry - qpy * rx) / denominator
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return undefined
  return [p0[0] + t * rx, p0[1] + t * ry] satisfies Point
}

// Distances in metres, as iD's geo module: a degree of latitude is the same everywhere, a degree
// of longitude shrinks with the cosine of the latitude.
const TAU = 2 * Math.PI
const EQUATORIAL_RADIUS = 6.378137e6
const POLAR_RADIUS = 6.3567523e6

/** Metres to degrees of latitude */
export function metersToLat(meters: number) {
  return meters / ((TAU * POLAR_RADIUS) / 360)
}

/** Metres to degrees of longitude at this latitude */
export function metersToLon(meters: number, atLat: number) {
  if (Math.abs(atLat) >= 90) return 0
  return meters / ((TAU * EQUATORIAL_RADIUS) / 360) / Math.abs(Math.cos((atLat * Math.PI) / 180))
}

/** The distance in metres between two points, as iD's geoSphericalDistance (equirectangular) */
export function sphericalDistance(a: Point, b: Point) {
  const dLon = a[0] - b[0]
  const meanLat = (a[1] + b[1]) / 2
  const x =
    Math.abs(meanLat) >= 90
      ? 0
      : dLon * ((TAU * EQUATORIAL_RADIUS) / 360) * Math.abs(Math.cos((meanLat * Math.PI) / 180))
  const y = (a[1] - b[1]) * ((TAU * POLAR_RADIUS) / 360)
  return Math.hypot(x, y)
}

/** The point a share t of the way from a to b (t = 1 is b, and beyond it for t > 1) */
export function interpolate(a: Point, b: Point, t: number) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] satisfies Point
}

/**
 * Where segment p0-p1 meets segment q0-q1, end points included: iD's geoLineIntersection. Parallel
 * segments meet nowhere. Unlike `properIntersection`, touching at an end point counts.
 */
export function segmentIntersection(p0: Point, p1: Point, q0: Point, q1: Point) {
  const rx = p1[0] - p0[0]
  const ry = p1[1] - p0[1]
  const sx = q1[0] - q0[0]
  const sy = q1[1] - q0[1]
  const qpx = q0[0] - p0[0]
  const qpy = q0[1] - p0[1]
  const uNumerator = qpx * ry - qpy * rx
  const denominator = rx * sy - ry * sx
  if (uNumerator === 0 || denominator === 0) return undefined

  const u = uNumerator / denominator
  const t = (qpx * sy - qpy * sx) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return undefined
  return interpolate(p0, p1, t)
}

/**
 * Whether a polyline crosses itself next to the point at index `active`: iD's geoHasSelfIntersections.
 * The segments that touch the active point are tested against the others. Segments that share an
 * end point, and crossings at a segment's end point, do not count.
 */
export function selfIntersects(points: readonly Point[], active: number) {
  const same = (a: Point, b: Point, epsilon = 0) =>
    Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon
  const exact = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]

  const actives: Array<[Point, Point]> = []
  const inactives: Array<[Point, Point]> = []
  for (let j = 0; j < points.length - 1; j++) {
    const a = points[j]
    const b = points[j + 1]
    if (!a || !b) continue
    if (j === active || j + 1 === active) actives.push([a, b])
    else inactives.push([a, b])
  }

  for (const [p0, p1] of actives) {
    for (const [q0, q1] of inactives) {
      if (exact(p1, q0) || exact(p0, q1) || exact(p0, q0) || exact(p1, q1)) continue
      const hit = segmentIntersection(p0, p1, q0, q1)
      if (!hit) continue
      const atEnd = [p0, p1, q0, q1].some((end) => same(end, hit, 1e-8))
      if (!atEnd) return true
    }
  }
  return false
}
