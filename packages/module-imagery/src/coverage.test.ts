import { describe, expect, it } from 'bun:test'
import { bestIds, coverageFromBoxes, coversMoreThanHalf, type Coverage } from './coverage.ts'

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

describe('coverageFromBoxes', () => {
  it('a box covers the view it holds, and not one beside it', () => {
    const coverage = coverageFromBoxes([[13, 52, 14, 53]])
    expect(coversMoreThanHalf(coverage, [13.2, 52.2, 13.4, 52.4])).toBe(true)
    expect(coversMoreThanHalf(coverage, [15, 52.2, 15.2, 52.4])).toBe(false)
  })

  it('boxes far apart count by their part in the view', () => {
    const coverage = coverageFromBoxes([
      [-5, 41, 10, 51],
      [55, -21.5, 56, -20.8],
    ])
    expect(coversMoreThanHalf(coverage, [2, 48, 3, 49])).toBe(true)
    expect(coversMoreThanHalf(coverage, [55.2, -21.2, 55.4, -21])).toBe(true)
    expect(coversMoreThanHalf(coverage, [20, 0, 21, 1])).toBe(false)
  })

  it('no boxes covers nothing', () => {
    expect(coversMoreThanHalf(coverageFromBoxes([]), [0, 0, 1, 1])).toBe(false)
  })
})
