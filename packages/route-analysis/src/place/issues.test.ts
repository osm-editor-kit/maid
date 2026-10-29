import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import { classifyMembers } from '../roles.ts'
import type {
  AnalysisOptions,
  Chain,
  LonLat,
  RouteInput,
  RouteIssue,
  RouteMember,
} from '../types.ts'
import { buildBranches } from './branches.ts'
import { collectIssues } from './issues.ts'
import { findJunctions } from './junctions.ts'
import { lineIndex } from './line-index.ts'
import { placePoints } from './points.ts'
import { makeChain, makeInput, member, row, type StepSpec } from './test-helpers.ts'

const START: LonLat = [13, 52]
/** Degrees of latitude about 3 m and 50 m north */
const THREE_M = 3 / 111195
const FIFTY_M = 50 / 111195

/** Main line n0..n4 in four ways w0..w3, then the given members, nodes, ways and tags */
function lineWith(spec: {
  extra?: RouteMember[]
  nodes?: Record<string, LonLat>
  ways?: Record<string, string[]>
  outside?: Record<string, number>
  tags?: Record<string, string>
  members?: RouteMember[]
}): RouteInput {
  const r = row('n', 5, START, 0.001)
  return makeInput({
    tags: spec.tags,
    members: spec.members ?? [
      member('way', 'w0'),
      member('way', 'w1'),
      member('way', 'w2'),
      member('way', 'w3'),
      ...(spec.extra ?? []),
    ],
    ways: { w0: ['n0', 'n1'], w1: ['n1', 'n2'], w2: ['n2', 'n3'], w3: ['n3', 'n4'], ...spec.ways },
    nodes: { ...r.pos, ...spec.nodes },
    outsideWays: spec.outside,
  })
}

/** All issues of an input, with the analysis run as the overview runs it */
function analyse(
  input: RouteInput,
  pieces: StepSpec[][] = [[0, 1, 2, 3]],
  linear: Chain['linear'] = 'yes',
  sortedOrder: number[] = [],
  options: AnalysisOptions = {},
): RouteIssue[] {
  const infos = classifyMembers(input)
  const chain = makeChain(input, pieces, linear, sortedOrder)
  const index = lineIndex(input, chain)
  const points = placePoints(input, infos, chain, index, options)
  const branches = buildBranches(input, infos, chain, index)
  const junctions = findJunctions(input, infos, chain, index, points, options)
  return collectIssues(input, infos, chain, points, branches, junctions, options)
}

const byCode = (issues: RouteIssue[], code: RouteIssue['code']) =>
  issues.filter((i) => i.code === code)

describe('collectIssues', () => {
  it('reports a gap between two pieces, with the ways on either side and the distance', () => {
    const input = lineWith({})
    const issues = analyse(input, [[0], [2, 3]], 'no')
    const gaps = byCode(issues, 'gap')
    expect(gaps.length).toBe(1)
    expect(gaps[0]?.severity).toBe('warning')
    expect(gaps[0]?.members).toEqual([0, 2])
    expect(gaps[0]?.detail).toEqual({
      distance: Math.round(distance(START, [START[0] + 0.001, START[1]])),
    })
    expect(gaps[0]?.at ?? NaN).toBeGreaterThan(0)
    expect(gaps[0]?.loc?.[0] ?? NaN).toBeCloseTo(START[0] + 0.0015, 6)
  })

  it('reports an order problem once when the ways join only in another order', () => {
    const input = lineWith({})
    const issues = analyse(input, [[0, 1, 2, 3]], 'sorted', [1, 0, 2, 3])
    const order = byCode(issues, 'order')
    expect(order.length).toBe(1)
    expect(order[0]?.members).toEqual([0, 1])
    expect(order[0]?.detail).toEqual({ moved: 2 })
  })

  it('compares the order over the ways the line has: the other strand of a one-way pair shifts nothing', () => {
    const input = lineWith({
      members: [
        member('way', 'w0'),
        member('way', 'w1', 'forward'),
        member('way', 'wb', 'backward'),
        member('way', 'w2'),
        member('way', 'w3'),
      ],
      ways: { wb: ['n2', 'n1'] },
    })
    // the line takes w0, w1, then w3 before w2: members 3 and 4 are swapped, the strand wb (2) is not on it
    const order = byCode(analyse(input, [[0, 1, 4, 3]], 'sorted', [0, 1, 4, 3]), 'order')
    expect(order[0]?.members).toEqual([3, 4])
    expect(order[0]?.detail).toEqual({ moved: 2 })
  })

  it('reports no order problem when the ways join in relation order', () => {
    const input = lineWith({})
    expect(byCode(analyse(input, [[0, 1, 2, 3]], 'yes'), 'order')).toEqual([])
  })

  it('reports members that are not loaded, once, with their count', () => {
    const input = lineWith({ extra: [member('way', 'missing1'), member('way', 'missing2')] })
    const issues = byCode(analyse(input), 'not-loaded')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([4, 5])
    expect(issues[0]?.detail).toEqual({ count: 2 })
    expect(issues[0]?.severity).toBe('info')
  })

  it('reports a point more than 30 m from the line, with its distance', () => {
    const input = lineWith({
      extra: [member('node', 'far', 'information'), member('node', 'near', 'information')],
      nodes: {
        far: [START[0] + 0.001, START[1] + FIFTY_M],
        near: [START[0] + 0.001, START[1] + THREE_M],
      },
    })
    const issues = byCode(analyse(input), 'point-far')
    expect(issues.map((i) => i.members)).toEqual([[4]])
    expect(issues[0]?.detail?.distance ?? NaN).toBeCloseTo(50, 0)
    expect(issues[0]?.loc).toEqual([START[0] + 0.001, START[1] + FIFTY_M])
    // with a wider radius it is not reported
    expect(
      byCode(analyse(input, undefined, undefined, undefined, { pointRadius: 60 }), 'point-far'),
    ).toEqual([])
  })

  it('reports a stop that comes earlier on the line than the one before it', () => {
    const input = lineWith({
      extra: [member('node', 'n3', 'stop'), member('node', 'n1', 'stop')],
      tags: { type: 'route', route: 'bus' },
    })
    const issues = byCode(analyse(input), 'out-of-sequence')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([5])
    // the stop at n1 lies on the line where n1 is
    expect(issues[0]?.at ?? NaN).toBeCloseTo(issuesAtN1(input), 1)
  })

  it('reports a junction without a guidepost on a waymarked route that lists guideposts', () => {
    const input = lineWith({
      extra: [member('node', 'g1', 'guidepost')],
      nodes: { g1: [START[0] + 0.001, START[1] + THREE_M] },
      outside: { n1: 1, n3: 2 },
      tags: { type: 'route', route: 'hiking' },
    })
    const issues = byCode(analyse(input), 'junction-without-guidepost')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([])
    expect(issues[0]?.detail).toEqual({ ways: 2 })
    expect(issues[0]?.loc).toEqual([START[0] + 0.003, START[1]])
  })

  it('does not report junctions on a route that is not waymarked', () => {
    const input = lineWith({
      extra: [member('node', 'g1', 'guidepost')],
      nodes: { g1: [START[0] + 0.001, START[1] + THREE_M] },
      outside: { n1: 1, n3: 2 },
      tags: { type: 'route', route: 'bus' },
    })
    expect(byCode(analyse(input), 'junction-without-guidepost')).toEqual([])
  })

  it('reports a waymarked route with junctions and no guidepost, once', () => {
    const input = lineWith({ outside: { n1: 1, n3: 2 }, tags: { type: 'route', route: 'bicycle' } })
    const issues = byCode(analyse(input), 'no-guideposts')
    expect(issues.length).toBe(1)
    expect(issues[0]?.severity).toBe('info')
    expect(issues[0]?.members).toEqual([])
    // no junctions, no hint
    expect(
      byCode(analyse(lineWith({ tags: { type: 'route', route: 'bicycle' } })), 'no-guideposts'),
    ).toEqual([])
  })

  it('reports each member whose role the overview does not know, with the role', () => {
    const input = lineWith({ extra: [member('node', 'n2', 'mystery')] })
    const issues = byCode(analyse(input), 'unknown-role')
    expect(issues.map((i) => i.detail?.role)).toEqual(['mystery'])
    expect(issues[0]?.members).toEqual([4])
  })

  it('reports a side line that touches the main line nowhere', () => {
    const input = lineWith({
      extra: [member('way', 'exc', 'excursion')],
      nodes: { y1: [START[0] + 0.001, START[1] + 0.01], y2: [START[0] + 0.002, START[1] + 0.01] },
      ways: { exc: ['y1', 'y2'] },
    })
    const issues = byCode(analyse(input), 'branch-detached')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([4])
  })

  it('reports the same member with the same role twice in a row', () => {
    const input = lineWith({ members: [...lineWith({}).members, member('way', 'w3')] })
    const issues = byCode(analyse(input), 'duplicate')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([3, 4])
  })

  it('reports an empty line when the relation lists main ways that are not loaded', () => {
    const input = makeInput({ members: [member('way', 'wX')], ways: {}, nodes: {} })
    const issues = byCode(analyse(input, [], 'empty'), 'empty')
    expect(issues.length).toBe(1)
    expect(issues[0]?.members).toEqual([0])
  })

  it('reports nothing for an empty line that lists only points', () => {
    const input = makeInput({ members: [member('node', 'n1', 'guidepost')], nodes: { n1: START } })
    expect(byCode(analyse(input, [], 'empty'), 'empty')).toEqual([])
  })

  it('sorts issues by at, with those that have no place last', () => {
    const input = lineWith({
      members: [
        member('way', 'w0'),
        member('way', 'w1'),
        member('way', 'w2'),
        member('way', 'w3'),
        member('way', 'missing'),
      ],
    })
    const issues = analyse(input, [[0], [2, 3]], 'sorted', [0, 2, 3])
    const ats = issues.map((i) => i.at)
    const placed = ats.filter((a): a is number => a !== undefined)
    expect(placed).toEqual([...placed].sort((a, b) => a - b))
    expect(ats.slice(placed.length).every((a) => a === undefined)).toBe(true)
    expect(issues.at(-1)?.code).toBe('not-loaded')
  })
})

/** The `at` of node n1 on the main line of `input` */
function issuesAtN1(input: RouteInput): number {
  const chain = makeChain(input, [[0, 1, 2, 3]])
  return lineIndex(input, chain).atOfNode.get('n1') ?? NaN
}
