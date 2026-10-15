import { describe, expect, it } from 'bun:test'
import { findRoute, type Endpoint } from './astar.ts'
import { haversine } from './geo.ts'
import { buildRoutingGraph, snapToGraph, type RoutingGraph } from './graph.ts'
import { bicycleProfile, footProfile, type Profile } from './profile.ts'
import { graphOf, node, row, way } from './test-helpers.ts'

function build(
  entities: Parameters<typeof graphOf>[0],
  profile: Profile = bicycleProfile,
): RoutingGraph {
  return buildRoutingGraph(graphOf(entities), profile)
}

/** A snap on a route endpoint, by coordinate */
function at(rg: RoutingGraph, lon: number, lat = 52.5): Endpoint {
  const snap = snapToGraph(rg, lon, lat)
  if (!snap) throw new Error(`no way at ${lon}`)
  return { snap }
}

const line = [...row(5), way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], { highway: 'residential' })]

describe('findRoute: plain paths', () => {
  it('follows a straight way between two nodes in one segment', () => {
    const rg = build(line)
    const result = findRoute(rg, { node: 'n1' }, { node: 'n5' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toMatchObject({
      wayId: 'w1',
      fromIndex: 0,
      toIndex: 4,
      forward: true,
    })
    expect(result.splits).toHaveLength(0)
    const expected = haversine(13.4, 52.5, 13.404, 52.5)
    expect(result.lengthM).toBeCloseTo(expected, 3)
    expect(result.cost).toBeCloseTo(expected, 3)
  })

  it('runs backward when the end comes first in the way', () => {
    const result = findRoute(build(line), { node: 'n5' }, { node: 'n1' })
    expect(result.ok && result.segments[0]).toMatchObject({
      fromIndex: 4,
      toIndex: 0,
      forward: false,
    })
  })

  it('reports no path between disconnected ways', () => {
    const rg = build([
      ...row(2),
      node('m1', 13.5, 52.5),
      node('m2', 13.501, 52.5),
      way('w1', ['n1', 'n2'], { highway: 'residential' }),
      way('w2', ['m1', 'm2'], { highway: 'residential' }),
    ])
    expect(findRoute(rg, { node: 'n1' }, { node: 'm2' })).toMatchObject({
      ok: false,
      reason: 'no-path',
    })
  })

  it('treats access=no as a wall', () => {
    const rg = build([
      ...row(5),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
      way('w2', ['n3', 'n4', 'n5'], { highway: 'residential', access: 'no' }),
    ])
    // n4 and n5 are only on the blocked way, so they are not in the graph at all
    expect(findRoute(rg, { node: 'n1' }, { node: 'n5' })).toMatchObject({
      ok: false,
      reason: 'end-not-routable',
    })
    expect(findRoute(rg, { node: 'n1' }, { node: 'n3' })).toMatchObject({ ok: true })
  })

  it('reports a start that is not in the graph', () => {
    expect(findRoute(build(line), { node: 'nope' }, { node: 'n5' })).toMatchObject({
      ok: false,
      reason: 'start-not-routable',
    })
  })

  it('a one-way is followed only in its direction for a bicycle, and not for a walker', () => {
    const entities = [
      ...row(5),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], { highway: 'residential', oneway: 'yes' }),
    ]
    const bike = build(entities)
    expect(findRoute(bike, { node: 'n5' }, { node: 'n1' })).toMatchObject({
      ok: false,
      reason: 'no-path',
    })
    expect(findRoute(bike, { node: 'n1' }, { node: 'n5' })).toMatchObject({ ok: true })
    const walk = build(entities, footProfile)
    expect(findRoute(walk, { node: 'n5' }, { node: 'n1' })).toMatchObject({ ok: true })
  })

  it('oneway:bicycle=no lets a bicycle go against a one-way', () => {
    const rg = build([
      ...row(5),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], {
        highway: 'residential',
        oneway: 'yes',
        'oneway:bicycle': 'no',
      }),
    ])
    const result = findRoute(rg, { node: 'n5' }, { node: 'n1' })
    expect(result.ok && result.segments[0]).toMatchObject({
      forward: false,
      fromIndex: 4,
      toIndex: 0,
    })
  })

  it('a cheaper way is preferred when it is longer by less than its factor', () => {
    // Direct way (residential, factor 1) against a longer cycleway (factor 0.7) between the same nodes
    const rg = build([
      node('a', 13.4, 52.5),
      node('b', 13.402, 52.5),
      node('m', 13.401, 52.5012),
      way('road', ['a', 'b'], { highway: 'primary' }),
      way('cyc', ['a', 'm', 'b'], { highway: 'cycleway' }),
    ])
    const result = findRoute(rg, { node: 'a' }, { node: 'b' })
    expect(result.ok && result.segments[0]?.wayId).toBe('cyc')
  })
})

describe('findRoute: points inside a way', () => {
  it('starts inside a segment and reports the split', () => {
    const rg = build(line)
    const result = findRoute(rg, at(rg, 13.4015), { node: 'n5' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.segments).toHaveLength(1)
    const [segment] = result.segments
    expect(segment?.startSplit).toMatchObject({ wayId: 'w1', segment: 1 })
    expect(segment?.startSplit?.t).toBeCloseTo(0.5, 2)
    expect(segment).toMatchObject({ fromIndex: 2, toIndex: 4, forward: true })
    expect(result.splits).toHaveLength(1)
  })

  it('ends inside a segment and reports the split', () => {
    const rg = build(line)
    const result = findRoute(rg, { node: 'n1' }, at(rg, 13.4015))
    expect(result.ok && result.segments[0]).toMatchObject({
      fromIndex: 0,
      toIndex: 1,
      forward: true,
    })
    expect(result.ok && result.segments[0]?.endSplit?.segment).toBe(1)
  })

  it('a route between two points on one segment is one stretch with both splits', () => {
    const rg = build(line)
    const result = findRoute(rg, at(rg, 13.4005), at(rg, 13.4035))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toMatchObject({ fromIndex: 1, toIndex: 3, forward: true })
    expect(result.segments[0]?.startSplit).toBeDefined()
    expect(result.segments[0]?.endSplit).toBeDefined()
    expect(result.splits).toHaveLength(2)
  })

  it('a start point on a way that is one-way the other way has no route', () => {
    const rg = build([
      ...row(5),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], { highway: 'residential', oneway: '-1' }),
    ])
    expect(findRoute(rg, at(rg, 13.4015), { node: 'n5' })).toMatchObject({
      ok: false,
      reason: 'no-path',
    })
    expect(findRoute(rg, at(rg, 13.4015), { node: 'n1' })).toMatchObject({ ok: true })
  })

  it('a point that is not near a routable way is an error at its end', () => {
    const rg = build(line)
    const result = findRoute(rg, { node: 'n1' }, { loc: [13.5, 52.5] })
    expect(result).toMatchObject({ ok: false, reason: 'end-not-routable' })
  })
})

describe('findRoute: search quality', () => {
  it('finds the same costs with and without the heuristic, for every pair on a grid', () => {
    const entities = []
    const id = (i: number, j: number) => `g${i}${j}`
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        entities.push(node(id(i, j), 13.4 + i * 0.001, 52.5 + j * 0.001))
      }
    }
    for (let j = 0; j < 4; j++) {
      const tags = { highway: j % 2 ? 'cycleway' : 'residential' }
      entities.push(
        way(
          `r${j}`,
          [0, 1, 2, 3].map((i) => id(i, j)),
          tags,
        ),
      )
    }
    for (let i = 0; i < 4; i++) {
      const tags = { highway: i % 2 ? 'track' : 'primary' }
      entities.push(
        way(
          `c${i}`,
          [0, 1, 2, 3].map((j) => id(i, j)),
          tags,
        ),
      )
    }
    const rg = build(entities)
    let pairs = 0
    for (const a of rg.nodeIds) {
      for (const b of rg.nodeIds) {
        if (a === b) continue
        const astar = findRoute(rg, { node: a }, { node: b })
        const dijkstra = findRoute(rg, { node: a }, { node: b }, { heuristic: false })
        expect(astar.ok).toBe(dijkstra.ok)
        if (astar.ok && dijkstra.ok) expect(astar.cost).toBeCloseTo(dijkstra.cost, 6)
        pairs++
      }
    }
    expect(pairs).toBe(16 * 15)
  })
})
