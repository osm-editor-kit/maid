import { describe, expect, it } from 'bun:test'
import { classifyMembers } from '../roles.ts'
import type { AnalysisOptions, LonLat, RouteInput, RouteMember } from '../types.ts'
import { findJunctions } from './junctions.ts'
import { lineIndex } from './line-index.ts'
import { placePoints } from './points.ts'
import { makeChain, makeInput, member, row } from './test-helpers.ts'

const START: LonLat = [13, 52]
/** Degrees of latitude about 3 metres north of the line */
const THREE_M = 3 / 111195

/**
 * Runs the junction search on a main line of `count` nodes (ways w0.. between them, members in order) and the given
 * extra members, with the points placed first.
 */
function run(input: RouteInput, options: AnalysisOptions = {}, mainWays: number) {
  const infos = classifyMembers(input)
  const chain = makeChain(input, [Array.from({ length: mainWays }, (_, i) => i)])
  const index = lineIndex(input, chain)
  const points = placePoints(input, infos, chain, index, {})
  return findJunctions(input, infos, chain, index, points, options)
}

/** Four main ways over five nodes n0..n4, and the given members, nodes and outside counts */
function lineWith(
  extra: RouteMember[],
  extraNodes: Record<string, LonLat>,
  outsideWays?: Record<string, number>,
): RouteInput {
  const r = row('n', 5, START, 0.001)
  return makeInput({
    members: [
      member('way', 'w0'),
      member('way', 'w1'),
      member('way', 'w2'),
      member('way', 'w3'),
      ...extra,
    ],
    ways: { w0: ['n0', 'n1'], w1: ['n1', 'n2'], w2: ['n2', 'n3'], w3: ['n3', 'n4'] },
    nodes: { ...r.pos, ...extraNodes },
    outsideWays,
  })
}

describe('findJunctions', () => {
  it('finds nothing without outsideWays', () => {
    expect(run(lineWith([], {}), {}, 4)).toEqual([])
  })

  it('lists the main-line nodes that other ways use, in order of at', () => {
    const input = lineWith([], {}, { n3: 2, n1: 1, n2: 0, n0: 5 })
    const junctions = run(input, {}, 4)
    expect(junctions.map((j) => j.node)).toEqual(['n0', 'n1', 'n3'])
    expect(junctions.map((j) => j.outside)).toEqual([5, 1, 2])
    const ats = junctions.map((j) => j.at)
    expect(ats).toEqual(ats.toSorted((a, b) => a - b))
    expect(junctions.every((j) => j.guidepost === undefined)).toBe(true)
  })

  it('names the nearest guidepost within the radius, and none beyond it', () => {
    const input = lineWith(
      [member('node', 'g1', 'guidepost'), member('node', 'g2', 'guidepost')],
      { g1: [START[0] + 0.001, START[1] + THREE_M], g2: [START[0] + 0.003, START[1] + 0.005] },
      { n1: 1, n3: 1 },
    )
    const junctions = run(input, {}, 4)
    // g1 (member 4) is 3 m from n1; g2 is about 550 m from n3
    expect(junctions.find((j) => j.node === 'n1')?.guidepost).toBe(4)
    expect(junctions.find((j) => j.node === 'n3')?.guidepost).toBeUndefined()
  })

  it('uses the guidepost radius from the options', () => {
    const input = lineWith(
      [member('node', 'g1', 'guidepost')],
      { g1: [START[0] + 0.001, START[1] + THREE_M] },
      { n1: 1 },
    )
    expect(run(input, { guidepostRadius: 2 }, 4)[0]?.guidepost).toBeUndefined()
    expect(run(input, { guidepostRadius: 5 }, 4)[0]?.guidepost).toBe(4)
  })

  it('handles 2,000 junctions and 1,000 guideposts in well under 500 ms', () => {
    const nodes = 2000
    const r = row('n', nodes, START, 0.001)
    const ways: Record<string, string[]> = {}
    const members: RouteMember[] = []
    const outside: Record<string, number> = {}
    const extraNodes: Record<string, LonLat> = {}
    for (let k = 0; k < nodes - 1; k++) {
      ways[`w${k}`] = [`n${k}`, `n${k + 1}`]
      members.push(member('way', `w${k}`))
    }
    for (let k = 0; k < nodes; k++) outside[`n${k}`] = 1
    for (let k = 0; k < nodes; k += 2) {
      members.push(member('node', `g${k}`, 'guidepost'))
      extraNodes[`g${k}`] = [START[0] + k * 0.001, START[1] + THREE_M]
    }
    const input = makeInput({
      members,
      ways,
      nodes: { ...r.pos, ...extraNodes },
      outsideWays: outside,
    })
    const infos = classifyMembers(input)
    const chain = makeChain(input, [Array.from({ length: nodes - 1 }, (_, i) => i)])
    const index = lineIndex(input, chain)
    const points = placePoints(input, infos, chain, index, {})

    const t0 = performance.now()
    const junctions = findJunctions(input, infos, chain, index, points, {})
    const elapsed = performance.now() - t0
    console.log(
      `findJunctions: ${junctions.length} junctions, 1000 guideposts in ${elapsed.toFixed(1)} ms`,
    )
    expect(junctions.length).toBe(nodes)
    // every even node has a guidepost 3 m away; the odd ones have none within 50 m of them
    const even = junctions.filter((j) => Number(j.node.slice(1)) % 2 === 0)
    expect(even.every((j) => j.guidepost !== undefined)).toBe(true)
    expect(elapsed).toBeLessThan(500)
  })
})
