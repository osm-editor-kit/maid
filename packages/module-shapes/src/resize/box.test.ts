import { describe, expect, it } from 'bun:test'
import type { Pt } from '../shared/vector.ts'
import {
  axesOf,
  dominantAngle,
  extentOf,
  fromAxes,
  handleAt,
  heightOf,
  mapPoint,
  MIN_SIDE,
  resizeExtent,
  toAxes,
  widthOf,
  type Extent,
} from './box.ts'

/** A box 40 m along u and 20 m along v, its low corner at the origin */
const BOX: Extent = { minU: 0, minV: 0, maxU: 40, maxV: 20 }
const FREE = { proportional: false, centre: false }
const PROPORTIONAL = { proportional: true, centre: false }
const CENTRE = { proportional: false, centre: true }
const BOTH = { proportional: true, centre: true }

/** An extent compared to the millimetre */
function expectExtent(actual: Extent, expected: Extent) {
  expect(actual.minU).toBeCloseTo(expected.minU, 3)
  expect(actual.minV).toBeCloseTo(expected.minV, 3)
  expect(actual.maxU).toBeCloseTo(expected.maxU, 3)
  expect(actual.maxV).toBeCloseTo(expected.maxV, 3)
}

describe('dominantAngle', () => {
  it('is 0 for a box along the axes, and for no segments', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ]
    const ring = p.map((a, i) => [a, p[(i + 1) % p.length]!] as const)
    expect(dominantAngle(ring)).toBeCloseTo(0, 9)
    expect(dominantAngle([])).toBe(0)
  })

  it('finds a building turned by 30°, folded into a quarter turn', () => {
    const axes = axesOf(Math.PI / 6)
    const p = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ].map((q) => fromAxes(axes, q))
    const ring = p.map((a, i) => [a, p[(i + 1) % p.length]!] as const)
    expect(dominantAngle(ring)).toBeCloseTo(Math.PI / 6, 9)
    // the same building turned by 120° is the same box
    const turned = axesOf((2 * Math.PI) / 3)
    const q = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ].map((point) => fromAxes(turned, point))
    expect(dominantAngle(q.map((a, i) => [a, q[(i + 1) % q.length]!] as const))).toBeCloseTo(
      Math.PI / 6,
      9,
    )
  })

  it('finds the walls among ten thousand short segments of other directions, quickly', () => {
    const axes = axesOf(0.4)
    const walls = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 },
    ].map((q) => fromAxes(axes, q))
    const segments = walls.map((a, i) => [a, walls[(i + 1) % walls.length]!] as const)
    // a wiggly line of 10 000 segments of 0.01 m in every direction: much less length than the walls
    const noise: (readonly [Pt, Pt])[] = []
    for (let i = 0; i < 10_000; i++) {
      const angle = (i * 2.399963) % (2 * Math.PI)
      const a = { x: 50, y: 50 }
      noise.push([a, { x: a.x + 0.01 * Math.cos(angle), y: a.y + 0.01 * Math.sin(angle) }])
    }
    const started = performance.now()
    expect(dominantAngle([...segments, ...noise])).toBeCloseTo(0.4, 9)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('follows the long walls of a building with a short slanted corner', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 18 },
      { x: 38, y: 20 },
      { x: 0, y: 20 },
    ]
    expect(dominantAngle(p.map((a, i) => [a, p[(i + 1) % p.length]!] as const))).toBeCloseTo(0, 9)
  })
})

describe('axes', () => {
  it('turns a point to the axes and back', () => {
    const axes = axesOf(0.4)
    const p = { x: 12.5, y: -3 }
    const back = fromAxes(axes, toAxes(axes, p))
    expect(back.x).toBeCloseTo(p.x, 9)
    expect(back.y).toBeCloseTo(p.y, 9)
    // the u axis is the direction of the angle
    const u = toAxes(axes, { x: Math.cos(0.4), y: Math.sin(0.4) })
    expect(u.x).toBeCloseTo(1, 9)
    expect(u.y).toBeCloseTo(0, 9)
  })

  it('measures an extent, and places the handles on its corners and edge midpoints', () => {
    const extent = extentOf([
      { x: 3, y: 1 },
      { x: -2, y: 5 },
      { x: 1, y: -4 },
    ])
    expect(extent).toEqual({ minU: -2, minV: -4, maxU: 3, maxV: 5 })
    expect(widthOf(extent)).toBe(5)
    expect(heightOf(extent)).toBe(9)
    expect(handleAt(BOX, 'ne')).toEqual({ x: 40, y: 20 })
    expect(handleAt(BOX, 'sw')).toEqual({ x: 0, y: 0 })
    expect(handleAt(BOX, 'n')).toEqual({ x: 20, y: 20 })
    expect(handleAt(BOX, 'w')).toEqual({ x: 0, y: 10 })
  })
})

describe('resizeExtent', () => {
  it('stretches freely: a corner changes both sides, the opposite corner stays', () => {
    expectExtent(resizeExtent(BOX, 'ne', { x: 50, y: 30 }, FREE), {
      minU: 0,
      minV: 0,
      maxU: 50,
      maxV: 30,
    })
    expectExtent(resizeExtent(BOX, 'sw', { x: -10, y: 5 }, FREE), {
      minU: -10,
      minV: 5,
      maxU: 40,
      maxV: 20,
    })
  })

  it('moves only one side from an edge midpoint, whatever the pointer does across it', () => {
    expectExtent(resizeExtent(BOX, 'e', { x: 60, y: 99 }, FREE), {
      minU: 0,
      minV: 0,
      maxU: 60,
      maxV: 20,
    })
    expectExtent(resizeExtent(BOX, 'n', { x: -99, y: 25 }, FREE), {
      minU: 0,
      minV: 0,
      maxU: 40,
      maxV: 25,
    })
  })

  it('keeps the proportions with Shift: a corner follows the diagonal', () => {
    // the pointer off the diagonal: its projection onto it sets the factor, 1.5 here
    const result = resizeExtent(BOX, 'ne', { x: 62, y: 26 }, PROPORTIONAL)
    expectExtent(result, { minU: 0, minV: 0, maxU: 60, maxV: 30 })
    expect(widthOf(result) / heightOf(result)).toBeCloseTo(2, 9)
  })

  it('keeps the proportions from an edge midpoint: the other side grows about its middle', () => {
    expectExtent(resizeExtent(BOX, 'e', { x: 80, y: 0 }, PROPORTIONAL), {
      minU: 0,
      minV: -10,
      maxU: 80,
      maxV: 30,
    })
  })

  it('resizes about the centre with Alt: the opposite side moves the other way', () => {
    expectExtent(resizeExtent(BOX, 'e', { x: 45, y: 10 }, CENTRE), {
      minU: -5,
      minV: 0,
      maxU: 45,
      maxV: 20,
    })
    expectExtent(resizeExtent(BOX, 'ne', { x: 50, y: 25 }, CENTRE), {
      minU: -10,
      minV: -5,
      maxU: 50,
      maxV: 25,
    })
  })

  it('does both with Shift and Alt', () => {
    const result = resizeExtent(BOX, 'ne', { x: 60, y: 30 }, BOTH)
    // the handle was 20 by 10 from the centre and is 40 by 20 now: twice the size about the centre
    expectExtent(result, { minU: -20, minV: -10, maxU: 60, maxV: 30 })
  })

  it('never makes a side shorter than the minimum, and never flips', () => {
    const squeezed = resizeExtent(BOX, 'e', { x: -30, y: 0 }, FREE)
    expect(widthOf(squeezed)).toBeCloseTo(MIN_SIDE, 9)
    expect(squeezed.minU).toBe(0)
    const centred = resizeExtent(BOX, 'n', { x: 0, y: -50 }, CENTRE)
    expect(heightOf(centred)).toBeCloseTo(MIN_SIDE, 9)
    expect((centred.minV + centred.maxV) / 2).toBeCloseTo(10, 9)
    // proportional: the short side reaches the minimum first
    const small = resizeExtent(BOX, 'ne', { x: 0, y: 0 }, PROPORTIONAL)
    expect(heightOf(small)).toBeCloseTo(MIN_SIDE, 9)
    expect(widthOf(small)).toBeCloseTo(2 * MIN_SIDE, 9)
  })

  it('works at the scale of a garden shed, to the millimetre, with the pointer 1 cm off the diagonal', () => {
    const shed: Extent = { minU: 0, minV: 0, maxU: 2.4, maxV: 1.8 }
    expectExtent(resizeExtent(shed, 'ne', { x: 2.994, y: 2.258 }, PROPORTIONAL), {
      minU: 0,
      minV: 0,
      maxU: 3,
      maxV: 2.25,
    })
  })
})

describe('mapPoint', () => {
  it('stretches each axis on its own: corners go to corners, the middle to the middle', () => {
    const to: Extent = { minU: -10, minV: 0, maxU: 70, maxV: 10 }
    expect(mapPoint(BOX, to, { x: 40, y: 20 })).toEqual({ x: 70, y: 10 })
    expect(mapPoint(BOX, to, { x: 0, y: 0 })).toEqual({ x: -10, y: 0 })
    expect(mapPoint(BOX, to, { x: 20, y: 10 })).toEqual({ x: 30, y: 5 })
  })

  it('moves a point with the middle along an axis without width', () => {
    const flat: Extent = { minU: 0, minV: 5, maxU: 10, maxV: 5 }
    expect(mapPoint(flat, { minU: 0, minV: 4, maxU: 20, maxV: 8 }, { x: 5, y: 5 })).toEqual({
      x: 10,
      y: 6,
    })
  })
})
