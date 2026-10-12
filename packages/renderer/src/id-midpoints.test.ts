// Adopted from iD test/spec/svg/midpoints.js (ISC, © iD contributors), at commit 0194f3926.
// iD's geometry is in degrees at zoom 17; here it is in screen pixels, with the position read back as the
// ground place (`unproject` is the identity), so the same cases read the same way.
import { describe, expect, it } from 'bun:test'
import { midpointFeatures, type Segment } from './midpoints'

const VIEW = { width: 200, height: 200 }
const identity = (p: { x: number; y: number }) => [p.x, p.y] as [number, number]

function segment(a: [number, number], b: [number, number]): Segment {
  return {
    edge: ['n1', 'n2'],
    a: { x: a[0], y: a[1] },
    b: { x: b[0], y: b[1] },
  }
}

describe('iD.svgMidpoints', () => {
  it('creates midpoint on segment completely within the extent', () => {
    const features = midpointFeatures([segment([10, 50], [110, 50])], VIEW, identity)
    expect(features.map((f) => f.geometry.coordinates)).toEqual([[60, 50]])
  })

  it("doesn't create midpoint on segment with pixel length less than 40", () => {
    expect(midpointFeatures([segment([10, 50], [30, 50])], VIEW, identity)).toHaveLength(0)
    // iD's rule is "longer than 40": a segment of exactly 40 pixels gets none
    expect(midpointFeatures([segment([10, 50], [50, 50])], VIEW, identity)).toHaveLength(0)
  })

  it("doesn't create midpoint on segment completely outside of the extent", () => {
    expect(midpointFeatures([segment([-300, 50], [-150, 50])], VIEW, identity)).toHaveLength(0)
  })

  // Maid puts no handle on the edge of the view for a segment that leaves it (see midpoints.ts):
  // the two cases below are iD's and are not covered by this computation.
  it.todo('creates midpoint on extent edge for segment partially outside of the extent', () => {})
  it.todo("doesn't create midpoint on extent edge for segment with pixel length less than 20", () => {})
})
