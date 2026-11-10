import { describe, expect, test } from 'bun:test'
import { asksForFootway, runsAlong, sideOf, type Loc } from './footway.ts'

// a cycleway 50 m east along latitude 52.5; one metre north is about 0.000009 degrees
const BIKE: Loc[] = [
  [13.4, 52.5],
  [13.40074, 52.5],
]
const north = (metres: number): Loc[] => BIKE.map(([lon, lat]) => [lon, lat + metres * 0.000009])

describe('runsAlong', () => {
  test('a parallel footway 3 m away runs along', () => {
    expect(runsAlong(BIKE, north(3))).toBe(true)
  })
  test('a parallel footway 15 m away does not', () => {
    expect(runsAlong(BIKE, north(15))).toBe(false)
  })
  test('a footway that crosses does not', () => {
    const cross: Loc[] = [
      [13.4004, 52.4999],
      [13.4004, 52.5001],
    ]
    expect(runsAlong(BIKE, cross)).toBe(false)
  })
})

test('sideOf: north of an eastward way is its left side', () => {
  expect(sideOf(BIKE, [north(3)])).toBe('left')
  expect(sideOf(BIKE, [north(-3)])).toBe('right')
})

test('asksForFootway: a cycleway without traffic_mode, not a crossing', () => {
  expect(asksForFootway({ highway: 'cycleway' }, false)).toBe(true)
  expect(asksForFootway({ highway: 'cycleway', 'traffic_mode:right': 'foot' }, false)).toBe(false)
  expect(asksForFootway({ highway: 'cycleway', cycleway: 'crossing' }, false)).toBe(false)
  expect(asksForFootway({ highway: 'footway' }, false)).toBe(false)
})
