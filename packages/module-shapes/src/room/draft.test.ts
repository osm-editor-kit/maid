import { describe, expect, test } from 'bun:test'
import { type Pt } from '../shared/vector.ts'
import { lineOf, pointerOf, type Draft, type DraftKeys, type DraftPointer } from './draft.ts'

const ring: Pt[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]
const tolerance = 8
const plain: DraftKeys = { shift: false, alt: false }
const withShift: DraftKeys = { shift: true, alt: false }
const withShiftAlt: DraftKeys = { shift: true, alt: true }
const empty: Draft = { points: [], startEdge: 0 }

/** The point at a distance and an angle (degrees, y down) from an origin */
function polar(origin: Pt, radius: number, degrees: number): Pt {
  const radians = (degrees * Math.PI) / 180
  return { x: origin.x + radius * Math.cos(radians), y: origin.y + radius * Math.sin(radians) }
}

/** The angle of a point seen from an origin, in degrees */
function angleOf(origin: Pt, p: Pt): number {
  return (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI
}

/** Two points are the same to six decimals */
function expectNear(actual: Pt, expected: Pt): void {
  expect(actual.x).toBeCloseTo(expected.x, 6)
  expect(actual.y).toBeCloseTo(expected.y, 6)
}

/** The pointer result as the kind asked for; fails the test when it is another kind */
function kindOf<K extends DraftPointer['kind']>(
  result: DraftPointer,
  kind: K,
): Extract<DraftPointer, { kind: K }> {
  if (result.kind !== kind) throw new Error(`expected ${kind}, got ${result.kind}`)
  return result as Extract<DraftPointer, { kind: K }>
}

describe('pointerOf with no point yet', () => {
  test('a pointer near the top wall starts the room there, on that edge, at the point projected onto the wall', () => {
    const start = kindOf(pointerOf(empty, { x: 30, y: 3 }, ring, plain, tolerance), 'start')
    expect(start.edge).toBe(0)
    expectNear(start.at, { x: 30, y: 0 })
  })

  test('a pointer near the closing (left) wall starts on that edge', () => {
    const start = kindOf(pointerOf(empty, { x: -3, y: 40 }, ring, plain, tolerance), 'start')
    expect(start.edge).toBe(3)
    expectNear(start.at, { x: 0, y: 40 })
  })

  test('a pointer in the middle of the building is off the wall', () => {
    expect(pointerOf(empty, { x: 50, y: 50 }, ring, plain, tolerance)).toEqual({ kind: 'off-wall' })
  })

  test('a pointer just beyond the tolerance from a wall is off the wall', () => {
    expect(pointerOf(empty, { x: 30, y: -9 }, ring, plain, tolerance)).toEqual({ kind: 'off-wall' })
  })
})

describe('pointerOf with one point on the bottom wall ({50,100}, edge 2)', () => {
  const one: Draft = { points: [{ x: 50, y: 100 }], startEdge: 2 }

  test('without keys the corner is the pointer, and the guide runs from the point through it to the top wall', () => {
    const corner = kindOf(pointerOf(one, { x: 52, y: 60 }, ring, plain, tolerance), 'corner')
    expect(corner.next).toEqual({ x: 52, y: 60 })
    expect(corner.closure).toBeUndefined()
    // the ray from (50,100) through (52,60) has direction (2,-40): it reaches y = 0 at x = 55
    expect(corner.guide).toBeDefined()
    expectNear(corner.guide!, { x: 55, y: 0 })
  })

  test('with Shift the corner snaps to vertical from the wall: x is 50, the distance is kept', () => {
    const pointer = { x: 52, y: 60 }
    const corner = kindOf(pointerOf(one, pointer, ring, withShift, tolerance), 'corner')
    expect(corner.next.x).toBeCloseTo(50, 6)
    expect(corner.next.y).toBeLessThan(100)
    const kept = Math.hypot(pointer.x - 50, pointer.y - 100)
    expect(Math.hypot(corner.next.x - 50, corner.next.y - 100)).toBeCloseTo(kept, 6)
    expectNear(corner.guide!, { x: 50, y: 0 })
  })

  test('with Shift and Alt the corner snaps to 10 degree steps from the wall, not to the 45 degree step of Shift', () => {
    // 16 degrees off vertical: Shift alone snaps it to -90 degrees (straight up), Shift+Alt to -70
    const pointer = polar({ x: 50, y: 100 }, 50, -74)
    const fine = kindOf(pointerOf(one, pointer, ring, withShiftAlt, tolerance), 'corner')
    const coarse = kindOf(pointerOf(one, pointer, ring, withShift, tolerance), 'corner')
    expect(angleOf({ x: 50, y: 100 }, coarse.next)).toBeCloseTo(-90, 6)
    expect(angleOf({ x: 50, y: 100 }, fine.next)).toBeCloseTo(-70, 6)
    // the angle from the wall direction (180 degrees, pointing left) is a multiple of 10 degrees
    const offset = angleOf({ x: 50, y: 100 }, fine.next) - 180
    expect(Math.abs(offset / 10 - Math.round(offset / 10))).toBeLessThan(1e-9)
    expect(Math.hypot(fine.next.x - 50, fine.next.y - 100)).toBeCloseTo(50, 6)
  })

  test('a click on another wall ends the room there, at the wall point', () => {
    const end = kindOf(pointerOf(one, { x: 100, y: 60 }, ring, plain, tolerance), 'end')
    expectNear(end.at, { x: 100, y: 60 })
  })
})

describe('pointerOf with two points [{50,100},{50,60}]', () => {
  const two: Draft = {
    points: [
      { x: 50, y: 100 },
      { x: 50, y: 60 },
    ],
    startEdge: 2,
  }

  test('a pointer inside gives a corner with the guided closure on the bottom wall below the pointer', () => {
    const corner = kindOf(pointerOf(two, { x: 90, y: 60 }, ring, plain, tolerance), 'corner')
    expect(corner.next).toEqual({ x: 90, y: 60 })
    expect(corner.guide).toBeUndefined()
    expect(corner.closure).toBeDefined()
    expectNear(corner.closure!, { x: 90, y: 100 })
  })

  test('lineOf gives the fixed points, the corner under the pointer and the closure', () => {
    const line = lineOf(two, pointerOf(two, { x: 90, y: 60 }, ring, plain, tolerance))
    expect(line).toHaveLength(4)
    expectNear(line![0]!, { x: 50, y: 100 })
    expectNear(line![1]!, { x: 50, y: 60 })
    expectNear(line![2]!, { x: 90, y: 60 })
    expectNear(line![3]!, { x: 90, y: 100 })
  })

  test('with Shift the second segment is measured from the first, so it stays at a right angle to it', () => {
    // 10 degrees off horizontal from (50,60); the first segment points up (-90), so the snap is to 0 degrees
    const pointer = polar({ x: 50, y: 60 }, 40, 10)
    const corner = kindOf(pointerOf(two, pointer, ring, withShift, tolerance), 'corner')
    expectNear(corner.next, { x: 90, y: 60 })
    expectNear(corner.closure!, { x: 90, y: 100 })
  })

  test('a click on another wall ends the room there, and lineOf adds that end to the points', () => {
    const pointer = pointerOf(two, { x: 100, y: 60 }, ring, plain, tolerance)
    const end = kindOf(pointer, 'end')
    expectNear(end.at, { x: 100, y: 60 })
    const line = lineOf(two, pointer)
    expect(line).toHaveLength(3)
    expectNear(line![2]!, { x: 100, y: 60 })
  })

  test('a click on the start wall beyond the tolerance of the start point ends the room there', () => {
    const end = kindOf(pointerOf(two, { x: 80, y: 100 }, ring, plain, tolerance), 'end')
    expectNear(end.at, { x: 80, y: 100 })
  })

  test('a pointer on the start wall near the start point is a corner, not an end', () => {
    const corner = kindOf(pointerOf(two, { x: 52, y: 100 }, ring, plain, tolerance), 'corner')
    expect(corner.next).toEqual({ x: 52, y: 100 })
    // the ray back to the start wall from here meets no edge ahead of the pointer
    expect(corner.closure).toBeUndefined()
  })

  test('a pointer on a wall near the last point (not the start point) is a corner, not an end', () => {
    const near: Draft = {
      points: [
        { x: 50, y: 100 },
        { x: 100, y: 60 },
      ],
      startEdge: 2,
    }
    const corner = kindOf(pointerOf(near, { x: 100, y: 62 }, ring, plain, tolerance), 'corner')
    expect(corner.next).toEqual({ x: 100, y: 62 })
  })
})

describe('lineOf', () => {
  const two: Draft = {
    points: [
      { x: 50, y: 100 },
      { x: 50, y: 60 },
    ],
    startEdge: 2,
  }

  test('is undefined for off-wall', () => {
    expect(
      lineOf(empty, pointerOf(empty, { x: 50, y: 50 }, ring, plain, tolerance)),
    ).toBeUndefined()
  })

  test('is undefined for start: the room has no line until a second point', () => {
    expect(lineOf(empty, pointerOf(empty, { x: 30, y: 3 }, ring, plain, tolerance))).toBeUndefined()
  })

  test('is undefined for a corner without a closure (one fixed point, or no wall ahead)', () => {
    const one: Draft = { points: [{ x: 50, y: 100 }], startEdge: 2 }
    expect(lineOf(one, pointerOf(one, { x: 52, y: 60 }, ring, plain, tolerance))).toBeUndefined()
    expect(lineOf(two, pointerOf(two, { x: 52, y: 100 }, ring, plain, tolerance))).toBeUndefined()
  })

  test('is undefined for an end when there are no fixed points (the guard for a draft that has not started)', () => {
    expect(lineOf(empty, { kind: 'end', at: { x: 100, y: 60 } })).toBeUndefined()
  })
})
