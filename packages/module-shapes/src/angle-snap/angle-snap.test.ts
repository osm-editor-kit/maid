import { describe, expect, test } from 'bun:test'
import type { ConstraintInput, Modifiers } from '@osm-editor-kit/maid-renderer'
import { distance } from '../shared/vector.ts'
import {
  ANGLE_STEP,
  GUIDE_LENGTH_PX,
  angleConstraint,
  constrainAngle,
  roundedLengthPx,
} from './angle-snap'

type Point = ConstraintInput['point']

const none: Modifiers = { shift: false, alt: false, ctrl: false, meta: false }
const shift: Modifiers = { ...none, shift: true }

const origin: Point = { x: 0, y: 0 }

/** A point at `r` pixels in `degrees` on screen, with y running down like the screen */
function polar(r: number, degrees: number, from: Point = origin): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: from.x + r * Math.cos(radians), y: from.y + r * Math.sin(radians) }
}

/** The screen angle of the segment from `from` to `to`, in degrees, in (-180, 180] */
function angleOf(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

function input(overrides: Partial<ConstraintInput>): ConstraintInput {
  return {
    kind: 'draw',
    point: origin,
    neighbours: [{ at: origin }],
    modifiers: shift,
    bearing: 0,
    // 0.1 m per pixel: a length in pixels is a tenth of its length in metres
    metresPerPixel: 0.1,
    ...overrides,
  }
}

/** Shorthand for a snap of one neighbour at the origin, the pointer at `degrees` and 100 px away */
function snapOneFromOrigin(degrees: number, bearing = 0) {
  return constrainAngle(input({ point: polar(100, degrees), bearing }))
}

describe('the step rule', () => {
  test('a pointer at 22 degrees snaps to 0, at 23 and 37 degrees to 45', () => {
    expect(angleOf(origin, snapOneFromOrigin(22)!.point)).toBeCloseTo(0, 6)
    expect(angleOf(origin, snapOneFromOrigin(23)!.point)).toBeCloseTo(45, 6)
    expect(angleOf(origin, snapOneFromOrigin(37)!.point)).toBeCloseTo(45, 6)
  })

  test('the rule is symmetric: -22 degrees snaps to 0, -23 degrees to -45', () => {
    expect(angleOf(origin, snapOneFromOrigin(-22)!.point)).toBeCloseTo(0, 6)
    expect(angleOf(origin, snapOneFromOrigin(-23)!.point)).toBeCloseTo(-45, 6)
  })

  test('the length is rounded to 0.1 m: 137.3 px at 0.1 m a pixel is 13.7 m, so 137 px', () => {
    const result = constrainAngle(input({ point: polar(137.3, 10) }))!
    expect(Math.hypot(result.point.x, result.point.y)).toBeCloseTo(137, 6)
  })

  test('the step is ANGLE_STEP degrees', () => {
    expect(ANGLE_STEP).toBe(45)
  })
})

describe('wrap-around across 180 degrees', () => {
  test('a reference of 135 degrees snaps 179 and -179 degrees to 180', () => {
    // The segment before the anchor runs from (70.7, -70.7) to the anchor, so the reference is 135 degrees
    const anchor = origin
    const before = polar(100, -45)
    for (const degrees of [179, -179]) {
      const result = constrainAngle(
        input({ point: polar(100, degrees), neighbours: [{ at: anchor, before }] }),
      )!
      expect(Math.abs(angleOf(anchor, result.point))).toBeCloseTo(180, 6)
    }
  })

  test('a reference of 0 degrees snaps -170 degrees to the westward direction', () => {
    const result = constrainAngle(input({ point: polar(100, -170) }))!
    expect(Math.abs(angleOf(origin, result.point))).toBeCloseTo(180, 6)
  })
})

describe('bearing', () => {
  // Convention: map east on screen is (cos(-bearing), sin(-bearing)). At bearing 30, east points up and right,
  // at -30 degrees on screen. A pointer there is east and is kept; at bearing 0 the same pointer is off east.
  test('bearing 30 turns the absolute reference by 30 degrees, bearing 0 does not', () => {
    expect(angleOf(origin, snapOneFromOrigin(-30, 30)!.point)).toBeCloseTo(-30, 6)
    expect(angleOf(origin, snapOneFromOrigin(-30, 0)!.point)).toBeCloseTo(-45, 6)
  })

  test('at bearing 30 a pointer at screen angle 0 snaps to 15 degrees, which is east rotated by 45', () => {
    expect(angleOf(origin, snapOneFromOrigin(0, 30)!.point)).toBeCloseTo(15, 6)
  })

  test('at bearing 0 a pointer at screen angle 0 snaps to 0 degrees', () => {
    expect(angleOf(origin, snapOneFromOrigin(0, 0)!.point)).toBeCloseTo(0, 6)
  })
})

describe('the reference direction', () => {
  test('a segment continues from its previous node, so the snapped angles are relative to it', () => {
    // The previous node is at (-100, 0): the segment runs east, so a pointer at 60 degrees snaps to 45 degrees
    const result = constrainAngle(
      input({ point: polar(100, 60), neighbours: [{ at: origin, before: { x: -100, y: 0 } }] }),
    )!
    expect(angleOf(origin, result.point)).toBeCloseTo(45, 6)
  })

  test('a segment running north on screen is the reference: a pointer at -80 degrees snaps to -90', () => {
    // Previous node below the anchor, so the reference points up: -90 degrees on screen
    const result = constrainAngle(
      input({ point: polar(100, -80), neighbours: [{ at: origin, before: { x: 0, y: 100 } }] }),
    )!
    expect(angleOf(origin, result.point)).toBeCloseTo(-90, 6)
  })
})

describe('corner lock', () => {
  // The closing corner of a three-node area: A=(0,0), B=(100,0), C=(100,100). Both neighbours' reference is B.
  const A = origin
  const B: Point = { x: 100, y: 0 }
  const C: Point = { x: 100, y: 100 }
  const corner = [
    { at: C, before: B },
    { at: A, before: B },
  ]

  test('a pointer 5 px from the corner locks to (0, 100) with one guide per ray', () => {
    const result = constrainAngle(input({ point: { x: 3, y: 104 }, neighbours: corner }))!
    expect(result.point.x).toBeCloseTo(0, 6)
    expect(result.point.y).toBeCloseTo(100, 6)
    expect(result.guides).toHaveLength(2)
  })

  test('a pointer 40 px from the corner does not lock: the nearer ray is kept', () => {
    const result = constrainAngle(input({ point: { x: 40, y: 104 }, neighbours: corner }))!
    // C is nearer. Its ray runs west from C, so the point stays on y = 100 and at x less than 100
    expect(result.point.y).toBeCloseTo(100, 6)
    expect(result.point.x).toBeLessThan(100)
    expect(result.guides).toHaveLength(1)
  })

  test('parallel rays have no corner: the nearer ray is kept', () => {
    // Both neighbours run east from the same direction, so the rays never meet
    const result = constrainAngle(
      input({
        point: { x: 30, y: 2 },
        neighbours: [{ at: { x: 0, y: 0 } }, { at: { x: 0, y: 10 } }],
      }),
    )!
    // Kept at the pointer's distance from the nearer neighbour (30.07 px, 3.0 m), on the east ray
    expect(result.point.x).toBeCloseTo(30, 6)
    expect(result.point.y).toBeCloseTo(0, 6)
    expect(result.guides).toHaveLength(1)
  })

  test('a meeting point behind an anchor is rejected, even when the pointer is near it', () => {
    // A runs east from (0,0) and C runs up from (-5,100). They meet at (-5,0), which is behind A.
    // The pointer at (10,2) is only 15 px from that point, so without the check it would lock.
    const result = constrainAngle(
      input({
        point: { x: 10, y: 2 },
        neighbours: [{ at: { x: 0, y: 0 } }, { at: { x: -5, y: 100 } }],
      }),
    )!
    // 10.2 px is 1.02 m, rounded to 1.0 m, which is 10 px
    expect(result.point.x).toBeCloseTo(10, 6)
    expect(result.point.y).toBeCloseTo(0, 6)
    expect(result.guides).toHaveLength(1)
  })

  test('the corner guides are one line through each anchor, GUIDE_LENGTH_PX each way', () => {
    const result = constrainAngle(input({ point: { x: 3, y: 104 }, neighbours: corner }))!
    // The guides follow the neighbours in order: C first, then A
    result.guides.forEach(([start, end], index) => {
      const anchor = index === 0 ? C : A
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(2 * GUIDE_LENGTH_PX, 6)
      expect(
        Math.hypot((start.x + end.x) / 2 - anchor.x, (start.y + end.y) / 2 - anchor.y),
      ).toBeLessThan(1e-6)
    })
  })
})

describe('a single neighbour', () => {
  test('the guide is one line through the anchor, GUIDE_LENGTH_PX each way', () => {
    const result = snapOneFromOrigin(37)!
    expect(result.guides).toHaveLength(1)
    const [start, end] = result.guides[0]!
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(2 * GUIDE_LENGTH_PX, 6)
    expect(Math.hypot((start.x + end.x) / 2, (start.y + end.y) / 2)).toBeLessThan(1e-6)
  })

  test('a pointer closer than MIN_SEGMENT_PX to the anchor gives no snap', () => {
    expect(constrainAngle(input({ point: polar(3, 37) }))).toBeUndefined()
  })

  test('a pointer just outside MIN_SEGMENT_PX still snaps', () => {
    expect(constrainAngle(input({ point: polar(5, 37) }))).toBeDefined()
  })
})

describe('modifier keys', () => {
  test('no modifier gives no constraint', () => {
    expect(constrainAngle(input({ point: polar(100, 37), modifiers: none }))).toBeUndefined()
  })

  test('Shift alone gives a constraint, for draw and for drag', () => {
    expect(constrainAngle(input({ point: polar(100, 37), modifiers: shift }))).toBeDefined()
    expect(
      constrainAngle(input({ kind: 'drag', point: polar(100, 37), modifiers: shift })),
    ).toBeDefined()
  })

  test('Shift with Alt gives no constraint (Alt is a free drag)', () => {
    expect(
      constrainAngle(input({ point: polar(100, 37), modifiers: { ...shift, alt: true } })),
    ).toBeUndefined()
  })

  test('Shift with Ctrl gives no constraint (Ctrl is the right-click on a Mac)', () => {
    expect(
      constrainAngle(input({ point: polar(100, 37), modifiers: { ...shift, ctrl: true } })),
    ).toBeUndefined()
  })

  test('Shift with Meta gives no constraint', () => {
    expect(
      constrainAngle(input({ point: polar(100, 37), modifiers: { ...shift, meta: true } })),
    ).toBeUndefined()
  })

  test('Alt alone, Ctrl alone and Meta alone give no constraint', () => {
    for (const modifiers of [
      { ...none, alt: true },
      { ...none, ctrl: true },
      { ...none, meta: true },
    ]) {
      expect(constrainAngle(input({ point: polar(100, 37), modifiers }))).toBeUndefined()
    }
  })
})

describe('length rounding with Shift', () => {
  // The length in metres of a snapped segment along screen angle 0, at `metresPerPixel`
  const lengthAfterSnap = (metres: number, metresPerPixel: number) => {
    const result = constrainAngle(
      input({ point: { x: metres / metresPerPixel, y: 0 }, metresPerPixel }),
    )!
    return Math.hypot(result.point.x, result.point.y) * metresPerPixel
  }

  test('3.04 m is 3.0 m and 3.06 m is 3.1 m, at two scales', () => {
    for (const metresPerPixel of [0.0919, 0.31]) {
      expect(lengthAfterSnap(3.04, metresPerPixel)).toBeCloseTo(3.0, 9)
      expect(lengthAfterSnap(3.06, metresPerPixel)).toBeCloseTo(3.1, 9)
    }
  })

  test('the direction is still 45 degrees when the length is rounded', () => {
    const result = constrainAngle(input({ point: polar(90, 37), metresPerPixel: 0.0919 }))!
    expect(angleOf(origin, result.point)).toBeCloseTo(45, 6)
  })

  test('roundedLengthPx rounds to whole tenths of a metre, and keeps the length without a scale', () => {
    expect(roundedLengthPx(137.3, 0.1)).toBeCloseTo(137, 6)
    expect(roundedLengthPx(12.34, 0)).toBe(12.34)
  })

  test('a corner keeps its exact place: it is not rounded', () => {
    const B: Point = { x: 100, y: 0 }
    const C: Point = { x: 100, y: 100 }
    const result = constrainAngle(
      input({
        point: { x: 3, y: 104 },
        neighbours: [
          { at: C, before: B },
          { at: origin, before: B },
        ],
        metresPerPixel: 0.0919,
      }),
    )!
    expect(result.point.x).toBeCloseTo(0, 9)
    expect(result.point.y).toBeCloseTo(100, 9)
  })
})

describe('lengths option: labels while a node is placed', () => {
  const lengths = angleConstraint({ lengths: true })

  test('without Shift the point stays where the pointer is, with the length as a label', () => {
    const point = polar(30.4, 37)
    const result = lengths(input({ point, modifiers: none, metresPerPixel: 0.1 }))!
    expect(result.point).toEqual(point)
    expect(result.guides).toEqual([])
    expect(result.labels).toHaveLength(1)
    expect(result.labels![0]!.text).toBe('3.0 m')
  })

  test('the label sits just back from the pointer, on the segment', () => {
    const point = polar(100, 37)
    const [label] = lengths(input({ point, modifiers: none }))!.labels!
    expect(distance(label!.at, point)).toBeCloseTo(18, 6)
    expect(angleOf(point, label!.at)).toBeCloseTo(angleOf(point, origin), 6)
  })

  test('a corner gives one label per segment', () => {
    const B: Point = { x: 100, y: 0 }
    const C: Point = { x: 100, y: 100 }
    const result = lengths(
      input({
        point: { x: 60, y: 90 },
        modifiers: none,
        neighbours: [{ at: C, before: B }, { at: origin }],
      }),
    )!
    expect(result.labels).toHaveLength(2)
    expect(result.labels!.map((label) => label.text)).toEqual(['4.1 m', '10.8 m'])
  })

  test('with Shift the labels show the rounded length on the snapped segment', () => {
    const result = lengths(input({ point: polar(100, 37), metresPerPixel: 0.0919 }))!
    expect(angleOf(origin, result.point)).toBeCloseTo(45, 6)
    expect(result.labels![0]!.text).toBe('9.2 m')
    expect(result.guides).toHaveLength(1)
  })

  test('no label and no result for a pointer on the anchor, and none with no neighbour', () => {
    expect(lengths(input({ point: polar(2, 37), modifiers: none }))).toBeUndefined()
    expect(lengths(input({ point: polar(100, 37), neighbours: [], modifiers: none }))).toBe(
      undefined,
    )
  })

  test('without the option, no Shift gives nothing, as before', () => {
    expect(angleConstraint()(input({ point: polar(100, 37), modifiers: none }))).toBeUndefined()
  })
})
