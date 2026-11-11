import { describe, expect, test } from 'bun:test'
import { arrowPoints } from './arrows.ts'
import { laneBands } from './lane-bands.ts'

// a way drawn north, 100 m long, at the equator (1 m ≈ 1 / 111320 degree)
const NORTH: [number, number][] = [
  [0, 0],
  [0, 100 / 111_320],
]

describe('arrowPoints', () => {
  test('a forward lane on a way drawn north points north, a right turn east', () => {
    const bands = laneBands(1, {
      highway: 'primary',
      oneway: 'yes',
      lanes: '2',
      'turn:lanes': '|right',
    })
    const points = arrowPoints(bands, NORTH, { reverseOneway: false })
    const first = points.filter((p) => p.slotId === 'way/1/lane/forward/0')
    const second = points.filter((p) => p.slotId === 'way/1/lane/forward/1')
    expect(first.every((p) => p.rotate === 0 && p.token === 'travel')).toBe(true)
    expect(second.every((p) => p.rotate === 90 && p.token === 'right')).toBe(true)
    // left lane west of the way, right lane east
    expect(first[0]!.coordinates[0]).toBeLessThan(0)
    expect(second[0]!.coordinates[0]).toBeGreaterThan(0)
  })

  test('the last arrow sits shortly before the end the lane runs to', () => {
    const bands = laneBands(1, { highway: 'primary', oneway: 'yes', lanes: '1' })
    const ys = arrowPoints(bands, NORTH, { reverseOneway: false }).map(
      (p) => p.coordinates[1] * 111_320,
    )
    expect(Math.max(...ys)).toBeCloseTo(88)
  })

  test('backward lanes point south, from the start of the way', () => {
    const bands = laneBands(1, {
      highway: 'secondary',
      lanes: '2',
      'lanes:forward': '1',
      'lanes:backward': '1',
      'turn:lanes:backward': 'left',
    })
    const back = arrowPoints(bands, NORTH, { reverseOneway: false }).filter((p) =>
      p.slotId.includes('backward'),
    )
    expect(back.every((p) => p.rotate === 90)).toBe(true) // south (180) turned left by 90: east
    expect(Math.min(...back.map((p) => p.coordinates[1] * 111_320))).toBeCloseTo(12)
  })

  test('left;through gives two arrows from one point, oneway=-1 runs south', () => {
    const bands = laneBands(1, {
      highway: 'primary',
      oneway: '-1',
      lanes: '1',
      'turn:lanes': 'left;through',
    })
    const points = arrowPoints(bands, NORTH, { reverseOneway: true })
    const firstTwo = points.slice(0, 2)
    expect(firstTwo.map((p) => p.rotate).toSorted((a, b) => a - b)).toEqual([90, 180])
    expect(firstTwo[0]!.coordinates).toEqual(firstTwo[1]!.coordinates)
  })

  test('nothing for a way without length', () => {
    const bands = laneBands(1, { highway: 'primary', oneway: 'yes', lanes: '1' })
    expect(arrowPoints(bands, [[0, 0]], { reverseOneway: false })).toEqual([])
  })
})
