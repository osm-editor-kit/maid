import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import { classifyMembers } from '../roles.ts'
import type { LonLat, RouteInput } from '../types.ts'
import { buildChain } from './chain.ts'

type WaySpec = { id: string; nodes: string[]; role?: string }

/** Node positions on a grid, 0.001 degrees apart: x east, y north. A node left out has no position. */
function grid(points: Record<string, [number, number]>): Map<string, LonLat> {
  return new Map(
    Object.entries(points).map(([id, [x, y]]): [string, LonLat] => [
      id,
      [10 + x * 0.001, 50 + y * 0.001],
    ]),
  )
}

/** The relation's input: members in the order given, one way each */
function routeOf(ways: WaySpec[], nodes: Map<string, LonLat>): RouteInput {
  return {
    tags: { type: 'route', route: 'hiking' },
    members: ways.map((way) => ({ type: 'way', id: way.id, role: way.role ?? '' })),
    ways: new Map(ways.map((way) => [way.id, way.nodes])),
    nodes,
  }
}

function chainOf(ways: WaySpec[], nodes: Map<string, LonLat>) {
  const input = routeOf(ways, nodes)
  return buildChain(input, classifyMembers(input))
}

/** Straight-line metres between two named nodes */
function metres(nodes: Map<string, LonLat>, a: string, b: string): number {
  const pa = nodes.get(a)
  const pb = nodes.get(b)
  if (!pa || !pb) throw new Error(`no position for ${a} or ${b}`)
  return distance(pa, pb)
}

/** Four nodes in a row, 0 to 3 */
const row = grid({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0] })

describe('buildChain', () => {
  it('a straight line of three ways is one piece in relation order', () => {
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['b', 'c'] },
      { id: 'w3', nodes: ['c', 'd'] },
    ]
    const chain = chainOf(ways, row)
    expect(chain.linear).toBe('yes')
    expect(chain.pieces.length).toBe(1)
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => [s.wayId, s.from, s.to, s.reversed])).toEqual([
      ['w1', 'a', 'b', false],
      ['w2', 'b', 'c', false],
      ['w3', 'c', 'd', false],
    ])
    const each = metres(row, 'a', 'b')
    expect(steps.map((s) => s.at)).toEqual([0, each, 2 * each].map((x) => expect.closeTo(x, 6)))
    expect(chain.length).toBeCloseTo(3 * each, 6)
    expect(chain.gaps).toEqual([])
    expect(chain.sortedOrder).toEqual([])
  })

  it('a way drawn backwards is entered at its end and reported as reversed', () => {
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['c', 'b'] },
    ]
    const chain = chainOf(ways, row)
    expect(chain.linear).toBe('yes')
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => [s.wayId, s.from, s.to, s.reversed])).toEqual([
      ['w1', 'a', 'b', false],
      ['w2', 'b', 'c', true],
    ])
    expect(steps[1]?.length).toBeCloseTo(metres(row, 'b', 'c'), 6)
  })

  it('a way alone with role backward runs against its drawing direction', () => {
    const chain = chainOf([{ id: 'w1', nodes: ['a', 'b'], role: 'backward' }], row)
    expect(chain.linear).toBe('yes')
    expect(chain.pieces[0]?.steps).toEqual([
      {
        index: 0,
        wayId: 'w1',
        reversed: true,
        from: 'b',
        to: 'a',
        length: metres(row, 'a', 'b'),
        at: 0,
      },
    ])
  })

  it('a roundabout is entered at one node and left at another, along its drawing direction', () => {
    const nodes = grid({
      a: [0, 0],
      r1: [1, 0],
      r2: [2, 0],
      r3: [2, 1],
      r4: [1, 1],
      b: [3, 1],
    })
    const ways = [
      { id: 'in', nodes: ['a', 'r1'] },
      { id: 'ring', nodes: ['r1', 'r2', 'r3', 'r4', 'r1'] },
      { id: 'out', nodes: ['r3', 'b'] },
    ]
    const chain = chainOf(ways, nodes)
    expect(chain.linear).toBe('yes')
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => [s.wayId, s.from, s.to, s.reversed])).toEqual([
      ['in', 'a', 'r1', false],
      ['ring', 'r1', 'r3', false],
      ['out', 'r3', 'b', false],
    ])
    // the arc from r1 to r3 is two of the four sides of the ring, not the whole ring
    const arc = metres(nodes, 'r1', 'r2') + metres(nodes, 'r2', 'r3')
    const ring = arc + metres(nodes, 'r3', 'r4') + metres(nodes, 'r4', 'r1')
    expect(steps[1]?.length).toBeCloseTo(arc, 6)
    expect(steps[1]?.length).toBeLessThan(ring)
    expect(steps[2]?.at).toBeCloseTo(metres(nodes, 'a', 'r1') + arc, 6)
  })

  it('a gap leaves two pieces in relation order, with the straight distance between the ends', () => {
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['c', 'd'] },
    ]
    const chain = chainOf(ways, row)
    expect(chain.linear).toBe('no')
    expect(chain.pieces.length).toBe(2)
    expect(chain.gaps.length).toBe(1)
    const gap = chain.gaps[0]
    expect(gap?.after).toBe(0)
    expect(gap?.from).toBe('b')
    expect(gap?.to).toBe('c')
    expect(gap?.distance).toBeCloseTo(metres(row, 'b', 'c'), 6)
    // gaps add nothing to the metres along the line
    expect(chain.pieces[1]?.at).toBeCloseTo(metres(row, 'a', 'b'), 6)
    expect(gap?.at).toBeCloseTo(metres(row, 'a', 'b'), 6)
    expect(chain.length).toBeCloseTo(metres(row, 'a', 'b') + metres(row, 'c', 'd'), 6)
  })

  it('members in a shuffled order that chain give one piece, sorted, with the order of the line', () => {
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['c', 'd'] },
      { id: 'w3', nodes: ['b', 'c'] },
    ]
    const chain = chainOf(ways, row)
    expect(chain.linear).toBe('sorted')
    expect(chain.pieces.length).toBe(1)
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => [s.wayId, s.from, s.to, s.reversed])).toEqual([
      ['w1', 'a', 'b', false],
      ['w3', 'b', 'c', false],
      ['w2', 'c', 'd', false],
    ])
    expect(chain.sortedOrder).toEqual([0, 2, 1])
    expect(chain.length).toBeCloseTo(3 * metres(row, 'a', 'b'), 6)
  })

  it('shuffled members with a real gap are not sorted', () => {
    const nodes = grid({ a: [0, 0], b: [1, 0], c: [2, 0], e: [5, 0], f: [6, 0] })
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['e', 'f'] },
      { id: 'w3', nodes: ['b', 'c'] },
    ]
    const chain = chainOf(ways, nodes)
    expect(chain.linear).toBe('no')
    expect(chain.sortedOrder).toEqual([])
    expect(chain.pieces.map((p) => p.steps.map((s) => s.wayId))).toEqual([['w1'], ['w2'], ['w3']])
    expect(chain.gaps.map((g) => [g.after, g.from, g.to])).toEqual([
      [0, 'b', 'e'],
      [1, 'f', 'b'],
    ])
  })

  it('a one-way section with forward ways on both strands is one piece with a parallel strand', () => {
    const nodes = grid({ n1: [0, 0], n2: [1, 0], n3: [2, 0], n4: [2, 1], n5: [3, 1] })
    const ways = [
      { id: 'a', nodes: ['n1', 'n2'], role: 'forward' },
      { id: 'b', nodes: ['n2', 'n3'], role: 'forward' },
      // the other strand, drawn the other way: it does not continue b, but it touches n2
      { id: 'c', nodes: ['n4', 'n2'], role: 'forward' },
      { id: 'd', nodes: ['n3', 'n4'], role: 'forward' },
      { id: 'e', nodes: ['n4', 'n5'], role: 'forward' },
    ]
    const chain = chainOf(ways, nodes)
    expect(chain.linear).toBe('yes')
    expect(chain.pieces.length).toBe(1)
    const piece = chain.pieces[0]
    expect(piece?.steps.map((s) => s.wayId)).toEqual(['a', 'b', 'd', 'e'])
    expect(piece?.parallel).toEqual([2])
    const expected =
      metres(nodes, 'n1', 'n2') +
      metres(nodes, 'n2', 'n3') +
      metres(nodes, 'n3', 'n4') +
      metres(nodes, 'n4', 'n5')
    expect(chain.length).toBeCloseTo(expected, 6)
  })

  it('the same way later again is a normal step', () => {
    // a and b share both ends; the route goes a, b, then a again
    const nodes = grid({ n1: [0, 0], n2: [1, 0], n3: [1, 1] })
    const ways = [
      { id: 'a', nodes: ['n1', 'n2'] },
      { id: 'b', nodes: ['n2', 'n3', 'n1'] },
      { id: 'a', nodes: ['n1', 'n2'] },
    ]
    const chain = chainOf(ways, nodes)
    expect(chain.linear).toBe('yes')
    expect(chain.pieces.length).toBe(1)
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => [s.index, s.wayId, s.from, s.to])).toEqual([
      [0, 'a', 'n1', 'n2'],
      [1, 'b', 'n2', 'n1'],
      [2, 'a', 'n1', 'n2'],
    ])
  })

  it('a way listed twice in a row is skipped', () => {
    const ways = [
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w1', nodes: ['a', 'b'] },
      { id: 'w2', nodes: ['b', 'c'] },
    ]
    const chain = chainOf(ways, row)
    expect(chain.linear).toBe('yes')
    const steps = chain.pieces[0]?.steps ?? []
    expect(steps.map((s) => s.index)).toEqual([0, 2])
  })

  it('no loaded main way gives empty, with no pieces', () => {
    const input: RouteInput = {
      tags: { type: 'route' },
      members: [{ type: 'way', id: 'w9', role: '' }],
      ways: new Map(),
      nodes: row,
    }
    const chain = buildChain(input, classifyMembers(input))
    expect(chain).toEqual({ pieces: [], linear: 'empty', gaps: [], length: 0, sortedOrder: [] })
  })

  it('a node without a position adds no length and no gap distance', () => {
    // b has no position: both ways that meet there are zero metres, and so is the gap at x
    const nodes = grid({ a: [0, 0], c: [2, 0], d: [3, 0] })
    const joined = chainOf(
      [
        { id: 'w1', nodes: ['a', 'b'] },
        { id: 'w2', nodes: ['b', 'c'] },
      ],
      nodes,
    )
    expect(joined.linear).toBe('yes')
    expect(joined.length).toBe(0)
    const apart = chainOf(
      [
        { id: 'w1', nodes: ['a', 'b'] },
        { id: 'w2', nodes: ['x', 'd'] },
      ],
      grid({ a: [0, 0], b: [1, 0], d: [3, 0] }),
    )
    expect(apart.linear).toBe('no')
    expect(apart.gaps[0]?.distance).toBe(0)
  })

  it('20,000 ways of 10 nodes chain in well under 500 ms', () => {
    const count = 20_000
    const perWay = 10
    const positions = new Map<string, LonLat>()
    const ways: WaySpec[] = []
    for (let w = 0; w < count; w++) {
      const nodes: string[] = []
      for (let k = 0; k <= perWay - 1; k++) {
        const n = w * (perWay - 1) + k
        const id = `n${n}`
        nodes.push(id)
        positions.set(id, [10 + n * 0.00001, 50])
      }
      ways.push({ id: `w${w}`, nodes })
    }
    const input = routeOf(ways, positions)
    const members = classifyMembers(input)
    const started = performance.now()
    const chain = buildChain(input, members)
    const elapsed = performance.now() - started
    console.log(`buildChain, ${count} ways of ${perWay} nodes: ${elapsed.toFixed(1)} ms`)
    expect(chain.linear).toBe('yes')
    expect(chain.pieces[0]?.steps.length).toBe(count)
    expect(elapsed).toBeLessThan(500)
  })
})
