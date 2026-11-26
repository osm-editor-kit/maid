/**
 * Plane geometry in metres for the street drawing: a local frame around a point (equirectangular, good to a few
 * centimetres over the few kilometres an editor loads), vectors, polylines, and the offset of a polyline with mitre
 * joins. The offset follows Lane Studio's `offsetPolyline` (https://github.com/MarcelMarzec/LaneStudio,
 * `modules/lanes/geometry/frame.ts`, ISC licence): each vertex moves along the mean normal of its two segments, scaled
 * by 1/cos of half the bend, and an end that a road carries on from is cut on the bisector of the bend between the two,
 * so the boundaries of both roads meet exactly.
 */

export type Vec2 = [number, number]

const EARTH_RADIUS = 6_378_137
const RAD = Math.PI / 180

export type MetricFrame = {
  toMetres(loc: readonly [number, number]): Vec2
  toLoc(p: Vec2): [number, number]
}

/** A frame with its origin at `origin` ([lon, lat]): x east, y north, in metres */
export function metricFrame(origin: readonly [number, number]): MetricFrame {
  const [lon0, lat0] = origin
  const kx = Math.cos(lat0 * RAD) * EARTH_RADIUS * RAD
  const ky = EARTH_RADIUS * RAD
  return {
    toMetres: (loc) => [(loc[0] - lon0) * kx, (loc[1] - lat0) * ky],
    toLoc: (p) => [lon0 + p[0] / kx, lat0 + p[1] / ky],
  }
}

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0]
export const len = (a: Vec2): number => Math.hypot(a[0], a[1])
export function unit(a: Vec2): Vec2 {
  const l = len(a)
  return l > 0 ? [a[0] / l, a[1] / l] : [0, 0]
}
/** The normal to the right of a direction (x east, y north) */
export const rightNormal = (d: Vec2): Vec2 => [d[1], -d[0]]

/** The angle between two unit directions, in degrees */
export function angleBetween(a: Vec2, b: Vec2): number {
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI
}

/** Distance along the polyline at each vertex */
export function cumulative(points: readonly Vec2[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++)
    out.push(out[i - 1]! + len(sub(points[i]!, points[i - 1]!)))
  return out
}

export function polylineLength(points: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += len(sub(points[i]!, points[i - 1]!))
  return total
}

/** The point `s` metres along the polyline and the direction of its segment there */
export function pointAlong(points: readonly Vec2[], s: number): { point: Vec2; direction: Vec2 } {
  let rest = Math.max(0, s)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const l = len(sub(b, a))
    if (l === 0) continue
    if (rest <= l || i === points.length - 1) {
      const t = Math.min(1, rest / l)
      return { point: add(a, scale(sub(b, a), t)), direction: unit(sub(b, a)) }
    }
    rest -= l
  }
  const last = points[points.length - 1] ?? [0, 0]
  return { point: last, direction: [1, 0] }
}

/** The part of the polyline from `from` to `to` metres along it, with vertices added at `breaks` (metres) */
export function slicePolyline(
  points: readonly Vec2[],
  from: number,
  to: number,
  breaks: readonly number[] = [],
): Vec2[] {
  const at = cumulative(points)
  const stations = new Set<number>([from, to])
  for (const s of at) if (s > from && s < to) stations.add(s)
  for (const s of breaks) if (s > from + 0.05 && s < to - 0.05) stations.add(s)
  const sorted = [...stations].sort((a, b) => a - b)
  const out: Vec2[] = []
  let segment = 1
  for (const s of sorted) {
    while (segment < points.length - 1 && at[segment]! < s) segment++
    const a = points[segment - 1]!
    const b = points[segment]!
    const l = at[segment]! - at[segment - 1]!
    const t = l > 0 ? Math.max(0, Math.min(1, (s - at[segment - 1]!) / l)) : 0
    const p = add(a, scale(sub(b, a), t))
    const previous = out[out.length - 1]
    if (!previous || len(sub(p, previous)) > 1e-6) out.push(p)
  }
  return out
}

/**
 * The polyline moved sideways by `distances[i]` at vertex i (right positive). `into` and `outOf`: the directions the
 * line carries on in beyond its start and end (another road running on), so its ends are cut on the bisector of the
 * bend and meet that road's offsets. A bend sharper than about 120° gets twice the distance, not more (Lane Studio's
 * limit), so a hairpin does not throw a vertex far away.
 */
export function offsetPolyline(
  points: readonly Vec2[],
  distances: readonly number[],
  ends: { into?: Vec2; outOf?: Vec2 } = {},
): Vec2[] {
  const n = points.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const before = i > 0 ? unit(sub(points[i]!, points[i - 1]!)) : (ends.into ?? null)
    const after = i < n - 1 ? unit(sub(points[i + 1]!, points[i]!)) : (ends.outOf ?? null)
    const n1 = rightNormal(before ?? after ?? [1, 0])
    const n2 = rightNormal(after ?? before ?? [1, 0])
    const mitre = unit(add(n1, n2))
    const cos = dot(mitre, n1)
    const d = distances[i] ?? 0
    const k = cos > 0.5 ? d / cos : 2 * d
    out.push(add(points[i]!, scale(len(mitre) > 0 ? mitre : n1, k)))
  }
  return out
}

/**
 * A curve from `from` to `to` bending round where the two kerbs running back along `fromDirection` and `toDirection`
 * would meet, as a kerb rounds a corner (Lane Studio's `cornerCurve`); a straight line where they do not meet on the
 * junction's side or only far away.
 */
export function cornerCurve(from: Vec2, fromDirection: Vec2, to: Vec2, toDirection: Vec2): Vec2[] {
  const c = cross(fromDirection, toDirection)
  if (Math.abs(c) > 0.05) {
    const d = sub(to, from)
    const t = -cross(d, toDirection) / c
    const u = -cross(d, fromDirection) / c
    const meet = sub(from, scale(fromDirection, t))
    const beyondNode = dot(meet, add(from, to)) < 0
    if (t >= 0 && u >= 0 && t < 20 && u < 20 && !beyondNode) {
      return Array.from({ length: 9 }, (_, i) => {
        const a = i / 8
        const b = 1 - a
        return [
          b * b * from[0] + 2 * a * b * meet[0] + a * a * to[0],
          b * b * from[1] + 2 * a * b * meet[1] + a * a * to[1],
        ] as Vec2
      })
    }
  }
  return [from, to]
}

/** Smooth step from 0 to 1 */
export function smooth(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/** Twice the signed area: positive counter-clockwise */
export function signedArea2(ring: readonly Vec2[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    area += p[0] * q[1] - q[0] * p[1]
  }
  return area
}

/**
 * The polyline with the corner of every bend sharper than `minTurn` degrees cut: the vertex is replaced by two points
 * `cut` metres back along each segment (less on short segments), which halves the bend. A road's offsets round a
 * hairpin then stay near it instead of reaching out along a long mitre.
 */
export function cutSharpBends(points: readonly Vec2[], cut: number, minTurn = 100): Vec2[] {
  if (points.length < 3 || cut <= 0) return [...points]
  const out: Vec2[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const before = sub(p, points[i - 1]!)
    const after = sub(points[i + 1]!, p)
    const u1 = unit(before)
    const u2 = unit(after)
    if (angleBetween(u1, u2) <= minTurn) {
      out.push(p)
      continue
    }
    const c = Math.min(cut, len(before) * 0.4, len(after) * 0.4)
    out.push(sub(p, scale(u1, c)), add(p, scale(u2, c)))
  }
  out.push(points[points.length - 1]!)
  return out
}
