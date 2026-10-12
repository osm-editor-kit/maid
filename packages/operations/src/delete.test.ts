// Delete: the checks and the selection rule of Maid's operation, beyond the adopted iD tests in
// id-delete.test.ts. The iD sentences are the ones in iD's core.yaml (operations.delete).
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteOperation } from './operations.ts'
import type { OperationContext, OperationResult } from './types.ts'

const context = new ModelContext()

const node = (id: string, lon = 0, lat = 0, tags: Record<string, string> = {}) =>
  new OsmNode(context, { id, loc: [lon, lat], tags })
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

const PART_OF_RELATION =
  "This feature can't be deleted because it is part of a larger relation. You must remove it from the relation first."
const PART_OF_RELATIONS =
  "These features can't be deleted because they are part of larger relations. You must remove them from the relations first."
const NOT_DOWNLOADED = "This feature can't be deleted because it hasn't been fully downloaded."
const NOT_DOWNLOADED_SEVERAL =
  "These features can't be deleted because they haven't been fully downloaded."
const WIKIDATA = "This feature can't be deleted because it has a Wikidata tag."
const WIKIDATA_SEVERAL = "These features can't be deleted because some have Wikidata tags."

describe('the delete operation: applicability', () => {
  it('does not apply to an empty selection or to an id that is not in the graph', () => {
    const graph = graphOf(node('n1'))
    expect(deleteOperation.applies(at(graph, []))).toBe(false)
    expect(deleteOperation.applies(at(graph, ['n9']))).toBe(false)
    expect(deleteOperation.applies(at(graph, ['n1', 'n9']))).toBe(false)
  })

  it('applies to any selection of features in the graph, and has no shortcut', () => {
    const graph = graphOf(node('n1'), way('w1', ['n1', 'n2']), node('n2'))
    expect(deleteOperation.applies(at(graph, ['n1']))).toBe(true)
    expect(deleteOperation.applies(at(graph, ['w1']))).toBe(true)
    expect(deleteOperation.applies(at(graph, ['n1', 'w1']))).toBe(true)
    expect(deleteOperation.shortcut).toBeUndefined()
  })

  it('is not disabled for plain features', () => {
    const graph = graphOf(
      node('n1', 0, 0, { amenity: 'bench' }),
      way('w1', ['n2', 'n3']),
      node('n2'),
      node('n3'),
    )
    expect(deleteOperation.disabled(at(graph, ['n1']))).toBeUndefined()
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBeUndefined()
  })
})

describe('the delete operation: disabled reasons, in iD order', () => {
  it('part of a route relation: a way that is a member of a route cannot be deleted', () => {
    const graph = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3'], { highway: 'primary' }),
      relation('r1', [{ id: 'w1', type: 'way', role: '' }], { type: 'route' }),
    )
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBe(PART_OF_RELATION)
  })

  it('part of a boundary relation, whatever the role', () => {
    const graph = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3']),
      relation('r1', [{ id: 'w1', type: 'way', role: 'anything' }], { type: 'boundary' }),
    )
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBe(PART_OF_RELATION)
  })

  it('the outer ring of a multipolygon cannot be deleted; a member without a role counts as outer', () => {
    const outer = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3']),
      relation('r1', [{ id: 'w1', type: 'way', role: 'outer' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(outer, ['w1']))).toBe(PART_OF_RELATION)

    const noRole = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3']),
      relation('r1', [{ id: 'w1', type: 'way', role: '' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(noRole, ['w1']))).toBe(PART_OF_RELATION)
  })

  it('the inner ring of a multipolygon can be deleted', () => {
    const graph = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3']),
      relation('r1', [{ id: 'w1', type: 'way', role: 'inner' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('a way in a relation of another type can be deleted', () => {
    const graph = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3']),
      relation('r1', [{ id: 'w1', type: 'way', role: '' }], { type: 'site' }),
    )
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('a node in a route can be deleted: the rule is about ways', () => {
    const graph = graphOf(
      node('n2'),
      way('w1', ['n2', 'n3']),
      node('n3'),
      relation('r1', [{ id: 'n2', type: 'node', role: 'stop' }], { type: 'route' }),
    )
    expect(deleteOperation.disabled(at(graph, ['n2']))).toBeUndefined()
  })

  it('a relation with a member missing from the data is not fully downloaded', () => {
    const graph = graphOf(
      relation('r1', [{ id: 'w9', type: 'way', role: 'outer' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(graph, ['r1']))).toBe(NOT_DOWNLOADED)
  })

  it('several relations not fully downloaded give the plural sentence', () => {
    const graph = graphOf(
      relation('r1', [{ id: 'w9', type: 'way', role: '' }], { type: 'site' }),
      relation('r2', [{ id: 'w8', type: 'way', role: '' }], { type: 'site' }),
    )
    expect(deleteOperation.disabled(at(graph, ['r1', 'r2']))).toBe(NOT_DOWNLOADED_SEVERAL)
  })

  it('a feature with a Wikidata tag cannot be deleted', () => {
    const graph = graphOf(node('n1', 0, 0, { wikidata: 'Q42' }))
    expect(deleteOperation.disabled(at(graph, ['n1']))).toBe(WIKIDATA)
  })

  it('a blank Wikidata tag does not count', () => {
    const graph = graphOf(node('n1', 0, 0, { wikidata: '   ' }))
    expect(deleteOperation.disabled(at(graph, ['n1']))).toBeUndefined()
  })

  it('several features with Wikidata tags give the plural sentence', () => {
    const graph = graphOf(node('n1', 0, 0, { wikidata: 'Q1' }), node('n2', 1, 0))
    expect(deleteOperation.disabled(at(graph, ['n1', 'n2']))).toBe(WIKIDATA_SEVERAL)
  })

  it('the protected member wins over a Wikidata tag: iD checks in its order', () => {
    const graph = graphOf(
      node('n2'),
      node('n3'),
      way('w1', ['n2', 'n3'], { wikidata: 'Q1' }),
      relation('r1', [{ id: 'w1', type: 'way', role: 'outer' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(graph, ['w1']))).toBe(PART_OF_RELATION)
  })

  it('the incomplete relation wins over a Wikidata tag', () => {
    const graph = graphOf(
      relation('r1', [{ id: 'w9', type: 'way', role: '' }], { type: 'site', wikidata: 'Q1' }),
    )
    expect(deleteOperation.disabled(at(graph, ['r1']))).toBe(NOT_DOWNLOADED)
  })

  it('one protected feature in a selection blocks the whole selection', () => {
    const graph = graphOf(
      node('n1'),
      node('n2'),
      way('w1', ['n2', 'n3']),
      node('n3'),
      relation('r1', [{ id: 'w1', type: 'way', role: 'outer' }], { type: 'multipolygon' }),
    )
    expect(deleteOperation.disabled(at(graph, ['n1', 'w1']))).toBe(PART_OF_RELATIONS)
  })
})

describe('the delete operation: what it deletes and how it is named', () => {
  it('names one point, one line and one area', () => {
    const graph = graphOf(
      node('p1', 0, 0, { amenity: 'bench' }),
      node('a', 1, 0),
      node('b', 2, 0),
      way('line', ['a', 'b'], { highway: 'path' }),
      node('c', 3, 0),
      node('d', 3, 1),
      node('e', 2, 1),
      way('area', ['c', 'd', 'e', 'c'], { area: 'yes' }),
    )
    expect(deleteOperation.run(at(graph, ['p1'])).annotation).toBe('Deleted a point')
    expect(deleteOperation.run(at(graph, ['line'])).annotation).toBe('Deleted a line')
    expect(deleteOperation.run(at(graph, ['area'])).annotation).toBe('Deleted an area')
  })

  it('names a node of a way as a node from a way', () => {
    const graph = graphOf(node('a', 0, 0), node('b', 1, 0), way('w', ['a', 'b']))
    expect(deleteOperation.run(at(graph, ['a'])).annotation).toBe('Deleted a node from a way')
  })

  it('counts several features in one annotation', () => {
    const graph = graphOf(node('n1'), node('n2', 1, 0), node('n3', 2, 0))
    expect(deleteOperation.run(at(graph, ['n1', 'n2', 'n3'])).annotation).toBe('Deleted 3 features')
  })

  it('deletes several features as one action, which is one undo step', () => {
    const graph = graphOf(node('n1'), node('n2', 1, 0), way('w', ['n1', 'n2']))
    const result = deleteOperation.run(at(graph, ['n1', 'n2']))
    expect(result.actions).toHaveLength(1)
    const after = apply(graph, result)
    expect(after.hasEntity('n1')).toBeUndefined()
    expect(after.hasEntity('n2')).toBeUndefined()
  })

  it('deleting a node removes it from its way; a way left degenerate goes, and so does its untagged last node', () => {
    const graph = graphOf(node('a', 0, 0), node('b', 1, 0), way('w', ['a', 'b']))
    const after = apply(graph, deleteOperation.run(at(graph, ['a'])))
    expect(after.hasEntity('a')).toBeUndefined()
    expect(after.hasEntity('w')).toBeUndefined()
    expect(after.hasEntity('b')).toBeUndefined()
  })

  it('a tagged last node of a degenerate way stays', () => {
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0, { amenity: 'bench' }),
      way('w', ['a', 'b']),
    )
    const after = apply(graph, deleteOperation.run(at(graph, ['a'])))
    expect(after.hasEntity('w')).toBeUndefined()
    expect(after.hasEntity('b')).toBeDefined()
  })
})

describe('the delete operation: the selection afterwards', () => {
  it('selects nothing after a point is deleted', () => {
    const graph = graphOf(node('n1', 0, 0, { amenity: 'bench' }))
    const result = deleteOperation.run(at(graph, ['n1']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })

  it('selects nothing after a whole way is deleted', () => {
    const graph = graphOf(node('a', 0, 0), node('b', 1, 0), way('w', ['a', 'b']))
    const result = deleteOperation.run(at(graph, ['w']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })

  it('selects nothing for a selection of several features', () => {
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0),
      node('c', 2, 0),
      way('w', ['a', 'b', 'c']),
    )
    const result = deleteOperation.run(at(graph, ['a', 'b']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })

  it('selects nothing for a vertex when several features are selected', () => {
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0),
      node('c', 2, 0),
      way('w', ['a', 'b', 'c']),
    )
    const result = deleteOperation.run(at(graph, ['b', 'c']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })

  it('selects the neighbour of a vertex on a way that keeps its other nodes', () => {
    // c is 1 degree from b and 1.5 from d: b is the nearer neighbour
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0),
      node('c', 2, 0),
      node('d', 3.5, 0),
      way('w', ['a', 'b', 'c', 'd']),
    )
    const result = deleteOperation.run(at(graph, ['c']))
    expect(result.select?.(apply(graph, result))).toEqual(['b'])
  })

  it('selects nothing when the neighbour is an untagged last node that goes with its way', () => {
    const graph = graphOf(node('a', 0, 0), node('b', 1, 0), way('w', ['a', 'b']))
    const result = deleteOperation.run(at(graph, ['a']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })

  it('selects the neighbour when it is a tagged last node that stays', () => {
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0, { amenity: 'bench' }),
      way('w', ['a', 'b']),
    )
    const result = deleteOperation.run(at(graph, ['a']))
    expect(result.select?.(apply(graph, result))).toEqual(['b'])
  })

  it('selects the nearest neighbour of a middle vertex by the distance on the ground', () => {
    // At latitude 60 a degree of longitude is half a degree of latitude long. b is 0.6 degrees of
    // longitude away (about 33 km), d is 0.4 degrees of latitude away (about 44 km). Counted in
    // degrees, d would be nearer; on the ground, b is.
    const graph = graphOf(
      node('a', -1.5, 60),
      node('b', -0.6, 60),
      node('c', 0, 60),
      node('d', 0, 60.4),
      way('w', ['a', 'b', 'c', 'd']),
    )
    const result = deleteOperation.run(at(graph, ['c']))
    expect(result.select?.(apply(graph, result))).toEqual(['b'])
  })

  it('selects the following node when both neighbours are equally near', () => {
    const graph = graphOf(
      node('a', 0, 0),
      node('b', 1, 0),
      node('c', 2, 0),
      way('w', ['a', 'b', 'c']),
    )
    const result = deleteOperation.run(at(graph, ['b']))
    expect(result.select?.(apply(graph, result))).toEqual(['c'])
  })

  it('selects nothing for a vertex of a way of one node', () => {
    const graph = graphOf(node('n'), way('w', ['n']))
    const result = deleteOperation.run(at(graph, ['n']))
    expect(result.select?.(apply(graph, result))).toEqual([])
  })
})
