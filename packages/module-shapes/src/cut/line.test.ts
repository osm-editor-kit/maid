import { describe, expect, it } from 'bun:test'
import type { Loc } from './cut.ts'
import { clickedAt, cutShapes, withoutLast, withPoint } from './line.ts'

const A: Loc = [13.4, 52.5]
const B: Loc = [13.401, 52.5]
const C: Loc = [13.402, 52.501]

describe('the points of a cut', () => {
  it('adds a point at the end and leaves the list it was given as it was', () => {
    const before = [A]
    expect(withPoint(before, B)).toEqual([A, B])
    expect(before).toEqual([A])
  })

  it('removes the last point, and nothing from an empty list', () => {
    expect(withoutLast([A, B, C])).toEqual([A, B])
    expect(withoutLast([])).toEqual([])
  })

  it('puts a click where the snap target is, and where the pointer is when nothing is under it', () => {
    expect(clickedAt(13.4005, 52.5, { loc: B })).toEqual(B)
    expect(clickedAt(13.4005, 52.5)).toEqual([13.4005, 52.5])
  })

  it('gives a copy of the snapped position, not the same array', () => {
    const target: Loc = [13.401, 52.5]
    const at = clickedAt(0, 0, { loc: target })
    expect(at).toEqual(target)
    expect(at).not.toBe(target)
  })
})

describe('the preview shapes', () => {
  /** The kinds of the features, in order, so that a test can read what is drawn */
  function kinds(points: Loc[], pointer?: Loc, chord?: Loc[]): string[] {
    return cutShapes(points, pointer, chord).features.map((f) => f.properties?.kind as string)
  }

  it('draws nothing but the points while one point is set and the pointer is not on the map', () => {
    expect(kinds([A])).toEqual(['point'])
  })

  it('draws the drawn line, the rubber band to the pointer, the points and the chord', () => {
    expect(kinds([A, B], C, [A, B])).toEqual(['drawn', 'band', 'point', 'point', 'chord'])
  })

  it('draws the rubber band from the last point only once there is one', () => {
    expect(kinds([], C)).toEqual([])
  })

  it('gives the lines their positions, with the pointer as the end of the band', () => {
    const shapes = cutShapes([A, B], C, undefined)
    const band = shapes.features.find((f) => f.properties?.kind === 'band')
    expect(band?.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [B[0], B[1]],
        [C[0], C[1]],
      ],
    })
  })
})
