/**
 * Vectors and the index helper that the drawing tools share. A point is `{ x, y }`, as the renderer's screen points are,
 * so one set of helpers serves the map geometry (metres, x east and y north) and the snapping (pixels, y down).
 */

/** A point, or a vector: x and y in metres or in pixels */
export interface Pt {
  x: number
  y: number
}

/** The vector from b to a: a minus b */
export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** The two-dimensional cross product: the z component of a x b */
export function cross(a: Pt, b: Pt): number {
  return a.x * b.y - a.y * b.x
}

/** The dot product */
export function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y
}

/** The distance between two points */
export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * The item at an index the code has already checked is in range. Throws when it is not, rather than give `undefined`,
 * so a broken index shows at once.
 * @param   list - The array
 * @param   i    - The index
 * @return  The item
 */
export function item<T>(list: readonly T[], i: number): T {
  const value = list[i]
  if (value === undefined) throw new RangeError(`No element at ${i}`)
  return value
}
