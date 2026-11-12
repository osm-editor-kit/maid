import { describe, expect, test } from 'bun:test'
import { handleRadius, startAngle } from './RotateHandle'

const deg = (radians: number) => Math.round((radians * 180) / Math.PI)

describe('startAngle', () => {
  test('a feature starts straight up', () => {
    expect(deg(startAngle({ pivot: [0, 0], reach: 0.001 }, 0))).toBe(-90)
  })
  test('a direction starts where it points, on a turned map too', () => {
    expect(deg(startAngle({ pivot: [0, 0], reach: 0, directionDegrees: 90 }, 0))).toBe(0)
    expect(deg(startAngle({ pivot: [0, 0], reach: 0, directionDegrees: 90 }, 30))).toBe(-30)
  })
})

describe('handleRadius', () => {
  const phone = { width: 390, height: 700 }
  test('a point: the least distance', () => {
    expect(handleRadius(0, 19, phone)).toBe(72)
  })
  test('beyond the farthest node', () => {
    // 100 px on screen at zoom 19: 100 * 2π / (512 * 2^19)
    const reach = (100 * 2 * Math.PI) / (512 * 2 ** 19)
    expect(Math.round(handleRadius(reach, 19, phone))).toBe(144)
  })
  test('never more than a share of the map', () => {
    expect(Math.round(handleRadius(1, 19, phone))).toBe(Math.round(0.42 * 390))
  })
})
