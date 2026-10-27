import type { LonLat } from './types.ts'

/** Mean earth radius of the haversine formula, in metres (the same sphere as packages/routing) */
const EARTH_RADIUS_M = 6371008.8
const RAD = Math.PI / 180

/** Great-circle distance in metres */
export function distance(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLon = (b[0] - a[0]) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The nearest point to `p` on the segment a-b, in a local flat projection around `p` (good to well under a metre for
 * segments of a few kilometres). `t` is 0 at a and 1 at b; `offset` is the distance in metres from `p`.
 */
export function nearestOnSegment(p: LonLat, a: LonLat, b: LonLat): { t: number; offset: number } {
  const kx = Math.cos(p[1] * RAD) * EARTH_RADIUS_M * RAD
  const ky = EARTH_RADIUS_M * RAD
  const ax = (a[0] - p[0]) * kx
  const ay = (a[1] - p[1]) * ky
  const bx = (b[0] - p[0]) * kx
  const by = (b[1] - p[1]) * ky
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
  const x = ax + t * dx
  const y = ay + t * dy
  return { t, offset: Math.sqrt(x * x + y * y) }
}

/** Length in metres of a run of positions */
export function lineLength(points: readonly LonLat[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!)
  return total
}
