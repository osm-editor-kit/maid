/**
 * Angle snap for the drawing and dragging tools. With Shift held, the placed node goes to a multiple of
 * 45 degrees from the previous segment. At a corner, it locks to the point where the two snapped rays meet.
 * Pure geometry on screen pixels (y down), so it can run on every pointer move without querying the map.
 *
 * The types are the renderer's own (the `draw.constraint` hook, docs/adr/0011-drawing-tool-hooks.md).
 */
import type {
  ConstraintInput,
  ConstraintLabel,
  ConstraintResult,
  Modifiers,
} from '@osm-editor-kit/maid-renderer'
import { formatMetres } from '../messages.ts'
import { cross, distance, sub } from '../shared/vector.ts'

/** A point on the screen, in pixels (the hook's own type; the renderer does not export it by name) */
type Point = ConstraintInput['point']

export const ANGLE_STEP = 45
/** A corner locks only when the pointer is this close to where the two rays meet */
export const CORNER_RADIUS_PX = 30
/** Closer than this to a neighbour, the direction is noise, so no snap */
export const MIN_SEGMENT_PX = 4
/** Each way from the neighbour, long enough to cross any screen */
export const GUIDE_LENGTH_PX = 2000
/** With Shift, a segment's length is a whole number of this many metres on the ground */
export const LENGTH_STEP_M = 0.1
/** A length label sits this far back from the pointer, along its segment */
export const LABEL_OFFSET_PX = 18

const STEP = (ANGLE_STEP * Math.PI) / 180
const TWO_PI = 2 * Math.PI
/** Two rays this close to parallel do not meet at a usable corner */
const PARALLEL_EPSILON = 1e-9

/** A line from `anchor` in a direction, as an angle in radians on screen */
type Ray = { anchor: Point; angle: number }

/** The options of the module: `lengths` shows each segment's length in metres while a node is placed */
export type AngleSnapOptions = { lengths?: boolean }

/**
 * The constraint of the module. With Shift: the 45 degree step, a corner lock, and (Shift) the length rounded to
 * LENGTH_STEP_M on the ground. Without Shift, with `lengths`: the place stays where the pointer is and only the labels
 * are given. Alt and Ctrl or Meta with Shift keep their own meaning (Alt is a free drag; Ctrl is the right-click on a
 * Mac), so they get no angle snap and no rounding.
 */
export function angleConstraint(options: AngleSnapOptions = {}) {
  return (input: ConstraintInput): ConstraintResult | undefined => {
    if (!isAngleSnapKey(input.modifiers)) return options.lengths ? lengthsOnly(input) : undefined
    return snapped(input, options.lengths === true)
  }
}

/** Shift alone, no labels: the constraint of the module without the `lengths` option */
export const constrainAngle = angleConstraint()

function isAngleSnapKey(modifiers: Modifiers): boolean {
  return modifiers.shift && !modifiers.alt && !modifiers.ctrl && !modifiers.meta
}

/** No key for an angle: the place is the pointer, with the labels of the segments */
function lengthsOnly(input: ConstraintInput): ConstraintResult | undefined {
  const { point, neighbours, metresPerPixel } = input
  if (neighbours.length === 0) return undefined
  if (neighbours.some((neighbour) => distance(point, neighbour.at) < MIN_SEGMENT_PX))
    return undefined
  return { point, guides: [], labels: lengthLabels(point, neighbours, metresPerPixel) }
}

/** Shift: the segment turns in 45 degree steps, and its length is rounded (a corner keeps its exact place) */
function snapped(input: ConstraintInput, lengths: boolean): ConstraintResult | undefined {
  const { point, neighbours, bearing, metresPerPixel } = input
  if (neighbours.some((neighbour) => distance(point, neighbour.at) < MIN_SEGMENT_PX))
    return undefined

  // A line end has one neighbour and a corner has two. More than two is not a case this tool covers.
  const [first, second, ...rest] = neighbours
  if (!first || rest.length > 0) return undefined
  const withLabels = (result: ConstraintResult): ConstraintResult =>
    lengths ? { ...result, labels: lengthLabels(result.point, neighbours, metresPerPixel) } : result
  if (!second) return withLabels(alongRay(snapRay(first, point, bearing), point, metresPerPixel))

  const firstRay = snapRay(first, point, bearing)
  const secondRay = snapRay(second, point, bearing)
  const corner = meetAhead(firstRay, secondRay)
  // The corner is a point the pointer may be near. Pointers further away keep one ray only.
  if (corner && distance(corner, point) <= CORNER_RADIUS_PX) {
    return withLabels({ point: corner, guides: [guideOf(firstRay), guideOf(secondRay)] })
  }
  // Keep the ray of the neighbour nearer the pointer, so the node moves the least.
  const nearer = distance(point, first.at) <= distance(point, second.at) ? firstRay : secondRay
  return withLabels(alongRay(nearer, point, metresPerPixel))
}

/**
 * The length of each segment, in metres, one label per neighbour. Each sits on its own segment, just back from the
 * placed point, so a corner's two labels stay apart.
 */
function lengthLabels(
  point: Point,
  neighbours: { at: Point }[],
  metresPerPixel: number,
): ConstraintLabel[] {
  return neighbours.map((neighbour) => {
    const pixels = distance(point, neighbour.at)
    const back = pixels > 0 ? Math.min(LABEL_OFFSET_PX, pixels / 2) / pixels : 0
    return {
      at: {
        x: point.x + (neighbour.at.x - point.x) * back,
        y: point.y + (neighbour.at.y - point.y) * back,
      },
      text: formatMetres(pixels * metresPerPixel),
    }
  })
}

/**
 * The length of a segment in pixels, rounded so that it is a whole number of LENGTH_STEP_M on the ground. Without a
 * usable scale the length is kept.
 */
export function roundedLengthPx(pixels: number, metresPerPixel: number): number {
  if (!(metresPerPixel > 0)) return pixels
  const metres = Math.round((pixels * metresPerPixel) / LENGTH_STEP_M) * LENGTH_STEP_M
  return metres / metresPerPixel
}

/**
 * The direction the segment continues in. Without `before`, the reference is map east on screen.
 * Map east is (cos(-bearing), sin(-bearing)): y runs down, and a positive bearing turns the map so
 * that east moves up on screen (bearing 90 shows east at the top).
 */
function referenceAngle(neighbour: { at: Point; before?: Point }, bearing: number): number {
  const { at, before } = neighbour
  if (before && (at.x !== before.x || at.y !== before.y)) {
    return Math.atan2(at.y - before.y, at.x - before.x)
  }
  return (-bearing * Math.PI) / 180
}

/**
 * The ray from the neighbour to the pointer, turned to the nearest multiple of 45 degrees from the reference.
 * Rounding the relative angle keeps the snap symmetric and gives 22.5 degrees as the boundary.
 */
function snapRay(neighbour: { at: Point; before?: Point }, point: Point, bearing: number): Ray {
  const reference = referenceAngle(neighbour, bearing)
  const pointer = Math.atan2(point.y - neighbour.at.y, point.x - neighbour.at.x)
  const steps = Math.round(wrap(pointer - reference) / STEP)
  return { anchor: neighbour.at, angle: reference + steps * STEP }
}

/** The ray's point at the pointer's distance from its anchor, rounded to LENGTH_STEP_M on the ground */
function alongRay(ray: Ray, point: Point, metresPerPixel: number): ConstraintResult {
  const snapped = pointAt(ray, roundedLengthPx(distance(point, ray.anchor), metresPerPixel))
  return { point: snapped, guides: [guideOf(ray)] }
}

/**
 * Where two rays meet, if both meeting points lie ahead of their anchors. A meeting point behind an
 * anchor would make the segment double back, so it is rejected.
 */
function meetAhead(first: Ray, second: Ray): Point | undefined {
  const u = unit(first.angle)
  const v = unit(second.angle)
  const denominator = cross(u, v)
  if (Math.abs(denominator) < PARALLEL_EPSILON) return undefined
  const between = sub(second.anchor, first.anchor)
  const t = cross(between, v) / denominator
  const s = cross(between, u) / denominator
  if (t <= 0 || s <= 0) return undefined
  return pointAt(first, t)
}

/** A line through the anchor, GUIDE_LENGTH_PX each way, for the renderer to draw */
function guideOf(ray: Ray): [Point, Point] {
  return [pointAt(ray, -GUIDE_LENGTH_PX), pointAt(ray, GUIDE_LENGTH_PX)]
}

function pointAt(ray: Ray, t: number): Point {
  const u = unit(ray.angle)
  return { x: ray.anchor.x + t * u.x, y: ray.anchor.y + t * u.y }
}

function unit(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

/** Into [-PI, PI), so the snap works across the 180 degree seam */
function wrap(angle: number): number {
  return ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI
}
