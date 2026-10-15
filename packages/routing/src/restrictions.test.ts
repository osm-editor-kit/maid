import { describe, expect, it } from 'bun:test'
import { findRoute } from './astar.ts'
import { buildRoutingGraph } from './graph.ts'
import { bicycleProfile, footProfile, type Profile } from './profile.ts'
import { buildRestrictions } from './restrictions.ts'
import { graphOf, node, relation, way } from './test-helpers.ts'

// A crossing at C. Coming from the south (way w1, S to C), a left turn is the way west (w2, C to W).
// Without the restriction the shortest route S to W turns at C. The bypass (w5, S to SWA to W) is
// longer, so it is taken only when the restriction applies.
const crossing = [
  node('S', 13.4, 52.499),
  node('C', 13.4, 52.5),
  node('W', 13.399, 52.5),
  node('N', 13.4, 52.501),
  node('E', 13.401, 52.5),
  node('SWA', 13.398, 52.499),
  way('w1', ['S', 'C'], { highway: 'residential' }),
  way('w2', ['C', 'W'], { highway: 'residential' }),
  way('w3', ['C', 'N'], { highway: 'residential' }),
  way('w4', ['C', 'E'], { highway: 'residential' }),
  way('w5', ['S', 'SWA', 'W'], { highway: 'residential' }),
]

function noLeftTurn(tags: Record<string, string> = {}) {
  return relation(
    'r1',
    [
      { id: 'w1', type: 'way', role: 'from' },
      { id: 'C', type: 'node', role: 'via' },
      { id: 'w2', type: 'way', role: 'to' },
    ],
    { type: 'restriction', restriction: 'no_left_turn', ...tags },
  )
}

function wayIds(result: ReturnType<typeof findRoute>): string[] {
  return result.ok ? result.segments.map((segment) => segment.wayId) : []
}

describe('turn restrictions', () => {
  it('without a restriction the route turns at the crossing', () => {
    const rg = buildRoutingGraph(graphOf(crossing), bicycleProfile)
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'W' }))).toEqual(['w1', 'w2'])
  })

  it('a no_left_turn restriction forces the bicycle onto the bypass', () => {
    const rg = buildRoutingGraph(graphOf([...crossing, noLeftTurn()]), bicycleProfile)
    expect(rg.restrictions.applied).toBe(1)
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'W' }))).toEqual(['w5'])
  })

  it('except=bicycle lifts the restriction for a bicycle', () => {
    const rg = buildRoutingGraph(
      graphOf([...crossing, noLeftTurn({ except: 'bicycle' })]),
      bicycleProfile,
    )
    expect(rg.restrictions.applied).toBe(0)
    expect(rg.restrictions.skipped.except).toBe(1)
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'W' }))).toEqual(['w1', 'w2'])
  })

  it('foot routes ignore restrictions', () => {
    const rg = buildRoutingGraph(graphOf([...crossing, noLeftTurn()]), footProfile)
    expect(rg.restrictions.applied).toBe(0)
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'W' }))).toEqual(['w1', 'w2'])
  })

  it('only_straight_on forbids every other exit from the way', () => {
    const rule = relation(
      'r2',
      [
        { id: 'w1', type: 'way', role: 'from' },
        { id: 'C', type: 'node', role: 'via' },
        { id: 'w3', type: 'way', role: 'to' },
      ],
      { type: 'restriction', restriction: 'only_straight_on' },
    )
    const rg = buildRoutingGraph(graphOf([...crossing, rule]), bicycleProfile)
    // From S the only way through C is north (w3); the route to W must take the bypass
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'W' }))).toEqual(['w5'])
    expect(wayIds(findRoute(rg, { node: 'S' }, { node: 'N' }))).toEqual(['w1', 'w3'])
  })

  it('a restriction with a via way is skipped and counted', () => {
    const rule = relation(
      'r3',
      [
        { id: 'w1', type: 'way', role: 'from' },
        { id: 'w3', type: 'way', role: 'via' },
        { id: 'w2', type: 'way', role: 'to' },
      ],
      { type: 'restriction', restriction: 'no_left_turn' },
    )
    const table = buildRestrictions(
      [rule],
      { node: () => undefined, way: () => 0 },
      { restrictions: true, exceptValue: 'bicycle' },
    )
    expect(table.skipped['via-way']).toBe(1)
    expect(table.applied).toBe(0)
  })

  it('a restriction whose members are not in the graph is skipped and counted', () => {
    const rg = buildRoutingGraph(
      graphOf([...crossing, noLeftTurn()].filter((e) => e.id !== 'w2')),
      bicycleProfile,
    )
    expect(rg.restrictions.applied).toBe(0)
    expect(rg.restrictions.skipped['not-in-graph']).toBe(1)
  })

  it('an unknown restriction kind is skipped', () => {
    const profile: Profile = bicycleProfile
    const rule = relation('r4', [{ id: 'w1', type: 'way', role: 'from' }], {
      type: 'restriction',
      restriction: 'maybe_turn',
    })
    const table = buildRestrictions([rule], { node: () => 0, way: () => 0 }, profile)
    expect(table.skipped['unknown-kind']).toBe(1)
  })
})
