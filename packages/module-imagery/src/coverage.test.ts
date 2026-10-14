import { describe, expect, it } from 'bun:test'
import { bestIds, coversMoreThanHalf, type Coverage } from './coverage.ts'

/** A rectangle of the coverage, as GeoJSON gives a polygon */
function box(west: number, south: number, east: number, north: number): Coverage {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  }
}

const VIEW = [0, 0, 10, 10] as const

describe('coversMoreThanHalf: the bounding box of the coverage, clipped to the view, against the view (as iD)', () => {
  it('counts a worldwide layer (no coverage) as the whole view', () => {
    expect(coversMoreThanHalf(undefined, VIEW)).toBe(true)
  })

  it('counts a coverage that holds the whole view', () => {
    expect(coversMoreThanHalf(box(-5, -5, 20, 20), VIEW)).toBe(true)
  })

  it('counts a coverage over more than half of the view', () => {
    expect(coversMoreThanHalf(box(-5, -5, 6, 20), VIEW)).toBe(true) // 60 %
  })

  it('does not count a coverage over less than half of the view', () => {
    expect(coversMoreThanHalf(box(-5, -5, 4, 20), VIEW)).toBe(false) // 40 %
  })

  it('does not count a coverage that is outside the view', () => {
    expect(coversMoreThanHalf(box(20, 20, 30, 30), VIEW)).toBe(false)
  })

  it('clips the coverage to the view before it is measured', () => {
    // 100 wide, but only the 10 x 10 view counts: the whole view
    expect(coversMoreThanHalf(box(-90, -90, 10, 10), VIEW)).toBe(true)
  })

  it('takes the bounding box of the clipped shape, as iD does (a diagonal half counts as all of it)', () => {
    const triangle: Coverage = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [0, 10],
          [0, 0],
        ],
      ],
    }
    expect(coversMoreThanHalf(triangle, VIEW)).toBe(true)
  })

  it('adds the parts of a multipolygon into one box', () => {
    const corners: Coverage = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [9, 9],
            [10, 9],
            [10, 10],
            [9, 10],
            [9, 9],
          ],
        ],
      ],
    }
    expect(coversMoreThanHalf(corners, VIEW)).toBe(true)
  })

  it('does not count a point or a line, which cover nothing here', () => {
    expect(coversMoreThanHalf({ type: 'Point', coordinates: [5, 5] }, VIEW)).toBe(false)
  })

  it('does not count a view with no area', () => {
    expect(coversMoreThanHalf(box(0, 0, 1, 1), [0, 0, 0, 1])).toBe(false)
  })
})

describe('bestIds: the best candidates that cover more than half, in their order', () => {
  it('keeps the order and leaves out the ones that cover too little', () => {
    expect(
      bestIds(
        [
          { id: 'small', coverage: box(0, 0, 2, 2) },
          { id: 'worldwide', coverage: undefined },
          { id: 'large', coverage: box(-5, -5, 20, 20) },
        ],
        VIEW,
      ),
    ).toEqual(['worldwide', 'large'])
  })
})
