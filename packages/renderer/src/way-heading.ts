import { clipToViewport, type Point2, type Viewport } from './field-overlay'

/**
 * Below this share of its visible length, the summed direction of a way says little (a loop, a U): the longest visible
 * segment gives the heading instead.
 */
const WEAK_DIRECTION = 0.3

/**
 * The main direction of the visible part of a way on screen, in degrees clockwise from the screen's up (0 is up, 90
 * is right), in the way's drawing direction. `points` are the way's nodes on screen, in order; each segment is clipped
 * to the viewport (field-overlay.ts clipToViewport), so only what the person sees counts. The direction is the sum of
 * the visible segments (their length weighs them); when that sum is short against the visible length (a loop, a U
 * turn) the longest visible segment decides. Undefined when nothing of the way is visible.
 */
export function visibleHeading(points: readonly Point2[], viewport: Viewport, closed: boolean) {
  if (points.length < 2) return undefined
  let sumX = 0
  let sumY = 0
  let total = 0
  let longest: { dx: number; dy: number; length: number } | undefined
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const range = clipToViewport(a, b, viewport)
    if (!range) continue
    const share = range[1] - range[0]
    const dx = (b[0] - a[0]) * share
    const dy = (b[1] - a[1]) * share
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    sumX += dx
    sumY += dy
    total += length
    if (!longest || length > longest.length) longest = { dx, dy, length }
  }
  if (!longest) return undefined
  const strong = Math.hypot(sumX, sumY) >= total * WEAK_DIRECTION
  const [dx, dy] = strong ? [sumX, sumY] : [longest.dx, longest.dy]
  // screen y grows downwards: up is -y
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI
  return (degrees + 360) % 360
}
