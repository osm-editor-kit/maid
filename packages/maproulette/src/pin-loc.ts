/**
 * Where a task pin goes. MapRoulette's `point` is often the centre of the geometry, which is not on a curved way;
 * maproulette3 snaps it onto the line in its UI, and so does this (until the backend stores a point on the line,
 * https://github.com/maproulette/maproulette3/issues/2891).
 */
import { geometryFeatures } from './schema.ts'

export type LngLat = [number, number]

type Bag = Record<string, unknown>

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** The coordinate lists of the LineString and MultiLineString features (bare geometries too) */
export function lineStrings(geometries: unknown): LngLat[][] {
  const lines: LngLat[][] = []
  const addLine = (coords: unknown) => {
    if (!Array.isArray(coords)) return
    const line: LngLat[] = []
    for (const c of coords) {
      if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
        line.push([Number(c[0]), Number(c[1])])
    }
    if (line.length) lines.push(line)
  }
  for (const feature of geometryFeatures(geometries)) {
    if (!isBag(feature)) continue
    const geom = feature.type === 'Feature' ? feature.geometry : feature
    if (!isBag(geom)) continue
    if (geom.type === 'LineString') addLine(geom.coordinates)
    else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates))
      geom.coordinates.forEach(addLine)
  }
  return lines
}

/** The nearest point of a line to `loc`, with the squared distance in degrees scaled by the latitude */
function nearestOnLine(line: LngLat[], loc: LngLat): { point: LngLat; dist2: number } {
  // a local flat plane: east-west degrees shrink with the cosine of the latitude
  const k = Math.cos((loc[1] * Math.PI) / 180)
  let best: { point: LngLat; dist2: number } = {
    point: line[0] as LngLat,
    dist2: Infinity,
  }
  for (let i = 0; i < line.length; i++) {
    const a = line[i] as LngLat
    const b = (line[i + 1] ?? a) as LngLat
    const ax = a[0] * k
    const bx = b[0] * k
    const dx = bx - ax
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((loc[0] * k - ax) * dx + (loc[1] - a[1]) * dy) / len2))
    const point: LngLat = [a[0] + t * (b[0] - a[0]), a[1] + t * dy]
    const ex = (point[0] - loc[0]) * k
    const ey = point[1] - loc[1]
    const dist2 = ex * ex + ey * ey
    if (dist2 < best.dist2) best = { point, dist2 }
  }
  return best
}

/**
 * Snap `loc` onto the nearest line of the geometries. Only lines are targets (points are ignored); with no line,
 * or a bad `loc`, `loc` comes back unchanged.
 */
export function snapPinLoc(loc: LngLat, geometries: unknown): LngLat {
  if (!loc || !Number.isFinite(loc[0]) || !Number.isFinite(loc[1])) return loc
  let best: { point: LngLat; dist2: number } | null = null
  for (const line of lineStrings(geometries)) {
    const near = nearestOnLine(line, loc)
    if (Number.isFinite(near.dist2) && (!best || near.dist2 < best.dist2)) best = near
  }
  return best ? best.point : loc
}
