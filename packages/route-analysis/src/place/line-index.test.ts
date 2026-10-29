import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import type { Chain, LonLat, RouteInput } from '../types.ts'
import { lineIndex, travelNodes } from './line-index.ts'
import { makeChain, makeInput, member, row } from './test-helpers.ts'

const START: LonLat = [13, 52]
/** Degrees of latitude that are about 10 metres */
const TEN_M_LAT = 10 / 111195

/** A chain of one step along the closed way `ring`, from `from` to `to` */
function ringChain(from: string, to: string, reversed: boolean): Chain {
  const step = { index: 0, wayId: 'ring', reversed, from, to, length: 0, at: 0 }
  return {
    pieces: [{ steps: [step], at: 0, length: 0, parallel: [] }],
    linear: 'yes',
    gaps: [],
    length: 0,
    sortedOrder: [],
  }
}

/** Five nodes in a row, ways n0-n1, n1-n2-n3, n3-n4 */
function rowInput(): RouteInput {
  const r = row('n', 5, START, 0.001)
  return makeInput({
    members: [member('way', 'w0'), member('way', 'w1'), member('way', 'w2')],
    ways: { w0: ['n0', 'n1'], w1: ['n1', 'n2', 'n3'], w2: ['n3', 'n4'] },
    nodes: r.pos,
  })
}

describe('lineIndex atOfNode', () => {
  it('gives every node its metres along the line, in travel order', () => {
    const input = rowInput()
    const chain = makeChain(input, [[0, 1, 2]])
    const index = lineIndex(input, chain)
    const d = distance(START, [START[0] + 0.001, START[1]])
    for (let k = 0; k < 5; k++) {
      expect(index.atOfNode.get(`n${k}`)).toBeCloseTo(k * d, 2)
    }
    expect(index.atOfNode.size).toBe(5)
  })

  it('runs a reversed step from its first node to its last', () => {
    const input = makeInput({
      members: [member('way', 'w0'), member('way', 'w1')],
      ways: { w0: ['n0', 'n1'], w1: ['n2', 'n1'] },
      nodes: { n0: START, n1: [13.001, 52], n2: [13.002, 52] },
    })
    const chain = makeChain(input, [[0, { index: 1, reversed: true }]])
    const index = lineIndex(input, chain)
    const d = distance(START, [13.001, 52])
    expect(index.atOfNode.get('n1')).toBeCloseTo(d, 2)
    expect(index.atOfNode.get('n2')).toBeCloseTo(2 * d, 2)
  })

  it('walks a closed way along the arc from the first node to the last', () => {
    const a: LonLat = [13, 52]
    const b: LonLat = [13.001, 52]
    const c: LonLat = [13.001, 52.001]
    const d: LonLat = [13, 52.001]
    const input = makeInput({
      members: [member('way', 'ring')],
      ways: { ring: ['a', 'b', 'c', 'd', 'a'] },
      nodes: { a, b, c, d },
    })
    // forward from a to c: the arc a, b, c; d is not on the line
    const forward = lineIndex(input, ringChain('a', 'c', false))
    expect(forward.atOfNode.has('d')).toBe(false)
    expect(forward.atOfNode.get('b')).toBeCloseTo(distance(a, b), 2)
    expect(forward.atOfNode.get('c')).toBeCloseTo(distance(a, b) + distance(b, c), 2)

    // reversed from a to c: the arc a, d, c; b is not on the line
    const backward = lineIndex(input, ringChain('a', 'c', true))
    expect(backward.atOfNode.has('b')).toBe(false)
    expect(backward.atOfNode.get('d')).toBeCloseTo(distance(a, d), 2)
    expect(backward.atOfNode.get('c')).toBeCloseTo(distance(a, d) + distance(d, c), 2)
  })

  it('keeps the first place of a node that is used twice (out and back)', () => {
    const a: LonLat = [13, 52]
    const b: LonLat = [13.001, 52]
    const c: LonLat = [13.002, 52]
    const input = makeInput({
      members: [member('way', 'w0'), member('way', 'w1'), member('way', 'w2')],
      ways: { w0: ['a', 'b'], w1: ['b', 'c'], w2: ['b', 'c'] },
      nodes: { a, b, c },
    })
    const chain = makeChain(input, [[0, 1, { index: 2, reversed: true }]])
    const index = lineIndex(input, chain)
    expect(index.atOfNode.get('b')).toBeCloseTo(distance(a, b), 2)
    expect(index.atOfNode.get('c')).toBeCloseTo(distance(a, b) + distance(b, c), 2)
  })

  it('places the second piece after a gap at the gap, not after it', () => {
    const input = makeInput({
      members: [member('way', 'w0'), member('way', 'w1')],
      ways: { w0: ['n0', 'n1'], w1: ['n5', 'n6'] },
      nodes: { ...row('n', 2, START, 0.001).pos, n5: [13.01, 52], n6: [13.011, 52] },
    })
    const chain = makeChain(input, [[0], [1]], 'no')
    const index = lineIndex(input, chain)
    expect(index.atOfNode.get('n5')).toBeCloseTo(distance(START, [13.001, 52]), 2)
  })
})

describe('lineIndex nearest', () => {
  it('finds the point of the line nearest to a query, with its offset and piece', () => {
    const input = rowInput()
    const index = lineIndex(input, makeChain(input, [[0, 1, 2]]))
    const d = distance(START, [START[0] + 0.001, START[1]])
    // 10 m north of the middle of the way n1-n2
    const hit = index.nearest([START[0] + 0.0015, START[1] + TEN_M_LAT], 50)
    expect(hit).toBeDefined()
    expect(hit?.piece).toBe(0)
    expect(hit?.offset ?? NaN).toBeCloseTo(10, 0)
    expect(hit?.at ?? NaN).toBeCloseTo(1.5 * d, 0)
  })

  it("finds the line east of a point far north of the line's middle (the grid is cut at the mean latitude)", () => {
    const input = makeInput({
      members: [member('way', 'w0'), member('way', 'w1')],
      ways: { w0: ['s', 'm'], w1: ['m', 'n'] },
      nodes: { s: [10, 40], m: [10, 50], n: [10, 60] },
    })
    const index = lineIndex(input, makeChain(input, [[0, 1]]))
    // 1.5 km east of the line at 60°N: about 0.027 degrees of longitude there
    const east = 1500 / distance([10, 60], [11, 60])
    const hit = index.nearest([10 + east, 60], 2000)
    expect(hit?.offset ?? NaN).toBeCloseTo(1500, -1)
  })

  it('returns undefined when nothing is within the radius', () => {
    const input = rowInput()
    const index = lineIndex(input, makeChain(input, [[0, 1, 2]]))
    expect(index.nearest([START[0] + 0.002, START[1] + 0.03], 2000)).toBeUndefined()
    expect(index.nearest([START[0] + 0.002, START[1] + TEN_M_LAT], 5)).toBeUndefined()
  })

  it('reports the piece of the nearest segment when a gap separates two pieces', () => {
    const input = makeInput({
      members: [member('way', 'w0'), member('way', 'w1')],
      ways: { w0: ['n0', 'n1'], w1: ['n5', 'n6'] },
      nodes: { ...row('n', 2, START, 0.001).pos, n5: [13.01, 52], n6: [13.011, 52] },
    })
    const index = lineIndex(input, makeChain(input, [[0], [1]], 'no'))
    expect(index.nearest([13.0105, 52 + TEN_M_LAT], 100)?.piece).toBe(1)
    expect(index.nearest([13.0005, 52 + TEN_M_LAT], 100)?.piece).toBe(0)
  })

  it('finds a long diagonal segment through many cells', () => {
    const input = makeInput({
      members: [member('way', 'w0')],
      ways: { w0: ['a', 'b'] },
      nodes: { a: [13, 52], b: [13.05, 52.05] },
    })
    const index = lineIndex(input, makeChain(input, [[0]]))
    // a point 5 m off the diagonal, near its middle
    const hit = index.nearest([13.025, 52.025 + 5 / 111195 + 0.00002], 30)
    expect(hit?.offset ?? NaN).toBeLessThan(10)
    expect(hit?.at ?? NaN).toBeGreaterThan(0)
  })

  it('handles a line of 20,000 ways with 1,000 queries under 500 ms', () => {
    const ways = 20_000
    const nodes: Record<string, LonLat> = {}
    const wayNodes: Record<string, string[]> = {}
    const members = []
    // one node per 50 m, three nodes per way: a line about 1,000 km long
    const dLon = 0.00075
    for (let k = 0; k < ways * 2 + 1; k++) nodes[`n${k}`] = [START[0] + k * dLon, START[1]]
    for (let w = 0; w < ways; w++) {
      wayNodes[`w${w}`] = [`n${2 * w}`, `n${2 * w + 1}`, `n${2 * w + 2}`]
      members.push(member('way', `w${w}`))
    }
    const input = makeInput({ members, ways: wayNodes, nodes })
    const chain = makeChain(input, [members.map((_, i) => i)])

    const t0 = performance.now()
    const index = lineIndex(input, chain)
    const built = performance.now() - t0

    // 1,000 pseudo-random points, about 20 m off the line, from a fixed seed
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const queries: LonLat[] = []
    for (let q = 0; q < 1000; q++) {
      const x = START[0] + random() * (ways * 2 * dLon)
      queries.push([x, START[1] + 20 / 111195])
    }
    const t1 = performance.now()
    let found = 0
    for (const q of queries) {
      const hit = index.nearest(q, 2000)
      if (hit && Math.abs(hit.offset - 20) < 1) found++
    }
    const queried = performance.now() - t1
    console.log(
      `nearest: ${ways} ways, 1000 queries in ${queried.toFixed(1)} ms (index built in ${built.toFixed(1)} ms, ${found} hits)`,
    )
    expect(found).toBe(1000)
    expect(queried).toBeLessThan(500)
  })
})

describe('travelNodes', () => {
  it('reverses an open way for a reversed step', () => {
    const step = { index: 0, wayId: 'w', reversed: true, from: 'c', to: 'a', length: 0, at: 0 }
    expect(travelNodes(['a', 'b', 'c'], step)).toEqual(['c', 'b', 'a'])
  })
})
