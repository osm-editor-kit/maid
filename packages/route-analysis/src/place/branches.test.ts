import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import { classifyMembers } from '../roles.ts'
import type { LonLat, RouteInput } from '../types.ts'
import { buildBranches } from './branches.ts'
import { lineIndex } from './line-index.ts'
import { makeChain, makeInput, member, row } from './test-helpers.ts'

const START: LonLat = [13, 52]
const NORTH = 0.0005

/** Main line n0..n4 in four ways w0..w3, then the given members and ways */
function input(
  extraMembers: ReturnType<typeof member>[],
  extraNodes: Record<string, LonLat>,
  extraWays: Record<string, string[]>,
): RouteInput {
  const r = row('n', 5, START, 0.001)
  return makeInput({
    members: [
      member('way', 'w0'),
      member('way', 'w1'),
      member('way', 'w2'),
      member('way', 'w3'),
      ...extraMembers,
    ],
    ways: { w0: ['n0', 'n1'], w1: ['n1', 'n2'], w2: ['n2', 'n3'], w3: ['n3', 'n4'], ...extraWays },
    nodes: { ...r.pos, ...extraNodes },
  })
}

/** Branches of an input, with the main line placed from the first four members */
function branchesOf(data: RouteInput) {
  const infos = classifyMembers(data)
  const chain = makeChain(data, [[0, 1, 2, 3]])
  return buildBranches(data, infos, chain, lineIndex(data, chain))
}

describe('buildBranches', () => {
  it('joins two ways of the same role that share an end node into one branch', () => {
    const x1: LonLat = [START[0] + 0.001, START[1] + NORTH]
    const x2: LonLat = [START[0] + 0.002, START[1] + NORTH]
    const data = input(
      [member('way', 'alt1', 'alternative'), member('way', 'alt2', 'alternative')],
      { x1, x2 },
      { alt1: ['n1', 'x1', 'x2'], alt2: ['x2', 'n3'] },
    )
    const branches = branchesOf(data)
    expect(branches.length).toBe(1)
    const b = branches[0]
    expect(b?.role).toBe('alternative')
    expect(b?.indexes).toEqual([4, 5])
    const expectedLength =
      distance([START[0] + 0.001, START[1]], x1) +
      distance(x1, x2) +
      distance(x2, [START[0] + 0.003, START[1]])
    expect(b?.length ?? NaN).toBeCloseTo(expectedLength, 1)
    // leaves at n1 (one step along) and rejoins at n3 (three steps along)
    const step = distance(START, [START[0] + 0.001, START[1]])
    expect(b?.from ?? NaN).toBeCloseTo(step, 1)
    expect(b?.to ?? NaN).toBeCloseTo(3 * step, 1)
  })

  it('leaves from and to undefined for a side line that touches the main line nowhere', () => {
    const data = input(
      [member('way', 'exc', 'excursion')],
      { y1: [START[0] + 0.001, START[1] + 0.01], y2: [START[0] + 0.002, START[1] + 0.01] },
      { exc: ['y1', 'y2'] },
    )
    const branches = branchesOf(data)
    expect(branches.length).toBe(1)
    expect(branches[0]?.from).toBeUndefined()
    expect(branches[0]?.to).toBeUndefined()
    expect(branches[0]?.length ?? 0).toBeGreaterThan(0)
  })

  it('keeps two same-role ways that share no end node as two branches', () => {
    const data = input(
      [member('way', 'alt1', 'alternative'), member('way', 'alt2', 'alternative')],
      {
        x1: [START[0] + 0.001, START[1] + NORTH],
        x2: [START[0] + 0.002, START[1] + NORTH],
        y1: [START[0] + 0.003, START[1] + NORTH],
        y2: [START[0] + 0.004, START[1] + NORTH],
      },
      { alt1: ['n1', 'x1', 'x2'], alt2: ['y1', 'y2'] },
    )
    const branches = branchesOf(data)
    expect(branches.map((b) => b.indexes)).toEqual([[4], [5]])
    expect(branches[1]?.from).toBeUndefined()
  })

  it('does not join ways of different roles even when they share an end node', () => {
    const data = input(
      [member('way', 'alt1', 'alternative'), member('way', 'conn', 'connection')],
      { x1: [START[0] + 0.001, START[1] + NORTH] },
      { alt1: ['n1', 'x1'], conn: ['x1', 'n2'] },
    )
    expect(branchesOf(data).map((b) => b.role)).toEqual(['alternative', 'connection'])
  })

  it('does not join branch ways that are separated by another member', () => {
    const data = input(
      [
        member('way', 'alt1', 'alternative'),
        member('node', 'g1', 'guidepost'),
        member('way', 'alt2', 'alternative'),
      ],
      { x1: [START[0] + 0.001, START[1] + NORTH], g1: [START[0], START[1] + NORTH] },
      { alt1: ['n1', 'x1'], alt2: ['x1', 'n2'] },
    )
    expect(branchesOf(data).length).toBe(2)
  })
})
