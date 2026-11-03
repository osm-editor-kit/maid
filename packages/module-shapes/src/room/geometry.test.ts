import { describe, expect, test } from 'bun:test'
import { distance, type Pt } from '../shared/vector.ts'
import {
  edgeDirection,
  guidedClosure,
  guideToWall,
  nearestOnRing,
  rayHit,
  snapAngle,
} from './geometry.ts'

const square: Pt[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

/** The ring turned by degrees about a centre (the same rotation formula as the test's own angles) */
function turn(ring: readonly Pt[], degrees: number, about: Pt): Pt[] {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return ring.map((p) => {
    const x = p.x - about.x
    const y = p.y - about.y
    return { x: about.x + x * cos - y * sin, y: about.y + x * sin + y * cos }
  })
}

const centre: Pt = { x: 50, y: 50 }
// Turned 30 degrees: its outward normals point at 30, 120, 210 and 300 degrees, and every wall is 50 px from the centre.
const rotated = turn(square, 30, centre)

/** The point at a distance and an angle (degrees, y down) from an origin */
function polar(origin: Pt, radius: number, degrees: number): Pt {
  const radians = (degrees * Math.PI) / 180
  return { x: origin.x + radius * Math.cos(radians), y: origin.y + radius * Math.sin(radians) }
}

/** The angle of a point seen from an origin, in degrees */
function angleOf(origin: Pt, p: Pt): number {
  return (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI
}

describe('nearestOnRing', () => {
  test('a point on an edge gives that edge, with its position along it', () => {
    const hit = nearestOnRing({ x: 50, y: 0 }, square, 2)
    expect(hit?.edge).toBe(0)
    expect(hit?.u).toBeCloseTo(0.5, 9)
    expect(hit?.distance).toBeCloseTo(0, 9)
    expect(hit?.at.x).toBeCloseTo(50, 9)
    expect(hit?.at.y).toBeCloseTo(0, 9)
  })

  test('the closing edge (from the last corner back to the first) is found too', () => {
    const hit = nearestOnRing({ x: -2, y: 50 }, square, 3)
    expect(hit?.edge).toBe(3)
    expect(hit?.u).toBeCloseTo(0.5, 9)
    expect(hit?.at.x).toBeCloseTo(0, 9)
  })

  test('a point 3 px off the right edge is found within tolerance 3, and not within 2', () => {
    const near = nearestOnRing({ x: 103, y: 40 }, square, 3)
    expect(near?.edge).toBe(1)
    expect(near?.u).toBeCloseTo(0.4, 9)
    expect(near?.distance).toBeCloseTo(3, 9)
    expect(nearestOnRing({ x: 103, y: 40 }, square, 2)).toBeUndefined()
  })

  test('at a corner the place is the corner itself', () => {
    const hit = nearestOnRing({ x: 101, y: -1 }, square, 2)
    expect(hit?.at.x).toBeCloseTo(100, 9)
    expect(hit?.at.y).toBeCloseTo(0, 9)
    expect(hit?.distance).toBeCloseTo(Math.SQRT2, 9)
  })

  test('a point out of tolerance gives undefined', () => {
    expect(nearestOnRing({ x: 50, y: 20 }, square, 5)).toBeUndefined()
  })

  test('on the rotated ring the centre is 50 px from every wall', () => {
    expect(nearestOnRing(centre, rotated, 10)).toBeUndefined()
    expect(nearestOnRing(centre, rotated, 60)?.distance).toBeCloseTo(50, 6)
  })
})

describe('edgeDirection', () => {
  test('the direction of each edge of the square is a unit vector along it', () => {
    expect(edgeDirection(square, 0)).toEqual({ x: 1, y: 0 })
    expect(edgeDirection(square, 1)).toEqual({ x: 0, y: 1 })
    expect(edgeDirection(square, 2)).toEqual({ x: -1, y: 0 })
    expect(edgeDirection(square, 3)).toEqual({ x: 0, y: -1 })
  })

  test('a zero-length edge gives the x axis', () => {
    const ring: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(edgeDirection(ring, 0)).toEqual({ x: 1, y: 0 })
  })

  test('a rotated edge is a unit vector along the turned wall', () => {
    const direction = edgeDirection(rotated, 0)
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 9)
    expect(angleOf({ x: 0, y: 0 }, direction)).toBeCloseTo(30, 6)
  })
})

describe('snapAngle', () => {
  const from: Pt = { x: 20, y: 30 }
  const horizontal: Pt = { x: 1, y: 0 }

  test('step 45 against a horizontal reference: 37 degrees snaps to 45, and the distance is kept', () => {
    const pointer = polar(from, 100, 37)
    const snapped = snapAngle(from, pointer, horizontal, 45)
    expect(angleOf(from, snapped)).toBeCloseTo(45, 6)
    expect(distance(from, snapped)).toBeCloseTo(100, 6)
  })

  test('step 10 against a horizontal reference: 37 degrees snaps to 40, and the distance is kept', () => {
    const pointer = polar(from, 80, 37)
    const snapped = snapAngle(from, pointer, horizontal, 10)
    expect(angleOf(from, snapped)).toBeCloseTo(40, 6)
    expect(distance(from, snapped)).toBeCloseTo(80, 6)
  })

  test('the angles are measured from a 30 degree reference: 37 degrees from it snaps to 75 (step 45) and 70 (step 10)', () => {
    const reference: Pt = { x: 3 * Math.cos(Math.PI / 6), y: 3 * Math.sin(Math.PI / 6) }
    const pointer = polar(from, 100, 67)
    expect(angleOf(from, snapAngle(from, pointer, reference, 45))).toBeCloseTo(75, 6)
    expect(angleOf(from, snapAngle(from, pointer, reference, 10))).toBeCloseTo(70, 6)
    expect(distance(from, snapAngle(from, pointer, reference, 45))).toBeCloseTo(100, 6)
  })

  test('a pointer 5 degrees off a vertical reference snaps onto it (90 degrees)', () => {
    const snapped = snapAngle(from, polar(from, 50, 95), { x: 0, y: 1 }, 45)
    expect(angleOf(from, snapped)).toBeCloseTo(90, 6)
  })

  test('when the pointer equals from, the result is from', () => {
    expect(snapAngle(from, { x: 20, y: 30 }, horizontal, 45)).toEqual(from)
  })
})

describe('rayHit', () => {
  test('from inside the square, the ray to the right hits the right edge 50 px away', () => {
    const hit = rayHit({ x: 50, y: 50 }, { x: 1, y: 0 }, square)
    expect(hit?.edge).toBe(1)
    expect(hit?.at.x).toBeCloseTo(100, 9)
    expect(hit?.at.y).toBeCloseTo(50, 9)
    expect(hit?.distance).toBeCloseTo(50, 9)
  })

  test('the direction need not be a unit vector: the distance is still in pixels', () => {
    const hit = rayHit({ x: 50, y: 50 }, { x: 0, y: 7 }, square)
    expect(hit?.edge).toBe(2)
    expect(hit?.distance).toBeCloseTo(50, 9)
  })

  test('minDistance skips the start edge when from lies on an edge', () => {
    const hit = rayHit({ x: 50, y: 0 }, { x: 0, y: 1 }, square)
    expect(hit?.edge).toBe(2)
    expect(hit?.at.y).toBeCloseTo(100, 9)
    expect(hit?.distance).toBeCloseTo(100, 9)
  })

  test('without a farther edge, a ray that starts on the wall and points out gives no hit', () => {
    expect(rayHit({ x: 50, y: 0 }, { x: 0, y: -1 }, square)).toBeUndefined()
  })

  test('from outside a convex ring, a ray pointing away gives no hit', () => {
    expect(rayHit({ x: 200, y: 50 }, { x: 1, y: 0 }, square)).toBeUndefined()
  })

  test('a zero direction gives no hit', () => {
    expect(rayHit({ x: 50, y: 50 }, { x: 0, y: 0 }, square)).toBeUndefined()
  })

  test('from the centre of the rotated ring, the hit is on the wall turned to 30 degrees, 100 / sqrt(3) px away', () => {
    const hit = rayHit(centre, { x: 1, y: 0 }, rotated)
    expect(hit?.distance).toBeCloseTo(100 / Math.sqrt(3), 6)
    // the wall's outward normal is at 30 degrees, 50 px from the centre: the hit lies on that line
    const normalX = Math.cos(Math.PI / 6)
    const normalY = Math.sin(Math.PI / 6)
    const along = hit
      ? (hit.at.x - centre.x) * normalX + (hit.at.y - centre.y) * normalY
      : Number.NaN
    expect(along).toBeCloseTo(50, 6)
    expect(nearestOnRing(hit?.at ?? centre, rotated, 1e-6)?.distance).toBeCloseTo(0, 6)
  })
})

describe('guidedClosure', () => {
  test('the room started on the bottom wall and the pointer is at (90, 60): the guide closes at about (90, 100)', () => {
    const closure = guidedClosure(
      [
        { x: 50, y: 100 },
        { x: 50, y: 60 },
      ],
      { x: 90, y: 60 },
      square,
    )
    expect(closure?.x).toBeCloseTo(90, 6)
    expect(closure?.y).toBeCloseTo(100, 6)
  })

  test('with fewer than two points there is no guide', () => {
    expect(guidedClosure([], { x: 90, y: 60 }, square)).toBeUndefined()
    expect(guidedClosure([{ x: 50, y: 100 }], { x: 90, y: 60 }, square)).toBeUndefined()
  })

  test('two equal points give a zero direction, and so no guide', () => {
    expect(
      guidedClosure(
        [
          { x: 50, y: 60 },
          { x: 50, y: 60 },
        ],
        { x: 90, y: 60 },
        square,
      ),
    ).toBeUndefined()
  })

  test('on the rotated ring the guide meets the turned wall', () => {
    // The direction is points[0] - points[1] = (10, 0); the ray at y = 60 meets the wall with normal 30 degrees.
    const closure = guidedClosure(
      [
        { x: 60, y: 50 },
        { x: 50, y: 50 },
      ],
      { x: 50, y: 60 },
      rotated,
    )
    expect(closure?.x).toBeCloseTo(50 + (50 - 0.5 * 10) / Math.cos(Math.PI / 6), 6)
    expect(closure?.y).toBeCloseTo(60, 6)
    expect(nearestOnRing(closure ?? centre, rotated, 1e-6)?.distance).toBeCloseTo(0, 6)
  })
})

describe('guideToWall', () => {
  test('from (50, 100) towards (50, 60) the guide reaches the top wall at about (50, 0)', () => {
    const guide = guideToWall({ x: 50, y: 100 }, { x: 50, y: 60 }, square)
    expect(guide?.x).toBeCloseTo(50, 6)
    expect(guide?.y).toBeCloseTo(0, 6)
  })

  test('from and towards the same point give no guide', () => {
    expect(guideToWall({ x: 50, y: 100 }, { x: 50, y: 100 }, square)).toBeUndefined()
  })

  test('on the rotated ring the guide reaches the turned wall again', () => {
    const guide = guideToWall({ x: 50, y: 60 }, { x: 60, y: 60 }, rotated)
    expect(guide?.x).toBeCloseTo(50 + (50 - 0.5 * 10) / Math.cos(Math.PI / 6), 6)
    expect(guide?.y).toBeCloseTo(60, 6)
  })
})
