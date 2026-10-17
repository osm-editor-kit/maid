import { describe, expect, it } from 'bun:test'
import type { Loc } from './cut.ts'
import {
  cutShapes,
  HANDLE_HIT_LAYERS,
  HANDLE_HIT_RADIUS,
  handleName,
  handleOf,
  insertPoint,
  MIDPOINT_HIT_LAYER,
  MIDPOINT_LAYER,
  MIDPOINT_RADIUS,
  midpointOf,
  nearestEnd,
  POINT_HIT_LAYER,
  POINT_LAYER,
  POINT_RADIUS,
  replacePoint,
} from './line.ts'

const A: Loc = [13.4, 52.5]
const B: Loc = [13.401, 52.5]
const C: Loc = [13.402, 52.501]

describe('handle names', () => {
  it('names a point or a midpoint by its index, and reads the name back', () => {
    expect(handleName({ kind: 'point', index: 2 })).toBe('point:2')
    expect(handleOf('midpoint:0')).toEqual({ kind: 'midpoint', index: 0 })
    expect(handleOf('point:3')).toEqual({ kind: 'point', index: 3 })
  })

  it('reads no other name as a handle', () => {
    expect(handleOf('start')).toBeUndefined()
    expect(handleOf('point:')).toBeUndefined()
    expect(handleOf('point:x')).toBeUndefined()
    expect(handleOf('vertex:1')).toBeUndefined()
  })
})

describe('the points of a line', () => {
  it('moves one point and leaves the others and the list given as it was', () => {
    const before = [A, B]
    expect(replacePoint(before, 1, C)).toEqual([A, C])
    expect(before).toEqual([A, B])
  })

  it('inserts a point between two others', () => {
    expect(insertPoint([A, C], 1, B)).toEqual([A, B, C])
  })

  it('puts a midpoint halfway along a segment', () => {
    const middle = midpointOf([A, C], 0)
    expect(middle[0]).toBeCloseTo((A[0] + C[0]) / 2, 12)
    expect(middle[1]).toBeCloseTo((A[1] + C[1]) / 2, 12)
  })

  it('moves the end nearer to a click: the first point or the last one', () => {
    // the click is next to the last point, so the last one moves; next to the first, the first one
    expect(nearestEnd([A, B, C], [C[0] + 1e-5, C[1]])).toBe(2)
    expect(nearestEnd([A, B, C], [A[0] - 1e-5, A[1]])).toBe(0)
  })
})

describe('the handles hit areas', () => {
  it('a hit area is wider than either dot, so a finger finds the dot', () => {
    expect(HANDLE_HIT_RADIUS).toBeGreaterThan(POINT_RADIUS)
    expect(HANDLE_HIT_RADIUS).toBeGreaterThan(MIDPOINT_RADIUS)
  })

  it('the hit layers are the midpoint first, then the point, so a point is taken before a midpoint under it', () => {
    expect(HANDLE_HIT_LAYERS).toEqual([MIDPOINT_HIT_LAYER, POINT_HIT_LAYER])
    expect(new Set([MIDPOINT_HIT_LAYER, POINT_HIT_LAYER, MIDPOINT_LAYER, POINT_LAYER]).size).toBe(4)
  })
})

describe('the preview shapes', () => {
  /** The kinds of the features, in order, so that a test can read what is drawn */
  function kinds(points: Loc[], pieces?: Loc[][]): string[] {
    return cutShapes(points, pieces).features.map((f) => f.properties?.kind as string)
  }

  it('draws the line, a point for each point and a midpoint between neighbours', () => {
    expect(kinds([A, B])).toEqual(['line', 'point', 'point', 'midpoint'])
    expect(kinds([A, B, C])).toEqual(['line', 'point', 'point', 'point', 'midpoint', 'midpoint'])
  })

  it('draws each piece as a polygon after the handles', () => {
    const ring = [A, B, C, A]
    expect(kinds([A, B], [ring, ring])).toEqual([
      'line',
      'point',
      'point',
      'midpoint',
      'piece',
      'piece',
    ])
  })

  it('names the handles, and gives the midpoint positions of the segments', () => {
    const shapes = cutShapes([A, B, C], undefined)
    const names = shapes.features
      .filter((f) => f.properties?.kind !== 'line')
      .map((f) => f.properties?.handle)
    expect(names).toEqual(['point:0', 'point:1', 'point:2', 'midpoint:0', 'midpoint:1'])
    const first = shapes.features.find((f) => f.properties?.handle === 'midpoint:0')
    expect(first?.geometry).toEqual({ type: 'Point', coordinates: midpointOf([A, B, C], 0) })
  })
})
