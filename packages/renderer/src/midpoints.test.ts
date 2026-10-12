import { describe, expect, test } from 'bun:test'
import { midpointFeatures, midpointId, segmentsOf, type Segment } from './midpoints'

const VIEW = { width: 200, height: 200 }
const identity = (p: { x: number; y: number }) => [p.x, p.y] as [number, number]

describe('midpointId', () => {
  test('is the same for a segment walked in either direction', () => {
    expect(midpointId(['n5', 'n12'])).toBe(midpointId(['n12', 'n5']))
  })
})

describe('segmentsOf', () => {
  test('pairs consecutive nodes in the order of the way', () => {
    const nodes = [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 50, y: 0 },
      { id: 'n3', x: 50, y: 50 },
    ]
    expect(segmentsOf(nodes).map((s) => s.edge)).toEqual([
      ['n1', 'n2'],
      ['n2', 'n3'],
    ])
  })

  test('a closed way has its closing segment among them', () => {
    const square = [
      { id: 'n1', x: 0, y: 0 },
      { id: 'n2', x: 90, y: 0 },
      { id: 'n3', x: 90, y: 90 },
      { id: 'n1', x: 0, y: 0 },
    ]
    expect(segmentsOf(square)).toHaveLength(3)
  })
})

describe('midpointFeatures', () => {
  test('the handle of a segment that two selected ways share is one feature, with the first way order', () => {
    const forward: Segment = { edge: ['n1', 'n2'], a: { x: 0, y: 100 }, b: { x: 100, y: 100 } }
    const backward: Segment = { edge: ['n2', 'n1'], a: { x: 100, y: 100 }, b: { x: 0, y: 100 } }
    const features = midpointFeatures([forward, backward], VIEW, identity)
    expect(features).toHaveLength(1)
    expect(features[0]?.properties).toEqual({
      id: midpointId(['n1', 'n2']),
      state: 'midpoint',
      edge: ['n1', 'n2'],
    })
  })

  test('the handle is on the middle of the drawn line, as a ground place', () => {
    const features = midpointFeatures(
      [{ edge: ['n1', 'n2'], a: { x: 20, y: 40 }, b: { x: 120, y: 80 } }],
      VIEW,
      (p) => [p.x / 10, p.y / 10],
    )
    expect(features[0]?.geometry).toEqual({ type: 'Point', coordinates: [7, 6] })
  })

  test('a segment that is in view but whose middle is not gets no handle', () => {
    // from inside the right edge to far outside: the middle is at x = 299.5
    const features = midpointFeatures([segment([199, 50], [400, 50])], VIEW, identity)
    expect(features).toHaveLength(0)
  })

  test('of many segments of a long way, only those with their middle in view get a handle', () => {
    // 100 segments of 100 px from x = -5000 to 5000; the view is 200 px wide, so the middles at 50 and 150 are in it
    const nodes = Array.from({ length: 101 }, (_, i) => ({
      id: `n${i}`,
      x: -5000 + i * 100,
      y: 100,
    }))
    const features = midpointFeatures(segmentsOf(nodes), VIEW, identity)
    expect(features.map((f) => f.geometry.coordinates[0])).toEqual([50, 150])
  })

  test('nothing is built for no segments', () => {
    expect(midpointFeatures([], VIEW, identity)).toEqual([])
  })
})

function segment(a: [number, number], b: [number, number]): Segment {
  return { edge: ['n1', 'n2'], a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }
}
