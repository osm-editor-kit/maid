import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { routeInputOf } from './route-input.ts'

const context = new ModelContext()
const node = (id: string, lon: number, lat: number, tags: Record<string, string> = {}) =>
  new OsmNode(context, { id, loc: [lon, lat], tags })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })

describe('routeInputOf', () => {
  const relation = new OsmRelation(context, {
    id: 'r1',
    tags: { type: 'route', route: 'hiking' },
    members: [
      { id: 'w1', type: 'way', role: '' },
      { id: 'w2', type: 'way', role: '' },
      { id: 'w9', type: 'way', role: '' },
      { id: 'n9', type: 'node', role: 'guidepost' },
    ],
  })
  const graph = new Graph(context, [
    node('n1', 0, 0),
    node('n2', 0.001, 0),
    node('n3', 0.002, 0),
    node('n4', 0.001, 0.001),
    node('n9', 0.001, 0.0001, { information: 'guidepost' }),
    way('w1', ['n1', 'n2'], { highway: 'path' }),
    way('w2', ['n2', 'n3'], { highway: 'path' }),
    way('w3', ['n2', 'n4'], { highway: 'track' }),
    relation,
  ])
  const input = routeInputOf(graph, relation)

  it('keeps the members in order and leaves unloaded ones out of the data', () => {
    expect(input.members.map((member) => member.id)).toEqual(['w1', 'w2', 'w9', 'n9'])
    expect([...input.ways.keys()]).toEqual(['w1', 'w2'])
    expect(input.nodes.get('n9')).toEqual([0.001, 0.0001])
    expect(input.nodes.has('n4')).toBe(false)
  })

  it('counts the ways that are not members at each node of a member way', () => {
    expect(input.outsideWays?.get('n2')).toBe(1)
    expect(input.outsideWays?.get('n1')).toBe(0)
  })

  it('carries the tags of loaded members', () => {
    expect(input.memberTags?.get('n9')).toEqual({ information: 'guidepost' })
  })
})
