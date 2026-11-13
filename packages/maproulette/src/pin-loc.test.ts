import { describe, expect, test } from 'bun:test'
import { lineStrings, snapPinLoc } from './pin-loc.ts'

const line = (coordinates: number[][]) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates },
})

describe('lineStrings', () => {
  test('lines and multi lines only', () => {
    const geometries = {
      type: 'FeatureCollection',
      features: [
        line([
          [0, 0],
          [1, 0],
        ]),
        { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 5] } },
        {
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [2, 2],
                [3, 2],
              ],
              [
                [4, 4],
                [5, 4],
              ],
            ],
          },
        },
      ],
    }
    expect(lineStrings(geometries)).toHaveLength(3)
    expect(lineStrings(null)).toEqual([])
  })
})

describe('snapPinLoc', () => {
  test('projects onto the nearest segment', () => {
    const snapped = snapPinLoc([0.5, 0.1], {
      features: [
        line([
          [0, 0],
          [1, 0],
        ]),
      ],
    })
    expect(snapped[0]).toBeCloseTo(0.5, 6)
    expect(snapped[1]).toBeCloseTo(0, 6)
  })

  test('beyond the end of a line the end point', () => {
    expect(
      snapPinLoc([2, 0.1], {
        features: [
          line([
            [0, 0],
            [1, 0],
          ]),
        ],
      }),
    ).toEqual([1, 0])
  })

  test('picks the nearest of several lines', () => {
    const snapped = snapPinLoc([0.5, 0.9], {
      features: [
        line([
          [0, 0],
          [1, 0],
        ]),
        line([
          [0, 1],
          [1, 1],
        ]),
      ],
    })
    expect(snapped[1]).toBeCloseTo(1, 6)
  })

  test('points only, no geometry or a bad location: unchanged', () => {
    const loc: [number, number] = [1, 2]
    expect(
      snapPinLoc(loc, {
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] } }],
      }),
    ).toBe(loc)
    expect(snapPinLoc(loc, undefined)).toBe(loc)
    const bad: [number, number] = [Number.NaN, 0]
    expect(
      snapPinLoc(bad, {
        features: [
          line([
            [0, 0],
            [1, 0],
          ]),
        ],
      }),
    ).toBe(bad)
  })

  test('a one-point line gives that point', () => {
    expect(snapPinLoc([3, 3], { features: [line([[1, 1]])] })).toEqual([1, 1])
  })
})
