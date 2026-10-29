import { describe, expect, test } from 'bun:test'
import { insideRing, interiorPoint, MIN_INSIDE_PX, moveHandleAnchor, type Loc } from './move-handle'

const SQUARE: Loc[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
]
/** A U open to the north: its centroid lies in the gap */
const U: Loc[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [8, 10],
  [8, 2],
  [2, 2],
  [2, 10],
  [0, 10],
  [0, 0],
]

describe('interiorPoint', () => {
  test('a square: its centre', () => {
    expect(interiorPoint(SQUARE)).toEqual([2, 2])
  })

  test('a U: inside one of its arms, not in the gap', () => {
    const point = interiorPoint(U)!
    expect(insideRing(point, U)).toBe(true)
  })
})

describe('moveHandleAnchor', () => {
  test('an area large on screen: inside', () => {
    expect(moveHandleAnchor({ kind: 'area', ring: SQUARE, screenSize: 300 })).toEqual({
      lon: 2,
      lat: 2,
      placement: 'inside',
    })
  })

  test('an area small on screen: above its top vertex', () => {
    expect(moveHandleAnchor({ kind: 'area', ring: SQUARE, screenSize: MIN_INSIDE_PX - 1 })).toEqual(
      { lon: 4, lat: 4, placement: 'above' },
    )
  })

  test('a line: above its northernmost vertex', () => {
    expect(
      moveHandleAnchor({
        kind: 'line',
        locs: [
          [0, 0],
          [1, 3],
          [2, 1],
        ],
      }),
    ).toEqual({ lon: 1, lat: 3, placement: 'above' })
  })

  test('a point: above it', () => {
    expect(moveHandleAnchor({ kind: 'point', loc: [5, 6] })).toEqual({
      lon: 5,
      lat: 6,
      placement: 'above',
    })
  })

  test('a line that leaves the view: above its top vertex in view', () => {
    const locs: Loc[] = [
      [0, 0],
      [1, 2],
      [2, 9],
    ]
    expect(moveHandleAnchor({ kind: 'line', locs }, [-1, -1, 5, 5])).toEqual({
      lon: 1,
      lat: 2,
      placement: 'above',
    })
  })

  test('an area whose middle is out of view: above its top vertex in view', () => {
    expect(
      moveHandleAnchor({ kind: 'area', ring: SQUARE, screenSize: 300 }, [3, -1, 5, 5]),
    ).toEqual({ lon: 4, lat: 4, placement: 'above' })
  })

  test('nothing in view: undefined', () => {
    expect(moveHandleAnchor({ kind: 'point', loc: [9, 9] }, [0, 0, 1, 1])).toBeUndefined()
  })

  test('nothing to place: undefined', () => {
    expect(moveHandleAnchor({ kind: 'line', locs: [] })).toBeUndefined()
  })
})
