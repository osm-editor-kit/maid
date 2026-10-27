import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import { classifyMembers } from '../roles.ts'
import type { AnalysisOptions, LonLat, RouteInput, RouteMember } from '../types.ts'
import { lineIndex } from './line-index.ts'
import { placePoints } from './points.ts'
import { makeChain, makeInput, member, row } from './test-helpers.ts'

const OPTIONS: AnalysisOptions = {}
const START: LonLat = [13, 52]
/** Degrees that are about 5 metres of latitude, and about 3.4 metres of longitude at latitude 52 */
const FIVE_M_LAT = 5 / 111195
const SMALL_LON = 0.00005

/** Ways w0..w3 along a row n0..n4, all main ways; `extra` adds nodes and members to it */
function mainRow(
  members: RouteMember[],
  extraNodes: Record<string, LonLat> = {},
  extraWays: Record<string, string[]> = {},
  tags?: Record<string, string>,
): RouteInput {
  const r = row('n', 5, START, 0.001)
  return makeInput({
    tags,
    members: [
      member('way', 'w0'),
      member('way', 'w1'),
      member('way', 'w2'),
      member('way', 'w3'),
      ...members,
    ],
    ways: {
      w0: ['n0', 'n1'],
      w1: ['n1', 'n2'],
      w2: ['n2', 'n3'],
      w3: ['n3', 'n4'],
      ...extraWays,
    },
    nodes: { ...r.pos, ...extraNodes },
  })
}

/** Places the points of an input whose first four members are the main line */
function placed(input: RouteInput, linear: 'yes' | 'no' | 'sorted' = 'yes') {
  const infos = classifyMembers(input)
  const chain = makeChain(input, [[0, 1, 2, 3]], linear)
  const index = lineIndex(input, chain)
  return placePoints(input, infos, chain, index, OPTIONS)
}

describe('placePoints', () => {
  it('places stops and points at their node, and leaves relations and unloaded members out', () => {
    const input = mainRow(
      [
        member('node', 'n1', 'stop'),
        member('node', 'g1', 'guidepost'),
        member('relation', 'r9', 'subroute'),
        member('node', 'missing', 'stop'),
      ],
      { g1: [START[0] + 0.002, START[1] + FIVE_M_LAT] },
      {},
      { type: 'route', route: 'bus' },
    )
    const points = placed(input)
    expect(points.map((p) => p.index)).toEqual([4, 5])
    const stop = points[0]
    expect(stop?.loc).toEqual([START[0] + 0.001, START[1]])
    expect(stop?.offset ?? NaN).toBeCloseTo(0, 1)
    expect(stop?.piece).toBe(0)
    const guidepost = points[1]
    expect(guidepost?.offset ?? NaN).toBeCloseTo(5, 0)
    // n2 lies two steps of 0.001 degrees from the start
    expect(guidepost?.at ?? NaN).toBeCloseTo(2 * distance(START, [START[0] + 0.001, START[1]]), 0)
  })

  it('places a platform way at the average of its nodes', () => {
    const input = mainRow(
      [member('way', 'p1', 'platform')],
      {
        p0: [START[0] + 0.0005, START[1] + FIVE_M_LAT],
        p1: [START[0] + 0.0015, START[1] + FIVE_M_LAT],
      },
      { p1: ['p0', 'p1'] },
      { type: 'route', route: 'bus' },
    )
    const platform = placed(input)[0]
    expect(platform?.loc?.[0] ?? NaN).toBeCloseTo(START[0] + 0.001, 6)
    expect(platform?.loc?.[1] ?? NaN).toBeCloseTo(START[1] + FIVE_M_LAT, 6)
    expect(platform?.offset ?? NaN).toBeCloseTo(5, 0)
  })

  it('leaves at, offset and piece undefined when nothing is within 2 km', () => {
    const input = mainRow(
      [member('node', 'far', 'stop')],
      { far: [START[0], START[1] + 0.05] },
      {},
      {
        type: 'route',
        route: 'bus',
      },
    )
    const point = placed(input)[0]
    expect(point?.loc).toEqual([START[0], START[1] + 0.05])
    expect(point?.at).toBeUndefined()
    expect(point?.offset).toBeUndefined()
    expect(point?.piece).toBeUndefined()
    expect(point?.outOfSequence).toBe(false)
  })

  it('marks a stop that comes earlier on the line than the one before it, when the line is in sequence', () => {
    const input = mainRow(
      [member('node', 'n3', 'stop'), member('node', 'n1', 'stop'), member('node', 'n4', 'stop')],
      {},
      {},
      { type: 'route', route: 'bus' },
    )
    const points = placed(input)
    expect(points.map((p) => p.outOfSequence)).toEqual([false, true, false])
    // the same line with no linear join: nothing is out of sequence
    expect(placed(input, 'no').map((p) => p.outOfSequence)).toEqual([false, false, false])
  })

  it('allows a stop up to 10 m before the one before it', () => {
    const input = mainRow(
      [member('node', 'n2', 'stop'), member('node', 'a', 'stop')],
      { a: [START[0] + 0.002 - SMALL_LON, START[1]] },
      {},
      { type: 'route', route: 'bus' },
    )
    expect(placed(input).map((p) => p.outOfSequence)).toEqual([false, false])
  })

  it('never marks a plain point as out of sequence', () => {
    const input = mainRow(
      [member('node', 'n3', 'stop'), member('node', 'n1', 'guidepost')],
      {},
      {},
      { type: 'route', route: 'bus' },
    )
    expect(placed(input).map((p) => p.outOfSequence)).toEqual([false, false])
  })
})
