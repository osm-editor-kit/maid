/**
 * The resize box as geometry: its orientation, its extent in its own axes, the handles at its corners and edge midpoints,
 * and what a drag of a handle makes of it. Pure: no map, no editor. Everything is in the module's local frame in metres
 * (shared/metres.ts), turned to the box's axes, so a proportional resize keeps the proportions on the ground. Plan:
 * docs/research/drawing-tools/7-resize.md.
 */
import { dot, sub, type Pt } from '../shared/vector.ts'

/** The box's axes: u along `angle` (radians from east, counter-clockwise), v at a right angle to it */
export type Axes = { angle: number; cos: number; sin: number }

/** An extent in the box's axes, in metres */
export type Extent = { minU: number; minV: number; maxU: number; maxV: number }

/**
 * The eight handles, named by the side of the box they are on, in the box's own axes: `e` is the end of +u, `n` of +v.
 * They are not compass directions; on a turned building `n` can point anywhere.
 */
export const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Handle = (typeof HANDLES)[number]

/** The direction of a handle from the centre: -1, 0 or 1 along u and along v */
const DIRECTIONS: Record<Handle, readonly [du: -1 | 0 | 1, dv: -1 | 0 | 1]> = {
  n: [0, 1],
  ne: [1, 1],
  e: [1, 0],
  se: [1, -1],
  s: [0, -1],
  sw: [-1, -1],
  w: [-1, 0],
  nw: [-1, 1],
}

/** The keys held while a handle is dragged: proportions kept (Shift), about the centre (Alt) */
export type ResizeOptions = { proportional: boolean; centre: boolean }

/** The shortest side the box can be dragged to, in metres */
export const MIN_SIDE = 0.5

export function axesOf(angle: number): Axes {
  return { angle, cos: Math.cos(angle), sin: Math.sin(angle) }
}

/** Directions closer than this, in radians, are one: the walls of a building at right angles fold together */
const SAME_DIRECTION = 1e-6
/** The most directions tried as the box's angle: the longest ones. Every direction still counts in each score. */
const MAX_CANDIDATES = 64

/**
 * The dominant direction of the segments, folded into a quarter turn: the direction that most of the length runs along
 * or across. The score is Rapid's geomGetDominantSurroundingRectangle, which Flip long/short uses: each direction is
 * scored by the length of all edges weighted with |cos 2Δ|. Rapid joins all points into one ring, which for a group of
 * buildings makes edges from one building to the next; here the segments of each way are given on their own.
 *
 * Edges of one direction are summed first, so a building costs a handful of directions, and only the longest
 * MAX_CANDIDATES directions are tried: a relation of ten thousand segments costs a few hundred thousand steps, not 1e8.
 * The commands ask for the box after every change, a drag frame included.
 * @param   segments - Segments in metres
 * @return  The angle in [0, π/2); 0 (east) when there are no segments of any length
 */
export function dominantAngle(segments: readonly (readonly [Pt, Pt])[]): number {
  const directions = new Map<number, { angle: number; length: number }>()
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const angle = foldAngle(Math.atan2(b.y - a.y, b.x - a.x))
    const key = Math.round(angle / SAME_DIRECTION)
    const direction = directions.get(key)
    if (direction) direction.length += length
    else directions.set(key, { angle, length })
  }
  const all = [...directions.values()]
  const candidates =
    all.length <= MAX_CANDIDATES
      ? all
      : [...all].sort((a, b) => b.length - a.length).slice(0, MAX_CANDIDATES)
  let best = 0
  let bestScore = -Infinity
  for (const candidate of candidates) {
    let score = 0
    for (const other of all)
      score += other.length * Math.abs(Math.cos(2 * (other.angle - candidate.angle)))
    if (score > bestScore + 1e-9) {
      bestScore = score
      best = candidate.angle
    }
  }
  return best
}

/** An angle folded into [0, π/2): a box looks the same turned by a quarter */
function foldAngle(angle: number): number {
  const quarter = Math.PI / 2
  const folded = angle % quarter
  return folded < 0 ? folded + quarter : folded
}

/** A point in metres as coordinates along the box's axes */
export function toAxes(axes: Axes, p: Pt): Pt {
  return { x: p.x * axes.cos + p.y * axes.sin, y: -p.x * axes.sin + p.y * axes.cos }
}

/** Coordinates along the box's axes as a point in metres */
export function fromAxes(axes: Axes, q: Pt): Pt {
  return { x: q.x * axes.cos - q.y * axes.sin, y: q.x * axes.sin + q.y * axes.cos }
}

/**
 * The extent of points in the box's axes.
 * @param   points - Points along the axes, at least one
 * @return  The extent
 */
export function extentOf(points: readonly Pt[]): Extent {
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const p of points) {
    minU = Math.min(minU, p.x)
    maxU = Math.max(maxU, p.x)
    minV = Math.min(minV, p.y)
    maxV = Math.max(maxV, p.y)
  }
  return { minU, minV, maxU, maxV }
}

export function widthOf(extent: Extent): number {
  return extent.maxU - extent.minU
}

export function heightOf(extent: Extent): number {
  return extent.maxV - extent.minV
}

/** Where a handle is, along the box's axes */
export function handleAt(extent: Extent, handle: Handle): Pt {
  const [du, dv] = DIRECTIONS[handle]
  return { x: sideAt(extent.minU, extent.maxU, du), y: sideAt(extent.minV, extent.maxV, dv) }
}

/** The low side, the middle or the high side of an interval */
function sideAt(min: number, max: number, direction: -1 | 0 | 1): number {
  if (direction < 0) return min
  if (direction > 0) return max
  return (min + max) / 2
}

/** The four corners, counter-clockwise from the low corner, along the box's axes */
export function cornersOf(extent: Extent): Pt[] {
  return [
    { x: extent.minU, y: extent.minV },
    { x: extent.maxU, y: extent.minV },
    { x: extent.maxU, y: extent.maxV },
    { x: extent.minU, y: extent.maxV },
  ]
}

/**
 * What a drag of a handle to a place makes of the box. A corner changes both sides, an edge midpoint one. Without keys
 * the opposite side or corner stays; `centre` keeps the centre instead, so the opposite side moves the other way.
 * `proportional` scales both sides by one factor: a corner by the pointer's projection onto the diagonal it moves on, an
 * edge midpoint by its own side, the other side about its middle. No side gets shorter than MIN_SIDE, and a handle
 * dragged past the opposite side stops there: the box never flips (Flip does that).
 * @param   start   - The box when the drag started
 * @param   handle  - The handle dragged
 * @param   pointer - The pointer, along the box's axes
 * @param   options - The keys held
 * @return  The box now
 */
export function resizeExtent(
  start: Extent,
  handle: Handle,
  pointer: Pt,
  options: ResizeOptions,
): Extent {
  const [du, dv] = DIRECTIONS[handle]
  const width = widthOf(start)
  const height = heightOf(start)
  const centre = { x: (start.minU + start.maxU) / 2, y: (start.minV + start.maxV) / 2 }
  // the point that stays: the centre, or the opposite side or corner (the middle along an axis the handle does not move)
  const anchor = {
    x: options.centre || du === 0 ? centre.x : du > 0 ? start.minU : start.maxU,
    y: options.centre || dv === 0 ? centre.y : dv > 0 ? start.minV : start.maxV,
  }
  const grip = handleAt(start, handle)
  const lowest = Math.max(width > 0 ? MIN_SIDE / width : 0, height > 0 ? MIN_SIDE / height : 0)

  let fu = 1
  let fv = 1
  if (options.proportional) {
    const along = sub(grip, anchor)
    const length = dot(along, along)
    const factor = length > 0 ? dot(sub(pointer, anchor), along) / length : 1
    fu = fv = Math.max(factor, lowest)
  } else {
    if (du !== 0) fu = factorAlong(pointer.x - anchor.x, grip.x - anchor.x, width)
    if (dv !== 0) fv = factorAlong(pointer.y - anchor.y, grip.y - anchor.y, height)
  }
  return {
    minU: anchor.x + (start.minU - anchor.x) * fu,
    maxU: anchor.x + (start.maxU - anchor.x) * fu,
    minV: anchor.y + (start.minV - anchor.y) * fv,
    maxV: anchor.y + (start.maxV - anchor.y) * fv,
  }
}

/**
 * The factor of one side: how far the pointer is from the anchor, over how far the handle was, kept so the side stays
 * at least MIN_SIDE long.
 * @param   pointer - The pointer's offset from the anchor along the axis
 * @param   grip    - The handle's offset from the anchor along the axis when the drag started (not zero)
 * @param   side    - The side's length when the drag started
 * @return  The factor
 */
function factorAlong(pointer: number, grip: number, side: number): number {
  const factor = pointer / grip
  return side > 0 ? Math.max(factor, MIN_SIDE / side) : 1
}

/**
 * Where a point goes when the box changes from one extent to another: each axis is stretched on its own, so a point on
 * a side stays on that side.
 * @param   from - The box the point was placed in
 * @param   to   - The box now
 * @param   q    - The point, along the box's axes
 * @return  The point, along the box's axes
 */
export function mapPoint(from: Extent, to: Extent, q: Pt): Pt {
  return {
    x: mapAxis(from.minU, from.maxU, to.minU, to.maxU, q.x),
    y: mapAxis(from.minV, from.maxV, to.minV, to.maxV, q.y),
  }
}

function mapAxis(fromMin: number, fromMax: number, toMin: number, toMax: number, value: number) {
  const side = fromMax - fromMin
  // a box without width on this axis has nothing to stretch: the point moves with the middle
  if (side <= 0) return value + (toMin + toMax) / 2 - (fromMin + fromMax) / 2
  return toMin + ((value - fromMin) / side) * (toMax - toMin)
}
