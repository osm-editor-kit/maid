import { EARTH_RADIUS_M, haversine } from '@osm-editor-kit/maid-routing'
import type { LonLat } from './types.ts'

/** The router's sphere (packages/routing), so a route's length here is the router's */
export { EARTH_RADIUS_M }
export const RAD = Math.PI / 180

/** Great-circle distance in metres */
export function distance(a: LonLat, b: LonLat): number {
  return haversine(a[0], a[1], b[0], b[1])
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
