import { describe, expect, test } from 'bun:test'
import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
import { previewReroute, profileOfRoute, requestOf, type RoutePreview } from './route.ts'
import { graphOf, node, relation, way } from './test-graph.ts'

/** Road R: six nodes 68 m apart on lat 52.5. Cycleway C: from n2 to n5, 22 m north of the road, joined at both ends. */
function network(cyclewayTags: Record<string, string> = { highway: 'cycleway' }) {
  const nodes = Array.from({ length: 7 }, (_, i) => node(`n${i}`, 13.4 + i * 0.001, 52.5))
  const cycleNodes = [
    node('c1', 13.4025, 52.5002),
    node('c2', 13.4035, 52.5002),
    node('c3', 13.4045, 52.5002),
  ]
  const road = way('R', ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'], { highway: 'residential' })
  const cycleway = way('C', ['n2', 'c1', 'c2', 'c3', 'n5'], cyclewayTags)
  return { nodes: [...nodes, ...cycleNodes], ways: [road, cycleway] }
}

function routeGraph(
  members: string[],
  tags: Record<string, string> = { type: 'route', route: 'bicycle' },
) {
  const { nodes, ways } = network()
  const rel = relation(
    'Rel',
    members.map((id) => ({ id, type: 'way' as const, role: '' })),
    tags,
  )
  const graph = graphOf([...nodes, ...ways, rel])
  return { graph, rel: graph.hasEntity('Rel') as OsmRelation }
}

const START = { lon: 13.4015, lat: 52.5 } // on the road, between n1 and n2
const END = { lon: 13.4055, lat: 52.5 } // on the road, between n5 and n6

describe('the profile of a route relation', () => {
  test('bicycle and mtb use the bicycle profile, hiking and foot the foot profile', () => {
    expect(profileOfRoute({ type: 'route', route: 'bicycle' })?.name).toBe('bicycle')
    expect(profileOfRoute({ type: 'route', route: 'mtb' })?.name).toBe('bicycle')
    expect(profileOfRoute({ type: 'route', route: 'hiking' })?.name).toBe('foot')
    expect(profileOfRoute({ type: 'route', route: 'foot' })?.name).toBe('foot')
  })

  test('other relations and other route kinds have no profile', () => {
    expect(profileOfRoute({ route: 'bicycle' })).toBeUndefined()
    expect(profileOfRoute({ type: 'route', route: 'bus' })).toBeUndefined()
    expect(profileOfRoute({ type: 'route' })).toBeUndefined()
  })
})

describe('the preview of a reroute', () => {
  test('a route over the cycleway replaces the stretch of the road: the plan adds the cycleway and splits the road twice', () => {
    const { graph, rel } = routeGraph(['R'])
    const preview = previewReroute(graph, rel, {
      start: START,
      end: END,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.route?.ok).toBe(true)
    expect(preview.stretches).toEqual([{ from: 0, to: 0, reversed: false }])
    expect(preview.expectedIds).toEqual(['R'])
    expect(preview.plan?.ok).toBe(true)
    if (!preview.plan?.ok) return
    expect(preview.plan.addedMembers.map((member) => member.fromWayId)).toContain('C')
    expect(preview.plan.splitWays.length).toBe(2)
    expect(preview.oldLengthM).toBeGreaterThan(300)
    expect(requestOf(preview)?.expectedIds).toEqual(['R'])
  })

  test('a one-way cycleway that the route follows in its order is a forward member, with no question', () => {
    const { nodes, ways } = network({ highway: 'cycleway', oneway: 'yes' })
    const rel = relation('Rel', [{ id: 'R', type: 'way', role: '' }], {
      type: 'route',
      route: 'bicycle',
    })
    const graph: Graph = graphOf([...nodes, ...ways, rel])
    const preview = previewReroute(graph, graph.hasEntity('Rel') as OsmRelation, {
      start: START,
      end: END,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.plan?.ok).toBe(true)
    if (!preview.plan?.ok) return
    const cycle = preview.plan.addedMembers.find((member) => member.fromWayId === 'C')
    expect(cycle?.role).toBe('forward')
    // the cycleway itself is not asked about (the road's two pieces are, as the plan sees the road run twice)
    expect(preview.plan.rolesToAsk.filter((question) => question.wayId === 'C')).toEqual([])
  })

  test('a way the route cannot join is no path, and nothing is planned', () => {
    // an isolated way 90 m north of the road: the end snaps to it, and no shared node joins it to the road
    const isolated = way('D', ['d1', 'd2'], { highway: 'residential' })
    const { nodes, ways } = network()
    const rel = relation('Rel', [{ id: 'R', type: 'way', role: '' }], {
      type: 'route',
      route: 'bicycle',
    })
    const graph = graphOf([
      ...nodes,
      node('d1', 13.4055, 52.5008),
      node('d2', 13.4065, 52.5008),
      ...ways,
      isolated,
      rel,
    ])
    const preview = previewReroute(graph, graph.hasEntity('Rel') as OsmRelation, {
      start: START,
      end: { lon: 13.406, lat: 52.5008 },
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.end?.snap?.wayId).toBe('D')
    expect(preview.route?.ok).toBe(false)
    expect(preview.route && !preview.route.ok ? preview.route.reason : undefined).toBe('no-path')
    expect(preview.plan).toBeUndefined()
  })

  test('a point far from every routable way gives start-not-routable', () => {
    const { graph, rel } = routeGraph(['R'])
    const preview = previewReroute(graph, rel, {
      start: { lon: 13.5, lat: 52.5 },
      end: END,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.route).toEqual({ ok: false, reason: 'start-not-routable', expanded: 0 })
    expect(requestOf(preview)).toBeUndefined()
  })

  test('with only the start there is no route yet, and the start is snapped', () => {
    const { graph, rel } = routeGraph(['R'])
    const preview = previewReroute(graph, rel, {
      start: START,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.route).toBeUndefined()
    expect(preview.start?.snap?.wayId).toBe('R')
  })

  test('a stretch that occurs more than once is offered in each occurrence, and the chosen one is used', () => {
    const { graph, rel } = routeGraph(['R', 'R'])
    const first = previewReroute(graph, rel, {
      start: START,
      end: END,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(first.stretches).toEqual([
      { from: 0, to: 0, reversed: false },
      { from: 0, to: 1, reversed: false },
      { from: 1, to: 1, reversed: false },
    ])
    expect(first.stretch).toEqual({ from: 0, to: 0, reversed: false })
    const last = previewReroute(graph, rel, {
      start: START,
      end: END,
      occurrence: 2,
      roleChoices: {},
    }) as RoutePreview
    expect(last.stretch).toEqual({ from: 1, to: 1, reversed: false })
  })

  test('a relation the reroute does not work on has no preview', () => {
    const { graph } = routeGraph(['R'], { type: 'route', route: 'bus' })
    expect(
      previewReroute(graph, graph.hasEntity('Rel') as OsmRelation, {
        occurrence: 0,
        roleChoices: {},
      }),
    ).toBeUndefined()
  })
})
