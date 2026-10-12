import { describe, expect, test } from 'bun:test'
import { chooseTarget, followEachOther, nearestOnPolyline, type SnapTarget } from './snap'

const line = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 100, y: 100 },
]

describe('nearestOnPolyline', () => {
  test('a point beside a segment snaps to the foot of the perpendicular, on that edge', () => {
    const on = nearestOnPolyline(line, { x: 40, y: 5 })
    expect(on).toEqual({ x: 40, y: 0, distance: 5, edge: ['a', 'b'] })
  })

  test('a point beside the second segment snaps to it', () => {
    const on = nearestOnPolyline(line, { x: 103, y: 60 })
    expect(on?.edge).toEqual(['b', 'c'])
    expect(on?.x).toBe(100)
    expect(on?.y).toBe(60)
  })

  test('a point past the end of a segment is clamped to its end', () => {
    const on = nearestOnPolyline(line, { x: -5, y: 3 })
    expect(on?.x).toBe(0)
    expect(on?.y).toBe(0)
  })

  test('a point farther than the tolerance snaps to nothing', () => {
    expect(nearestOnPolyline(line, { x: 40, y: 9 })).toBeUndefined()
    expect(nearestOnPolyline(line, { x: 40, y: 8 })).toBeDefined()
  })

  test('a line with one node has no segment', () => {
    expect(nearestOnPolyline([{ id: 'a', x: 0, y: 0 }], { x: 0, y: 0 })).toBeUndefined()
  })
})

describe('chooseTarget', () => {
  const node: SnapTarget = { type: 'node', id: 'n5', loc: [1, 2] }
  const wayNear: SnapTarget = {
    type: 'way',
    wayId: 'w1',
    loc: [1, 1],
    edge: ['n1', 'n2'],
    distance: 2,
  }
  const wayFar: SnapTarget = {
    type: 'way',
    wayId: 'w2',
    loc: [3, 3],
    edge: ['n3', 'n4'],
    distance: 6,
  }

  test('a node beats any way, however near the way is', () => {
    expect(chooseTarget([wayNear, node])).toBe(node)
  })

  test('among ways, the nearest one wins', () => {
    expect(chooseTarget([wayFar, wayNear])).toBe(wayNear)
  })

  test('nothing under the pointer gives no target', () => {
    expect(chooseTarget([])).toBeUndefined()
  })
})

describe('followEachOther', () => {
  test('two nodes next to each other in one way, either order', () => {
    expect(followEachOther([['n1', 'n2', 'n3']], 'n2', 'n3')).toBe(true)
    expect(followEachOther([['n1', 'n2', 'n3']], 'n3', 'n2')).toBe(true)
  })

  test('nodes that are only in the same way, not next to each other', () => {
    expect(followEachOther([['n1', 'n2', 'n3']], 'n1', 'n3')).toBe(false)
  })

  test('nodes in different ways', () => {
    expect(
      followEachOther(
        [
          ['n1', 'n2'],
          ['n2', 'n9'],
        ],
        'n1',
        'n9',
      ),
    ).toBe(false)
  })
})
