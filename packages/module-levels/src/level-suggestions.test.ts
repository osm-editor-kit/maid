import { describe, expect, test } from 'bun:test'
import {
  inclineOf,
  isConnector,
  isRecommended,
  pointInPolygon,
  suggestLevels,
  withLevelsInView,
} from './level-suggestions.ts'

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

describe('withLevelsInView', () => {
  const levels: Record<string, number[]> = { w1: [0], w2: [-1, 0], w3: [2], n4: [] }
  const levelsOf = (id: string) => levels[id] ?? []
  test('lists every level in view with the edited level, highest first', () => {
    const edited = [{ value: '0', reasons: ['edited level'], ids: [] }]
    expect(
      withLevelsInView(edited, ['w1', 'w2', 'w3', 'n4', undefined], levelsOf).map((s) => s.value),
    ).toEqual(['2', '0', '-1'])
    expect(withLevelsInView([], ['w2'], levelsOf).map((s) => [s.value, s.reasons])).toEqual([
      ['0', ['in view']],
      ['-1', ['in view']],
    ])
  })
  test('lists the suggestions with the other levels in view, highest first; a list sorts by its first level', () => {
    const near = [
      { value: '-1', reasons: ['connected: 2 corridors'], ids: ['w2'] },
      { value: '0;1', reasons: ['inside: Treppenhaus'], ids: ['w9'] },
    ]
    expect(withLevelsInView(near, ['w2', 'w3'], levelsOf).map((s) => s.value)).toEqual([
      '2',
      '0;1',
      '0',
      '-1',
    ])
  })
  test('a level suggested by the surroundings is recommended, the edited level and the others in view are not', () => {
    expect(isRecommended({ value: '-1', reasons: ['connected: 2 corridors'], ids: ['w2'] })).toBe(
      true,
    )
    expect(isRecommended({ value: '2', reasons: ['in view'], ids: [] })).toBe(false)
    expect(isRecommended({ value: '0', reasons: ['edited level'], ids: [] })).toBe(false)
  })
})

describe('connectors between two levels', () => {
  const ways: Record<string, Record<string, string>> = {
    s1: { highway: 'steps' },
    k: { indoor: 'corridor' },
    c0: { indoor: 'corridor', level: '0' },
    c1: { indoor: 'corridor', level: '1' },
    c0b: { indoor: 'corridor', level: '0' },
  }
  /** s1 runs from n1 (corridor c0 on level 0) to n2 (corridor c1 on level 1); n3 is on level 0 too */
  const onNode: Record<string, string[]> = {
    n1: ['s1', 'k', 'c0'],
    n2: ['s1', 'k', 'c1'],
    n3: ['s1', 'c0b'],
  }
  const suggest = (id: string, nodeIds: string[], edited: number | null = null) =>
    suggestLevels({
      id,
      nodeIds,
      edited,
      waysOfNode: (node) => onNode[node] ?? [],
      tagsOf: (way) => ways[way],
      enclosing: [],
    })

  test('steps from level 0 to level 1 connect 0;1 and go up', () => {
    const pair = suggest('s1', ['n1', 'n2']).find((s) => s.value === '0;1')
    expect(pair?.reasons).toEqual(['connects 0 and 1'])
    expect(pair?.incline).toBe('up')
    expect(pair?.ids).toEqual(['c0', 'c1'])
  })

  test('the reversed steps connect 1 and 0 in that order and go down', () => {
    const pair = suggest('s1', ['n2', 'n1']).find((s) => s.value === '0;1')
    expect(pair?.reasons).toEqual(['connects 1 and 0'])
    expect(pair?.incline).toBe('down')
  })

  test('both ends on level 0 give no pair', () => {
    expect(suggest('s1', ['n1', 'n3']).map((s) => s.value)).not.toContain('0;1')
  })

  test('a corridor, which is not a connector, joins no levels', () => {
    expect(suggest('k', ['n1', 'n2']).map((s) => s.value)).not.toContain('0;1')
  })

  test('the pair comes right after the edited level and keeps its incline when a room gives the same levels', () => {
    const result = suggestLevels({
      id: 's1',
      nodeIds: ['n1', 'n2'],
      edited: 0,
      waysOfNode: (node) => onNode[node] ?? [],
      tagsOf: (way) => ways[way],
      enclosing: [{ id: 'r', value: '0;1', name: 'Treppenhaus' }],
    })
    expect(result.map((s) => s.value)).toEqual(['0', '0;1', '1'])
    const pair = result.find((s) => s.value === '0;1')
    expect(pair?.reasons).toEqual(['connects 0 and 1', 'inside: Treppenhaus'])
    expect(pair?.incline).toBe('up')
  })
})

describe('isConnector and inclineOf', () => {
  test('steps, conveying, ramp, incline on a footway or path, indoor and other stairs are connectors', () => {
    expect(isConnector({ highway: 'steps' })).toBe(true)
    expect(isConnector({ conveying: 'forward' })).toBe(true)
    expect(isConnector({ ramp: 'yes' })).toBe(true)
    expect(isConnector({ highway: 'footway', incline: 'up' })).toBe(true)
    expect(isConnector({ highway: 'path', incline: '10%' })).toBe(true)
    expect(isConnector({ indoor: 'stairs' })).toBe(true)
    expect(isConnector({ stairs: 'yes' })).toBe(true)
  })

  test('a corridor is not a connector, nor a footway without an incline or an incline on a road', () => {
    expect(isConnector({ indoor: 'corridor' })).toBe(false)
    expect(isConnector({ highway: 'footway' })).toBe(false)
    expect(isConnector({ highway: 'primary', incline: 'up' })).toBe(false)
  })

  test('the incline follows the way from the first level to the last', () => {
    expect(inclineOf(0, 1)).toBe('up')
    expect(inclineOf(-1, 0)).toBe('up')
    expect(inclineOf(1, 0)).toBe('down')
  })
})
