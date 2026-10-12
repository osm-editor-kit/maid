// Plain planar geometry on [lon, lat] pairs. No map and no projection: the rules only need to
// know whether two segments cross and whether two boxes overlap, and both work in degrees.

export type Point = [number, number]

export type Box = {
  readonly minLon: number
  readonly minLat: number
  readonly maxLon: number
  readonly maxLat: number
}

/** The box around some points, or `undefined` for none */
export function boxOf(points: readonly Point[]): Box | undefined {
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

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.minLon <= b.maxLon && b.minLon <= a.maxLon && a.minLat <= b.maxLat && b.minLat <= a.maxLat
  )
}

/**
 * The point where segment p0-p1 crosses segment q0-q1, if they cross properly: each one passes
 * through the interior of the other. Touching at an end point is not a proper crossing, and
 * neither is parallel or collinear.
 */
export function properIntersection(p0: Point, p1: Point, q0: Point, q1: Point): Point | undefined {
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
  return [p0[0] + t * rx, p0[1] + t * ry]
}
