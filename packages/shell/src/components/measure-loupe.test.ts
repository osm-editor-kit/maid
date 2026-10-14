import { describe, expect, test } from 'bun:test'
import {
  crossPath,
  distanceToSegment,
  FINGER_REACH,
  LOUPE_RADIUS,
  LOUPE_SCALE,
  loupeCamera,
  loupeCenter,
  loupeTape,
  loupeZoom,
} from './measure-loupe'

const R = LOUPE_RADIUS
const MAP: [number, number] = [1000, 700]
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** A grid of points over the map, with the margin of the test a place a pointer can be at */
function grid(step: number) {
  const points: [number, number][] = []
  for (let x = 0; x <= MAP[0]; x += step)
    for (let y = 0; y <= MAP[1]; y += step) points.push([x, y])
  return points
}

describe('loupeCenter', () => {
  test('away from the tape: the lens sits on the far side of the point, at radius + gap + reach', () => {
    // the tape runs to the left, so the lens goes to the right
    expect(loupeCenter([500, 350], [400, 350], MAP, R)).toEqual([500 + R + 12 + 12, 350])
  })

  test('above the point with no first click yet (both ends on top of each other)', () => {
    expect(loupeCenter([500, 350], [500, 350], MAP, R)).toEqual([500, 350 - R - 12 - 12])
  })

  test('with `up` (a finger) the lens sits above the point, when the tape does not go up', () => {
    // a finger is wider: the lens keeps 28 px from it, above
    expect(loupeCenter([500, 350], [500, 420], MAP, R, { up: true, reach: FINGER_REACH })).toEqual([
      500,
      350 - R - 12 - 28,
    ])
    expect(loupeCenter([500, 350], [560, 400], MAP, R, { up: true, reach: FINGER_REACH })).toEqual([
      500,
      350 - R - 12 - 28,
    ])
  })

  test('with `up` and a tape upwards, the lens goes elsewhere, off the tape', () => {
    const centre = loupeCenter([500, 350], [500, 250], MAP, R, { up: true, reach: FINGER_REACH })
    expect(centre[1]).toBeGreaterThanOrEqual(350 - 1)
    expect(distanceToSegment(centre, [500, 350], [500, 250])).toBeGreaterThanOrEqual(R + 12)
  })

  test('the lens is never over the tape (for every point of a grid and a tape going the other way)', () => {
    for (const handle of grid(50)) {
      const other: [number, number] = [handle[0] + 120, handle[1] - 40]
      const centre = loupeCenter(handle, other, MAP, R)
      const inside =
        centre[0] - R >= 0 &&
        centre[1] - R >= 0 &&
        centre[0] + R <= MAP[0] &&
        centre[1] + R <= MAP[1]
      if (inside) expect(distanceToSegment(centre, handle, other)).toBeGreaterThanOrEqual(R + 12)
    }
  })

  test('the point is never under the lens, for a pointer and for a finger (inside the map)', () => {
    for (const handle of grid(40)) {
      const other: [number, number] = [MAP[0] / 2, MAP[1] / 2]
      for (const options of [{}, { up: true, reach: FINGER_REACH }]) {
        const centre = loupeCenter(handle, other, MAP, R, options)
        expect(dist(centre, handle)).toBeGreaterThanOrEqual(R)
      }
    }
  })

  test('the lens is inside the map, also with the point at an edge or a corner', () => {
    for (const handle of [
      [0, 0],
      [MAP[0], 0],
      [0, MAP[1]],
      [MAP[0], MAP[1]],
      [5, 350],
      [995, 350],
      [500, 5],
      [500, 695],
    ] as [number, number][]) {
      const centre = loupeCenter(handle, [handle[0] + 30, handle[1]], MAP, R)
      expect(centre[0] - R).toBeGreaterThanOrEqual(0)
      expect(centre[1] - R).toBeGreaterThanOrEqual(0)
      expect(centre[0] + R).toBeLessThanOrEqual(MAP[0])
      expect(centre[1] + R).toBeLessThanOrEqual(MAP[1])
    }
  })
})

describe('loupeTape', () => {
  test('starts at the lens centre and runs to the other end at three times the distance', () => {
    expect(loupeTape([100, 100], [110, 100])).toEqual({ x1: R, y1: R, x2: R + 30, y2: R })
    expect(loupeTape([100, 100], [100, 60])).toEqual({ x1: R, y1: R, x2: R, y2: R - 120 })
  })

  test('a first point near the pointer ends inside the lens', () => {
    const tape = loupeTape([100, 100], [120, 90])
    expect(Math.hypot(tape.x2 - R, tape.y2 - R)).toBeLessThan(R)
  })
})

describe('loupeZoom', () => {
  test('the lens is three times larger: log2(3) zoom levels deeper', () => {
    expect(LOUPE_SCALE).toBe(3)
    expect(loupeZoom(13)).toBeCloseTo(13 + Math.log2(3), 10)
    expect(2 ** (loupeZoom(13) - 13)).toBeCloseTo(3, 10)
  })
})

describe('loupeCamera', () => {
  test('centred on the pointer, log2(3) deeper than the main map, with the main map bearing', () => {
    expect(loupeCamera({ lon: 13.4, lat: 52.5 }, { zoom: 15, bearing: 30 })).toEqual({
      center: [13.4, 52.5],
      zoom: loupeZoom(15),
      bearing: 30,
    })
  })
})

describe('crossPath', () => {
  test('four arms with a gap at the centre', () => {
    expect(crossPath()).toBe('M58,80H75M85,80H102M80,58V75M80,85V102')
  })
})
