// Tests of the segment index of crossing_ways: the cases where a box touches or a crossing sits on a
// vertex or a cell edge, and the rule against a brute force over generated ways.
import { describe, expect, it } from 'bun:test'
import { properIntersection } from '../geo.ts'
import type { Point } from '../geo.ts'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import type { Issue } from '../types.ts'
import { crossingWays } from './crossing-ways.ts'

type Node = [id: string, lon: number, lat: number]
type Way = [id: string, nodes: string[]]

const ROAD = { highway: 'residential' }

/** The issues of the rule over these highways, each way validated in turn */
function issuesOf(nodes: Node[], ways: Way[]): Issue[] {
  const entities = [
    ...nodes.map(([id, lon, lat]) => node(id, lon, lat)),
    ...ways.map(([id, ids]) => way(id, ids, ROAD)),
  ]
  return validateChanged(
    crossingWays,
    graphOf(...entities),
    ways.map(([id]) => id),
  )
}

/** A coordinate as the keys show it: nine decimals, so rounding noise does not change a key */
const fmt = (point: Point) =>
  `${Math.round(point[0] * 1e9) / 1e9},${Math.round(point[1] * 1e9) / 1e9}`

/** One key per issue: the validated way, the other way and the point, as the rule reports them */
function keysOf(issues: Issue[]) {
  return issues
    .map((issue) => `${issue.entityIds[0]}>${issue.entityIds[1]}@${fmt(issue.loc ?? [NaN, NaN])}`)
    .sort()
}

/** Every proper crossing of every ordered pair of ways, straight from the segments: the reference */
function bruteForce(nodes: Node[], ways: Way[]) {
  const loc = new Map<string, Point>(nodes.map(([id, lon, lat]) => [id, [lon, lat]]))
  const keys: string[] = []
  for (const [idA, nodesA] of ways) {
    for (const [idB, nodesB] of ways) {
      if (idA === idB) continue
      for (let i = 0; i + 1 < nodesA.length; i++) {
        for (let j = 0; j + 1 < nodesB.length; j++) {
          const a0 = nodesA[i]!
          const a1 = nodesA[i + 1]!
          const b0 = nodesB[j]!
          const b1 = nodesB[j + 1]!
          if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue
          const point = properIntersection(loc.get(a0)!, loc.get(a1)!, loc.get(b0)!, loc.get(b1)!)
          if (point) keys.push(`${idA}>${idB}@${fmt(point)}`)
        }
      }
    }
  }
  return keys.sort()
}

/** A deterministic generator: the same seed gives the same ways */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/**
 * Ways over a few nodes shared between them: the coordinates have four decimals, so cell edges,
 * collinear pieces and vertices on other segments all happen.
 */
function generated(seed: number, nodeCount: number, wayCount: number) {
  const next = random(seed)
  const nodes: Node[] = []
  for (let i = 0; i < nodeCount; i++) {
    nodes.push([`n${i}`, Math.round(next() * 300) / 10000, Math.round(next() * 300) / 10000])
  }
  const ways: Way[] = []
  for (let w = 0; w < wayCount; w++) {
    const size = 2 + Math.floor(next() * 4)
    const picked = new Set<string>()
    while (picked.size < size) picked.add(`n${Math.floor(next() * nodeCount)}`)
    ways.push([`w${w}`, [...picked]])
  }
  return { nodes, ways }
}

describe('crossing_ways segment index', () => {
  it('reports a crossing that sits exactly on a cell edge', () => {
    // The vertical way is on lon 0.002, a cell edge of the index; the crossing is at (0.002, 0.002)
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.004, 0.004],
        ['c', 0.002, 0],
        ['d', 0.002, 0.004],
      ],
      [
        ['w1', ['a', 'b']],
        ['w2', ['c', 'd']],
      ],
    )
    expect(keysOf(issues)).toEqual(['w1>w2@0.002,0.002', 'w2>w1@0.002,0.002'])
  })

  it('does not report segments whose boxes only touch at an edge', () => {
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.002, 0],
        ['c', 0.002, 0.001],
        ['d', 0.004, 0.001],
      ],
      [
        ['w1', ['a', 'b']],
        ['w2', ['c', 'd']],
      ],
    )
    expect(issues).toHaveLength(0)
  })

  it('does not report a T junction: a segment that ends on another way', () => {
    // The end node d of the second way lies inside the first way: it touches, it does not cross
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.004, 0],
        ['c', 0.002, 0.002],
        ['d', 0.002, 0],
      ],
      [
        ['w1', ['a', 'b']],
        ['w2', ['c', 'd']],
      ],
    )
    expect(issues).toHaveLength(0)
  })

  it('does not report collinear overlapping segments', () => {
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.004, 0],
        ['c', 0.002, 0],
        ['d', 0.006, 0],
      ],
      [
        ['w1', ['a', 'b']],
        ['w2', ['c', 'd']],
      ],
    )
    expect(issues).toHaveLength(0)
  })

  it('does not report a way that passes through the vertex of another', () => {
    // The apex of the first way lies on the second way: both of its segments meet there at an end
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.002, 0.002],
        ['c', 0.004, 0],
        ['d', 0, 0.002],
        ['e', 0.004, 0.002],
      ],
      [
        ['w1', ['a', 'b', 'c']],
        ['w2', ['d', 'e']],
      ],
    )
    expect(issues).toHaveLength(0)
  })

  it('reports the crossings of a way with a vertex at the crossing point of another segment', () => {
    // The first way crosses the horizontal one twice, in the middle of its two segments
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.002, 0.002],
        ['c', 0.004, 0],
        ['d', 0, 0.001],
        ['e', 0.004, 0.001],
      ],
      [
        ['w1', ['a', 'b', 'c']],
        ['w2', ['d', 'e']],
      ],
    )
    expect(keysOf(issues)).toEqual([
      'w1>w2@0.001,0.001',
      'w1>w2@0.003,0.001',
      'w2>w1@0.001,0.001',
      'w2>w1@0.003,0.001',
    ])
  })

  it('does not report ways that share a node, and reports the crossing that does not use it', () => {
    // The two ways share c: the segments at c never cross; the crossing of a-b with d-c is real
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.004, 0.004],
        ['c', 0.004, 0],
        ['d', 0, 0.004],
      ],
      [
        ['w1', ['a', 'b', 'c']],
        ['w2', ['d', 'c']],
      ],
    )
    expect(keysOf(issues)).toEqual(['w1>w2@0.002,0.002', 'w2>w1@0.002,0.002'])
  })

  it('finds a crossing with a long segment, which the index keeps apart from the cells', () => {
    const issues = issuesOf(
      [
        ['a', 0, 0],
        ['b', 0.03, 0.03],
        ['c', 0, 0.03],
        ['d', 0.03, 0],
        ['e', 0.0145, 0.0145],
        ['f', 0.0155, 0.0155],
      ],
      [
        ['w1', ['a', 'b']],
        ['w2', ['c', 'd']],
        ['w3', ['e', 'f']],
      ],
    )
    // w3 lies on the diagonal of w1 (no crossing with it) and crosses w2 at the same point
    expect(keysOf(issues)).toEqual([
      'w1>w2@0.015,0.015',
      'w2>w1@0.015,0.015',
      'w2>w3@0.015,0.015',
      'w3>w2@0.015,0.015',
    ])
  })

  it('gives the same crossings as a brute force over generated ways', () => {
    let crossings = 0
    for (const seed of [1, 7, 42, 2026, 99991]) {
      const { nodes, ways } = generated(seed, 40, 30)
      const expected = bruteForce(nodes, ways)
      crossings += expected.length
      expect(keysOf(issuesOf(nodes, ways))).toEqual(expected)
    }
    expect(crossings).toBeGreaterThan(0)
  })
})
