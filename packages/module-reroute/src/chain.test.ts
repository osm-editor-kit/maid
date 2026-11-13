import { describe, expect, test } from 'bun:test'
import { Graph, OsmRelation } from '@osm-editor-kit/maid-model'
import { editAt, editOfAnchor, routeChain } from './chain.ts'
import { previewReroute, type RoutePreview } from './route.ts'
import { graphOf, node, relation, way } from './test-graph.ts'

/**
 * Road R east along lat 52.5 (n0 to n6, 68 m apart), then S north from n6 (a right angle): the route [R, S]. Cycleway C
 * from n2 to n5, 22 m north of the road.
 */
function routeGraph(members = ['R', 'S']) {
  const nodes = Array.from({ length: 7 }, (_, i) => node(`n${i}`, 13.4 + i * 0.001, 52.5))
  const north = [node('s1', 13.406, 52.5007), node('s2', 13.406, 52.5014)]
  const cycle = [
    node('c1', 13.4025, 52.5002),
    node('c2', 13.4035, 52.5002),
    node('c3', 13.4045, 52.5002),
  ]
  const road = way('R', ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'], { highway: 'residential' })
  const side = way('S', ['n6', 's1', 's2'], { highway: 'residential' })
  const cycleway = way('C', ['n2', 'c1', 'c2', 'c3', 'n5'], { highway: 'cycleway' })
  const rel = relation(
    'Rel',
    members.map((id) => ({ id, type: 'way' as const, role: '' })),
    { type: 'route', route: 'bicycle' },
  )
  const graph = graphOf([...nodes, ...north, ...cycle, road, side, cycleway, rel])
  return { graph, rel: graph.hasEntity('Rel') as OsmRelation }
}

describe('the route as a line', () => {
  test('the ways in member order, joined at their shared node, support points at the ends and the turn', () => {
    const { graph, rel } = routeGraph()
    const chain = routeChain(graph, rel)
    expect(chain.points.map((point) => point.nodeId)).toEqual([
      'n0',
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
      's1',
      's2',
    ])
    expect(chain.points[6]).toMatchObject({ before: 0, after: 1 })
    expect(chain.anchors.map((k) => chain.points[k]!.nodeId)).toEqual(['n0', 'n6', 's2'])
  })

  test('a way stored against the travel direction is turned', () => {
    const { graph, rel } = routeGraph(['S', 'R'])
    const chain = routeChain(graph, rel)
    expect(chain.points[0]!.nodeId).toBe('s2')
    expect(chain.points.at(-1)!.nodeId).toBe('n0')
  })

  test('a press on the road is an edit between the support points around it', () => {
    const { graph, rel } = routeGraph()
    const edit = editAt(routeChain(graph, rel), 13.4035, 52.50001)!
    expect(edit.start).toMatchObject({ lon: 13.4, member: 0 })
    expect(edit.end).toMatchObject({ lon: 13.406, member: 0 })
    expect(edit.anchor).toBe(0)
  })

  test('the turn as a support point: an edit from the start to the end', () => {
    const { graph, rel } = routeGraph()
    const chain = routeChain(graph, rel)
    expect(editOfAnchor(chain, 1)).toMatchObject({ start: { member: 0 }, end: { member: 1 } })
    expect(editOfAnchor(chain, 0)).toBeUndefined()
  })

  test('the press dragged onto the cycleway: the route there, between the support points only', () => {
    const { graph, rel } = routeGraph()
    const edit = editAt(routeChain(graph, rel), 13.4035, 52.5)!
    const preview = previewReroute(graph, rel, {
      start: edit.start,
      end: edit.end,
      vias: [{ lon: 13.4035, lat: 52.5002 }],
      anchor: edit.anchor,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    expect(preview.stretch).toEqual({ from: 0, to: 0, reversed: false })
    expect(preview.route?.ok).toBe(true)
    if (!preview.route?.ok) return
    expect(preview.route.segments.map((segment) => segment.wayId)).toEqual(['R', 'C', 'R'])
    expect(preview.plan?.ok).toBe(true)
  })
})

describe('a route that leaves a way at an inner node', () => {
  test('the way is split at the nodes where the route leaves and joins it again', () => {
    const { graph, rel } = routeGraph()
    const edit = editAt(routeChain(graph, rel), 13.4035, 52.5)!
    const preview = previewReroute(graph, rel, {
      start: edit.start,
      end: edit.end,
      vias: [{ lon: 13.4035, lat: 52.5002 }],
      anchor: edit.anchor,
      occurrence: 0,
      roleChoices: {},
    }) as RoutePreview
    if (!preview.plan?.ok) throw new Error('no plan')
    let after = new Graph(graph)
    for (const action of preview.plan.actions) after = action(after)
    const route = after.hasEntity('Rel') as OsmRelation
    const ids = route.members.map((member) => member.id)
    expect(ids).toHaveLength(4)
    expect(ids[1]).toBe('C')
    expect(ids[3]).toBe('S')
    // the two parts of the road: n0 to n2 and n5 to n6, both new or kept, never the whole road
    const nodesOf = (id: string) => (after.hasEntity(id) as unknown as { nodes: string[] }).nodes
    expect([nodesOf(ids[0]!)[0], nodesOf(ids[0]!).at(-1)]).toEqual(['n0', 'n2'])
    expect([nodesOf(ids[2]!)[0], nodesOf(ids[2]!).at(-1)]).toEqual(['n5', 'n6'])
  })
})
