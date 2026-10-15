import { describe, expect, test } from 'bun:test'
import { buildWayChain, DEFAULT_MAX_PER_SIDE, kindOf } from './chain.ts'
import { sceneOf, type TestWay } from './test-graph.ts'

const road = { highway: 'residential' }

/** z-a-b-c-d-e in a line: L0 [z,a], L1 [a,b], C [b,c] (the reference), R1 [c,d], R2 [d,e] */
const line: TestWay[] = [
  { id: 'L0', nodes: ['z', 'a'], tags: road },
  { id: 'L1', nodes: ['a', 'b'], tags: road },
  { id: 'C', nodes: ['b', 'c'], tags: road },
  { id: 'R1', nodes: ['c', 'd'], tags: road },
  { id: 'R2', nodes: ['d', 'e'], tags: road },
]

function ids(chain: ReturnType<typeof buildWayChain>): string[] {
  return chain?.ways.map((way) => way.id) ?? []
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort()
}

describe('buildWayChain: straight chains', () => {
  test('walks both ways from the reference, left to right in its direction', () => {
    const chain = buildWayChain(sceneOf(line), 'C', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['L0', 'L1', 'C', 'R1', 'R2'])
    expect(chain?.centerIndex).toBe(2)
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'end' })
    expect(chain?.junctions).toEqual([])
  })

  test('the limit per side cuts each side and says so', () => {
    const chain = buildWayChain(sceneOf(line), 'C', { maxPerSide: 1 })
    expect(ids(chain)).toEqual(['L1', 'C', 'R1'])
    expect(chain?.centerIndex).toBe(1)
    expect(chain?.stops).toEqual({ backward: 'limit', forward: 'limit' })
  })

  test('three ways per side by default', () => {
    expect(DEFAULT_MAX_PER_SIDE).toBe(3)
    const chain = buildWayChain(sceneOf(line), 'C')
    expect(ids(chain)).toEqual(['L0', 'L1', 'C', 'R1', 'R2'])
  })

  test('a lone way has no neighbours', () => {
    const chain = buildWayChain(sceneOf([{ id: 'only', nodes: ['p', 'q'], tags: road }]), 'only')
    expect(ids(chain)).toEqual(['only'])
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'end' })
  })

  test('the reference must be a loaded way', () => {
    const scene = sceneOf(line)
    expect(buildWayChain(scene, 'missing')).toBeUndefined()
    expect(buildWayChain(scene, 'b')).toBeUndefined()
  })
})

describe('buildWayChain: orientation', () => {
  test('a neighbour that points against the reference is reversed, the others are not', () => {
    const scene = sceneOf([
      { id: 'L0', nodes: ['z', 'a'], tags: road },
      { id: 'L1', nodes: ['b', 'a'], tags: road },
      { id: 'C', nodes: ['b', 'c'], tags: road },
      { id: 'R1', nodes: ['d', 'c'], tags: road },
    ])
    const chain = buildWayChain(scene, 'C', { maxPerSide: 3 })
    expect(chain?.ways).toEqual([
      { id: 'L0', reversed: false },
      { id: 'L1', reversed: true },
      { id: 'C', reversed: false },
      { id: 'R1', reversed: true },
    ])
  })

  test('a reversed reference neighbour is reversed on the other side as well', () => {
    const scene = sceneOf([
      { id: 'L1', nodes: ['a', 'b'], tags: road },
      { id: 'C', nodes: ['b', 'c'], tags: road },
      { id: 'R1', nodes: ['c', 'd'], tags: road },
      { id: 'R2', nodes: ['e', 'd'], tags: road },
    ])
    const chain = buildWayChain(scene, 'C', { maxPerSide: 3 })
    expect(chain?.ways.map((way) => [way.id, way.reversed])).toEqual([
      ['L1', false],
      ['C', false],
      ['R1', false],
      ['R2', true],
    ])
  })
})

describe('buildWayChain: junctions', () => {
  const tie: TestWay[] = [
    { id: 'C', nodes: ['b', 'c'], tags: road },
    { id: 'R1', nodes: ['c', 'd'], tags: road },
    { id: 'X', nodes: ['c', 'y'], tags: road },
  ]

  test('two ways of the same kind at a node are a tie: the walk stops and lists them', () => {
    const chain = buildWayChain(sceneOf(tie), 'C', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['C'])
    expect(chain?.stops.forward).toBe('junction')
    expect(chain?.junctions.length).toBe(1)
    const [junction] = chain?.junctions ?? []
    expect(junction?.direction).toBe('forward')
    expect(junction?.nodeId).toBe('c')
    expect(sorted(junction?.candidates ?? [])).toEqual(['R1', 'X'])
  })

  test('a choice continues the walk through the chosen way', () => {
    const chain = buildWayChain(sceneOf(tie), 'C', { maxPerSide: 3, choose: new Map([['c', 'X']]) })
    expect(ids(chain)).toEqual(['C', 'X'])
    expect(chain?.ways[1]?.reversed).toBe(false)
    expect(chain?.stops.forward).toBe('end')
    expect(chain?.junctions).toEqual([])
  })

  test('a choice that is not a candidate is ignored', () => {
    const chain = buildWayChain(sceneOf(tie), 'C', {
      maxPerSide: 3,
      choose: new Map([['c', 'nope']]),
    })
    expect(chain?.stops.forward).toBe('junction')
    expect(ids(chain)).toEqual(['C'])
  })

  test('a name breaks the tie', () => {
    const named: TestWay[] = [
      { id: 'C', nodes: ['b', 'c'], tags: { ...road, name: 'Mill Road' } },
      { id: 'R1', nodes: ['c', 'd'], tags: { ...road, name: 'Mill Road' } },
      { id: 'X', nodes: ['c', 'y'], tags: road },
    ]
    const chain = buildWayChain(sceneOf(named), 'C', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['C', 'R1'])
    expect(chain?.junctions).toEqual([])
  })

  test('a ref breaks the tie when no name does', () => {
    const reffed: TestWay[] = [
      { id: 'C', nodes: ['b', 'c'], tags: { ...road, ref: 'B 96' } },
      { id: 'R1', nodes: ['c', 'd'], tags: { ...road, ref: 'B 96' } },
      { id: 'X', nodes: ['c', 'y'], tags: { ...road, ref: 'B 97' } },
    ]
    expect(ids(buildWayChain(sceneOf(reffed), 'C', { maxPerSide: 3 }))).toEqual(['C', 'R1'])
  })

  test('the sameKind option decides which ways count as the same kind', () => {
    const chain = buildWayChain(sceneOf(tie), 'C', { maxPerSide: 3, sameKind: () => false })
    expect(chain?.stops.forward).toBe('junction')
  })
})

describe('buildWayChain: kinds and filters', () => {
  test('same kind is preferred, so a primary road beside a residential one is not taken', () => {
    const scene = sceneOf([
      { id: 'C', nodes: ['b', 'c'], tags: road },
      { id: 'R1', nodes: ['c', 'd'], tags: road },
      { id: 'P', nodes: ['c', 'y'], tags: { highway: 'primary' } },
    ])
    const chain = buildWayChain(scene, 'C', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['C', 'R1'])
    expect(chain?.junctions).toEqual([])
  })

  test('a road may change its class: with no way of the same kind, another kind continues the chain', () => {
    const scene = sceneOf([
      { id: 'C', nodes: ['b', 'c'], tags: { highway: 'primary' } },
      { id: 'R1', nodes: ['c', 'd'], tags: road },
    ])
    expect(ids(buildWayChain(scene, 'C', { maxPerSide: 3 }))).toEqual(['C', 'R1'])
  })

  test('a candidate filter keeps the other kinds out of the chain', () => {
    const scene = sceneOf([
      { id: 'C', nodes: ['b', 'c'], tags: road },
      { id: 'F', nodes: ['c', 'd'], tags: { highway: 'footway' } },
    ])
    const chain = buildWayChain(scene, 'C', {
      maxPerSide: 3,
      candidateFilter: (way) => way.tags.highway !== 'footway',
    })
    expect(ids(chain)).toEqual(['C'])
    expect(chain?.stops.forward).toBe('end')
  })

  test('the kind is the first kind key the way has', () => {
    expect(kindOf({ highway: 'residential', cycleway: 'lane' })).toBe('highway=residential')
    expect(kindOf({ cycleway: 'lane' })).toBe('cycleway=lane')
    expect(kindOf({ name: 'Mill' })).toBeUndefined()
  })
})

describe('buildWayChain: loops and missing data', () => {
  test('a loop of three ways is walked once: no way twice, and the walk ends', () => {
    const ring: TestWay[] = [
      { id: 'A', nodes: ['n1', 'n2'], tags: road },
      { id: 'B', nodes: ['n2', 'n3'], tags: road },
      { id: 'C', nodes: ['n3', 'n1'], tags: road },
    ]
    const chain = buildWayChain(sceneOf(ring), 'A', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['B', 'C', 'A'])
    expect(chain?.centerIndex).toBe(2)
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'end' })
  })

  test('a closed way with no neighbours is a chain of one', () => {
    const closed: TestWay[] = [{ id: 'R', nodes: ['n1', 'n2', 'n3', 'n1'], tags: road }]
    const chain = buildWayChain(sceneOf(closed), 'R', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['R'])
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'end' })
  })

  test('a node that is not loaded ends that side with unloaded and finds nothing there', () => {
    const chain = buildWayChain(sceneOf(line, { omit: ['c'] }), 'C', { maxPerSide: 3 })
    expect(ids(chain)).toEqual(['L0', 'L1', 'C'])
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'unloaded' })
  })
})
