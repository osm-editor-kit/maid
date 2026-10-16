/**
 * Angle snap for the drawing and dragging tools. With Shift held, the placed node goes to a multiple of
 * 45 degrees from the previous segment. At a corner, it locks to the point where the two snapped rays meet.
 * Pure geometry on screen pixels (y down), so it can run on every pointer move without querying the map.
 *
 * The types are local copies of the hook in docs/adr/0011-drawing-tool-hooks.md. The renderer imports them later.
 */

export type Point = { x: number; y: number }

export type Modifiers = { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

export type ConstraintInput = {
  kind: 'draw' | 'drag'
  /** The pointer on the screen, in pixels */
  point: Point
  /**
   * The fixed nodes next to the placed node, on the screen. One neighbour for the end of a line,
   * two for a corner. `before` is the node on the far side of the neighbour, which gives the reference direction.
   */
  neighbours: { at: Point; before?: Point }[]
  modifiers: Modifiers
  /** The MapLibre bearing in degrees */
  bearing: number
}

export type ConstraintResult = { point: Point; guides: [Point, Point][] }

export const ANGLE_STEP = 45
/** A corner locks only when the pointer is this close to where the two rays meet */
export const CORNER_RADIUS_PX = 30
/** Closer than this to a neighbour, the direction is noise, so no snap */
export const MIN_SEGMENT_PX = 4
/** Each way from the neighbour, long enough to cross any screen */
export const GUIDE_LENGTH_PX = 2000

const STEP = (ANGLE_STEP * Math.PI) / 180
const TWO_PI = 2 * Math.PI
/** Two rays this close to parallel do not meet at a usable corner */
const PARALLEL_EPSILON = 1e-9

/** A line from `anchor` in a direction, as an angle in radians on screen */
type Ray = { anchor: Point; angle: number }

/**
 * Snap only for Shift on its own. Alt means a free drag and Ctrl is the right-click on a Mac, so
 * combinations with them keep their own meaning.
 */
export function constrainAngle(input: ConstraintInput): ConstraintResult | undefined {
  if (!isAngleSnapKey(input.modifiers)) return undefined
  const { point, neighbours, bearing } = input
  if (neighbours.some((neighbour) => distance(point, neighbour.at) < MIN_SEGMENT_PX))
    return undefined

  // A line end has one neighbour and a corner has two. More than two is not a case this tool covers.
  const [first, second, ...rest] = neighbours
  if (!first || rest.length > 0) return undefined
  if (!second) return alongRay(snapRay(first, point, bearing), point)

  const firstRay = snapRay(first, point, bearing)
  const secondRay = snapRay(second, point, bearing)
  const corner = meetAhead(firstRay, secondRay)
  // The corner is a point the pointer may be near. Pointers further away keep one ray only.
  if (corner && distance(corner, point) <= CORNER_RADIUS_PX) {
    return { point: corner, guides: [guideOf(firstRay), guideOf(secondRay)] }
  }
  // Keep the ray of the neighbour nearer the pointer, so the node moves the least.
  const nearer = distance(point, first.at) <= distance(point, second.at) ? firstRay : secondRay
  return alongRay(nearer, point)
}

function isAngleSnapKey(modifiers: Modifiers): boolean {
  return modifiers.shift && !modifiers.alt && !modifiers.ctrl && !modifiers.meta
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

/** The ray's point at the pointer's distance from its anchor, so the segment keeps its length */
function alongRay(ray: Ray, point: Point): ConstraintResult {
  const snapped = pointAt(ray, distance(point, ray.anchor))
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

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Into [-PI, PI), so the snap works across the 180 degree seam */
function wrap(angle: number): number {
  return ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI
}
