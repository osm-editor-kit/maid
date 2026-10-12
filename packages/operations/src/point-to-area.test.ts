// Turn into an area: Maid's own tests (no iD counterpart). The point keeps its id and becomes the
// first node of a closed square; its tags move to the way.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity, SchemaLookup } from '@osm-editor-kit/maid-model'
import { pointToArea } from './point-to-area.ts'
import type { OperationContext, OperationResult } from './types.ts'

const context = new ModelContext()

/** A context whose tagging schema says `leisure` is an area key, so `leisure=*` makes a closed way an area */
const withAreaKeys = new ModelContext()
withAreaKeys.systems.schema = {
  getScope: () => ({ variables: new Map(), rulesets: new Map(), areaKeys: { leisure: {} } }),
  removeLifecyclePrefix: (key: string) => key,
  matchTags: () => null,
} satisfies SchemaLookup

const node = (
  id: string,
  lon = 0,
  lat = 0,
  tags: Record<string, string> = {},
  ctx: ModelContext = context,
) => new OsmNode(ctx, { id, loc: [lon, lat], tags })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })
const relation = (
  id: string,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[],
  tags: Record<string, string>,
) => new OsmRelation(context, { id, members, tags })

const graphOf = (...entities: OsmEntity[]) => new Graph(context, entities)
const at = (graph: Graph, selected: string[]): OperationContext => ({ graph, selected })

/** Applies the actions of a result in order, as the editor does, on a copy of the graph */
function apply(graph: Graph, result: OperationResult): Graph {
  return result.actions.reduce((g, action) => action(g), new Graph(graph))
}

/** Metres between two [lon, lat] points, as iD's geoSphericalDistance */
function metres(a: [number, number], b: [number, number]): number {
  const earth = 6.378137e6
  const polar = 6.3567523e6
  const tau = 2 * Math.PI
  const meanLat = (a[1] + b[1]) / 2
  const x = (a[0] - b[0]) * ((tau * earth) / 360) * Math.abs(Math.cos((meanLat * Math.PI) / 180))
  const y = (a[1] - b[1]) * ((tau * polar) / 360)
  return Math.hypot(x, y)
}

const playground = (tags: Record<string, string>) => tags.leisure === 'playground'
const operation = pointToArea({ canBeArea: playground })

/** A playground point at 52 N, 13 E, with a road and a bench nearby that must not change */
function playgroundScene(ctx: ModelContext = context) {
  const point = node('n1', 13, 52, { leisure: 'playground', name: 'Kinderspielplatz' }, ctx)
  const bench = node('n5', 13.001, 52.001, { amenity: 'bench' }, ctx)
  const road = way('w9', ['n7', 'n8'], { highway: 'residential' })
  return graphOf(
    point,
    bench,
    road,
    node('n7', 13.01, 52.01),
    node('n8', 13.02, 52.02),
    relation('r1', [{ id: 'n5', type: 'node', role: 'bench' }], { type: 'site' }),
  )
}

describe('the point-to-area operation: applicability', () => {
  it('applies to one standalone point with tags that canBeArea accepts', () => {
    const graph = playgroundScene()
    expect(operation.applies(at(graph, ['n1']))).toBe(true)
    expect(operation.id).toBe('point-to-area')
    expect(operation.label).toBe('Turn into an area')
    expect(operation.shortcut).toBeUndefined()
  })

  it('does not apply to a vertex of a way, even with tags canBeArea accepts', () => {
    const graph = graphOf(
      node('n1', 13, 52, { leisure: 'playground' }),
      node('n2', 13.001, 52),
      way('w1', ['n1', 'n2']),
    )
    expect(operation.applies(at(graph, ['n1']))).toBe(false)
  })

  it('does not apply to an untagged point', () => {
    const graph = graphOf(node('n1', 13, 52))
    expect(operation.applies(at(graph, ['n1']))).toBe(false)
  })

  it('does not apply to two selected points, a way, or nothing', () => {
    const graph = graphOf(
      node('n1', 13, 52, { leisure: 'playground' }),
      node('n2', 13.1, 52.1, { leisure: 'playground' }),
      way('w1', ['n1', 'n2'], { leisure: 'playground' }),
    )
    expect(operation.applies(at(graph, ['n1', 'n2']))).toBe(false)
    expect(operation.applies(at(graph, ['w1']))).toBe(false)
    expect(operation.applies(at(graph, []))).toBe(false)
    expect(operation.applies(at(graph, ['n9']))).toBe(false)
  })

  it('does not apply when canBeArea says the tags cannot be an area', () => {
    const graph = graphOf(node('n1', 13, 52, { amenity: 'bench' }))
    expect(operation.applies(at(graph, ['n1']))).toBe(false)
    expect(pointToArea({ canBeArea: () => false }).applies(at(playgroundScene(), ['n1']))).toBe(
      false,
    )
  })
})

describe('the point-to-area operation: disabled', () => {
  it('is not disabled for a standalone point', () => {
    const graph = playgroundScene()
    expect(operation.disabled(at(graph, ['n1']))).toBeUndefined()
  })

  it('is disabled for a point that is a member of a relation', () => {
    const graph = graphOf(
      node('n1', 13, 52, { leisure: 'playground' }),
      relation('r1', [{ id: 'n1', type: 'node', role: 'poi' }], { type: 'site' }),
    )
    expect(operation.applies(at(graph, ['n1']))).toBe(true)
    expect(operation.disabled(at(graph, ['n1']))).toBe(
      'This point is a member of a relation. Turning it into an area would change what the relation means, so remove it from the relation first.',
    )
  })
})

describe('the point-to-area operation: run', () => {
  it('makes the point the first and last node of a closed way with four distinct corners', () => {
    const graph = playgroundScene()
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    expect(created).toBeInstanceOf(OsmWay)
    expect(created.nodes).toHaveLength(5)
    expect(created.nodes[0]).toBe('n1')
    expect(created.nodes[4]).toBe('n1')
    expect(created.isClosed()).toBe(true)
    expect(new Set(created.nodes).size).toBe(4)
  })

  it('moves all tags from the point to the way and leaves the point untagged', () => {
    const graph = playgroundScene(withAreaKeys)
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!)
    expect(created.tags).toEqual({ leisure: 'playground', name: 'Kinderspielplatz' })
    expect(after.entity('n1').tags).toEqual({})
  })

  it('keeps the id, version and position of the point, and the square is centred on its old position', () => {
    const graph = graphOf(
      new OsmNode(context, {
        id: 'n1',
        loc: [13, 52],
        tags: { leisure: 'playground' },
        version: 4,
      }),
    )
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const point = after.entity('n1') as OsmNode
    expect(point).toBeInstanceOf(OsmNode)
    expect(point.props.version).toBe(4)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    const [sw, se, ne, nw] = created.nodes
      .slice(0, 4)
      .map((id) => (after.entity(id) as OsmNode).loc!)
    expect(point.loc).toEqual(sw)
    // the old position is the centre: the middle of the diagonal south-west to north-east
    expect((sw![0] + ne![0]) / 2).toBeCloseTo(13, 12)
    expect((sw![1] + ne![1]) / 2).toBeCloseTo(52, 12)
    expect(nw![0]).toBeCloseTo(sw![0]!, 12)
    expect(se![1]).toBeCloseTo(sw![1]!, 12)
  })

  it('makes a square of 10 metres on a side by default', () => {
    const graph = playgroundScene()
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    const [sw, se, ne, nw] = created.nodes
      .slice(0, 4)
      .map((id) => (after.entity(id) as OsmNode).loc!) as [number, number][]
    expect(metres(sw!, se!)).toBeCloseTo(10, 3)
    expect(metres(se!, ne!)).toBeCloseTo(10, 3)
    expect(metres(ne!, nw!)).toBeCloseTo(10, 3)
    expect(metres(nw!, sw!)).toBeCloseTo(10, 3)
  })

  it('makes a square of the given size', () => {
    const graph = playgroundScene()
    const result = pointToArea({ canBeArea: playground, size: 25 }).run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    const [sw, se, ne] = created.nodes
      .slice(0, 3)
      .map((id) => (after.entity(id) as OsmNode).loc!) as [number, number][]
    expect(metres(sw!, se!)).toBeCloseTo(25, 3)
    expect(metres(se!, ne!)).toBeCloseTo(25, 3)
  })

  it('refuses a size that is not a positive number of metres', () => {
    expect(() => pointToArea({ canBeArea: playground, size: 0 })).toThrow(RangeError)
    expect(() => pointToArea({ canBeArea: playground, size: Number.NaN })).toThrow(RangeError)
  })

  it('adds area=yes when the moved tags do not make the way an area by themselves', () => {
    // no schema: the model has no area keys, so only area=yes makes the closed way an area
    const graph = playgroundScene()
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    expect(created.tags).toEqual({ leisure: 'playground', name: 'Kinderspielplatz', area: 'yes' })
    expect(created.isArea()).toBe(true)
  })

  it('does not add area=yes when the schema makes the tags an area', () => {
    const graph = playgroundScene(withAreaKeys)
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const created = after.entity(result.select!(after)[0]!) as OsmWay
    expect(created.tags).toEqual({ leisure: 'playground', name: 'Kinderspielplatz' })
    expect(created.isArea()).toBe(true)
  })

  it('selects the new way afterwards', () => {
    const graph = playgroundScene()
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    const selected = result.select!(after)
    expect(selected).toHaveLength(1)
    expect(after.entity(selected[0]!)).toBeInstanceOf(OsmWay)
  })

  it('is one undo step with the annotation "Turned a point into an area"', () => {
    const graph = playgroundScene()
    const result = operation.run(at(graph, ['n1']))
    expect(result.actions).toHaveLength(1)
    expect(result.annotation).toBe('Turned a point into an area')
  })

  it('deletes nothing and leaves the other features as they were', () => {
    const graph = playgroundScene()
    const before = graph.hasEntity('w9')!
    const result = operation.run(at(graph, ['n1']))
    const after = apply(graph, result)
    for (const id of ['n1', 'n5', 'n7', 'n8', 'w9', 'r1']) {
      expect(after.hasEntity(id)).toBeDefined()
    }
    expect(after.entity('w9').tags).toEqual(before.tags)
    expect((after.entity('w9') as OsmWay).nodes).toEqual(['n7', 'n8'])
    expect(after.entity('n5').tags).toEqual({ amenity: 'bench' })
  })

  it('throws for a selection the operation does not apply to', () => {
    const graph = graphOf(node('n1', 13, 52, { amenity: 'bench' }))
    expect(() => operation.run(at(graph, ['n1']))).toThrow()
  })
})
