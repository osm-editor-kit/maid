/**
 * The size of a four-cornered shape in metres, for the divide panel: the whole and each part. Length is the mean of the
 * longer pair of opposite sides, width the mean of the shorter pair, so a parking space reads 5 × 2.5 m whichever way it
 * was drawn. The area is the real area of the quadrilateral, so it is right for a trapezoid too.
 */
import { frameAt, toMetres, type Loc } from '../shared/metres.ts'
import { distance, item } from '../shared/vector.ts'
import { divideCells, type Corners } from './divide.ts'

export type Size = { length: number; width: number; area: number }

/** The size of one quadrilateral given by its four corners in order */
export function sizeOf(corners: readonly Loc[]): Size {
  const frame = frameAt(corners)
  const p = corners.map((loc) => toMetres(frame, loc))
  const side = (i: number) => distance(item(p, i), item(p, (i + 1) % 4))
  // sides 0 and 2 face each other, as do 1 and 3
  const first = (side(0) + side(2)) / 2
  const second = (side(1) + side(3)) / 2
  let twice = 0
  for (let i = 0; i < 4; i++) {
    const a = item(p, i)
    const b = item(p, (i + 1) % 4)
    twice += a.x * b.y - b.x * a.y
  }
  return {
    length: Math.max(first, second),
    width: Math.min(first, second),
    area: Math.abs(twice) / 2,
  }
}

/** The whole, and the smallest and largest part of a division (the same for a rectangle or a parallelogram) */
export function divisionSizes(corners: Corners, columns: number, rows: number) {
  const parts = divideCells(corners, columns, rows).map(sizeOf)
  const pick = (key: keyof Size, better: (a: number, b: number) => boolean) =>
    parts.reduce((best, part) => (better(part[key], best[key]) ? part : best))
  return {
    whole: sizeOf(corners),
    smallest: pick('area', (a, b) => a < b),
    largest: pick('area', (a, b) => a > b),
  }
}
