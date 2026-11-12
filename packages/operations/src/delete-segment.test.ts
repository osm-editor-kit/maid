import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteSegmentOperation } from './delete-segment.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()
const node = (id: string, lon: number, lat: number, tags: Record<string, string> = {}) =>
  new OsmNode(context, { id, loc: [lon, lat], tags })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })
const graphOf = (...entities: OsmEntity[]) => new Graph(context, entities)

/** n1 – n2 – n3 – n4 along the equator, a crossing way w2 through n2 */
const lineEntities = () => [
  node('n1', 0, 0),
  node('n2', 0.001, 0),
  node('n3', 0.002, 0),
  node('n4', 0.003, 0),
  node('n9', 0.001, 0.001),
  way('w1', ['n1', 'n2', 'n3', 'n4'], { highway: 'cycleway' }),
  way('w2', ['n9', 'n2'], { highway: 'footway' }),
]
const base = () => graphOf(...lineEntities())

function ctx(graph: Graph, at?: [number, number], selected = ['w1']): OperationContext {
  return { graph: new Graph(graph), selected, at }
}

/** Runs the operation as the editor does and gives the graph after it and the selection */
function run(graph: Graph, at: [number, number], selected = ['w1']) {
  const c = ctx(graph, at, selected)
  expect(deleteSegmentOperation.applies(c)).toBe(true)
  expect(deleteSegmentOperation.disabled(c)).toBeUndefined()
  const result = deleteSegmentOperation.run(c)
  const after = result.actions.reduce((g, action) => action(g), new Graph(graph))
  return { after, select: result.select?.(after) ?? [], annotation: result.annotation }
}

const nodesOf = (graph: Graph, id: string) => (graph.entity(id) as OsmWay).nodes

describe('delete segment', () => {
  it('is offered only where the menu was opened on one line', () => {
    const graph = base()
    expect(deleteSegmentOperation.applies(ctx(graph))).toBe(false)
    expect(deleteSegmentOperation.applies(ctx(graph, [0, 0], ['n2']))).toBe(false)
    expect(deleteSegmentOperation.applies(ctx(graph, [0, 0], ['w1', 'w2']))).toBe(false)
    expect(deleteSegmentOperation.applies(ctx(graph, [0.0015, 0.00001]))).toBe(true)
  })

  it('previews the segment nearest to the place', () => {
    expect(deleteSegmentOperation.preview!(ctx(base(), [0.0016, 0.0001]))).toEqual([
      [
        [0.001, 0],
        [0.002, 0],
      ],
    ])
  })

  it('splits a line in the middle and deletes the piece between', () => {
    const { after, select, annotation } = run(base(), [0.0015, 0])
    expect(annotation).toBe('Deleted a segment of a line')
    const ways = select.map((id) => nodesOf(after, id))
    expect(ways).toHaveLength(2)
    expect(ways).toContainEqual(['n1', 'n2'])
    expect(ways).toContainEqual(['n3', 'n4'])
    // the crossing way is untouched, the nodes stay
    expect(nodesOf(after, 'w2')).toEqual(['n9', 'n2'])
    expect(after.hasEntity('n2')).toBeDefined()
    expect(after.hasEntity('n3')).toBeDefined()
  })

  it('shortens a line at its first segment and deletes the free end node', () => {
    const { after, select } = run(base(), [0.0004, 0])
    expect(select).toEqual(['w1'])
    expect(nodesOf(after, 'w1')).toEqual(['n2', 'n3', 'n4'])
    expect(after.hasEntity('n1')).toBeUndefined()
  })

  it('shortens a line at its last segment', () => {
    const { after, select } = run(base(), [0.0029, 0])
    expect(select).toEqual(['w1'])
    expect(nodesOf(after, 'w1')).toEqual(['n1', 'n2', 'n3'])
    expect(after.hasEntity('n4')).toBeUndefined()
  })

  it('keeps a tagged end node', () => {
    const graph = graphOf(
      node('n1', 0, 0, { barrier: 'gate' }),
      node('n2', 0.001, 0),
      node('n3', 0.002, 0),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'cycleway' }),
    )
    const { after, select } = run(graph, [0.0005, 0])
    expect(select).toHaveLength(1)
    expect(nodesOf(after, select[0]!)).toEqual(['n2', 'n3'])
    expect(after.hasEntity('n1')).toBeDefined()
  })

  it('deletes a line of one segment', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      way('w1', ['n1', 'n2'], { highway: 'cycleway' }),
    )
    const { after, select } = run(graph, [0.0005, 0])
    expect(after.hasEntity('w1')).toBeUndefined()
    expect(select).toEqual([])
  })

  it('opens a closed line at the segment', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n3', 0.001, 0.001),
      node('n4', 0, 0.001),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { highway: 'footway' }),
    )
    const { after, select } = run(graph, [0.001, 0.0005])
    expect(select).toEqual(['w1'])
    expect(nodesOf(after, 'w1')).toEqual(['n3', 'n4', 'n1', 'n2'])
  })

  it('keeps the route membership of the pieces that remain', () => {
    const graph = graphOf(
      ...lineEntities(),
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'route', route: 'bicycle' },
        members: [{ id: 'w1', type: 'way', role: '' }],
      }),
    )
    const { after, select } = run(graph, [0.0015, 0])
    const members = (after.entity('r1') as OsmRelation).members.map((member) => member.id)
    expect(members.toSorted()).toEqual([...select].toSorted())
  })

  it('does not touch the graph while asking whether it can run', () => {
    const graph = base()
    const c = { graph, selected: ['w1'], at: [0.0015, 0] as [number, number] }
    deleteSegmentOperation.disabled(c)
    expect(nodesOf(graph, 'w1')).toEqual(['n1', 'n2', 'n3', 'n4'])
  })
})

describe('delete segment and the view', () => {
  it('runs on a long line that is mostly outside the view', () => {
    const c = {
      ...ctx(base(), [0.0015, 0]),
      viewExtent: { min: [0.0012, -0.0001], max: [0.0018, 0.0001] } as {
        min: [number, number]
        max: [number, number]
      },
    }
    expect(deleteSegmentOperation.disabled(c)).toBeUndefined()
  })
})
