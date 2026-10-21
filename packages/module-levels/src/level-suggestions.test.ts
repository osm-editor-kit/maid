import { describe, expect, test } from 'bun:test'
import { pointInPolygon, suggestLevels } from './level-suggestions.ts'

const tagsById: Record<string, Record<string, string>> = {
  w1: {},
  w2: { indoor: 'corridor', level: '-1' },
  w3: { indoor: 'corridor', level: '-1' },
}

/** The feature w1 over n1, n2, n3; w2 shares n1 and w3 shares n3 */
const nodeWays = new Map<string, string[]>([
  ['n1', ['w1', 'w2']],
  ['n2', ['w1']],
  ['n3', ['w1', 'w3']],
])

const room = { id: 'w9', value: '0;1', name: 'Treppenhaus' }

describe('suggestLevels', () => {
  test('the edited level, the connected levels, then the room the feature is in', () => {
    const result = suggestLevels({
      id: 'w1',
      nodeIds: ['n1', 'n2', 'n3'],
      edited: 0,
      waysOfNode: (node) => nodeWays.get(node) ?? [],
      tagsOf: (id) => tagsById[id],
      enclosing: [room],
    })
    expect(result.map((s) => s.value)).toEqual(['0', '-1', '0;1'])
    expect(result.map((s) => s.reasons)).toEqual([
      ['edited level'],
      ['connected: 2 corridors'],
      ['inside: Treppenhaus'],
    ])
    expect(result.find((s) => s.value === '-1')?.ids).toEqual(['w2', 'w3'])
  })

  test('without an edited level the connected level comes first', () => {
    const result = suggestLevels({
      id: 'w1',
      nodeIds: ['n1', 'n2', 'n3'],
      edited: null,
      waysOfNode: (node) => nodeWays.get(node) ?? [],
      tagsOf: (id) => tagsById[id],
      enclosing: [],
    })
    expect(result[0]?.value).toBe('-1')
  })

  test('a room with the edited level merges into one suggestion with both reasons', () => {
    const result = suggestLevels({
      id: 'w1',
      nodeIds: ['n1', 'n2', 'n3'],
      edited: 0,
      waysOfNode: () => [],
      tagsOf: () => undefined,
      enclosing: [{ id: 'w9', value: '0', name: 'Treppenhaus' }],
    })
    expect(result).toEqual([
      { value: '0', reasons: ['edited level', 'inside: Treppenhaus'], ids: ['w9'] },
    ])
  })

  test('no neighbours: only the edited level', () => {
    const result = suggestLevels({
      id: 'n5',
      nodeIds: ['n5'],
      edited: -2,
      waysOfNode: () => [],
      tagsOf: () => undefined,
      enclosing: [],
    })
    expect(result).toEqual([{ value: '-2', reasons: ['edited level'], ids: [] }])
  })

  test('a way that shares two nodes counts once, and a single way is named in the singular', () => {
    const result = suggestLevels({
      id: 'w1',
      nodeIds: ['n1', 'n3'],
      edited: null,
      waysOfNode: (node) => (node === 'n1' || node === 'n3' ? ['w1', 'w2'] : []),
      tagsOf: (id) => tagsById[id],
      enclosing: [],
    })
    expect(result).toEqual([{ value: '-1', reasons: ['connected: 1 corridor'], ids: ['w2'] }])
  })

  test('steps and paths get their own names, and the more common kind of a level is used', () => {
    const tags: Record<string, Record<string, string>> = {
      s1: { highway: 'steps', level: '1' },
      p1: { highway: 'footway', level: '0' },
      p2: { highway: 'path', level: '0' },
    }
    const result = suggestLevels({
      id: 'f',
      nodeIds: ['a', 'b', 'c'],
      edited: null,
      waysOfNode: (node) => ({ a: ['s1'], b: ['p1'], c: ['p2'] })[node] ?? [],
      tagsOf: (id) => tags[id],
      enclosing: [],
    })
    expect(result.map((s) => s.reasons)).toEqual([['connected: 2 paths'], ['connected: 1 step']])
  })

  test('an empty value is skipped', () => {
    const result = suggestLevels({
      id: 'w1',
      nodeIds: [],
      edited: null,
      waysOfNode: () => [],
      tagsOf: () => undefined,
      enclosing: [{ id: 'w8', value: '', name: 'Nothing' }],
    })
    expect(result).toEqual([])
  })
})

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]

  test('a point inside the square', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
  })

  test('points outside the square', () => {
    expect(pointInPolygon([15, 5], square)).toBe(false)
    expect(pointInPolygon([-1, 5], square)).toBe(false)
    expect(pointInPolygon([5, -3], square)).toBe(false)
  })

  test('a ring that repeats its first point gives the same answer', () => {
    expect(pointInPolygon([5, 5], [...square, [0, 0]])).toBe(true)
    expect(pointInPolygon([15, 5], [...square, [0, 0]])).toBe(false)
  })
})
