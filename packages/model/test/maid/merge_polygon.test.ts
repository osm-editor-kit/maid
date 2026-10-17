// Maid's own tests for actionMergePolygon (not from Rapid or iD): the cases that the iD and Rapid files do not
// cover, each with iD's behaviour as the expectation (iD: modules/actions/merge_polygon.ts, test/spec/actions/merge_polygon.js).
// Overlapping and touching outlines are not refused, as in iD; the one difference is the area=yes rule for inner rings.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay, actionMergePolygon } from '../../src/index.ts'
import type { OsmTags } from '../../src/index.ts'

const context = new ModelContext()

/** A closed way for the rectangle x0..x1, y0..y1, with its four corner nodes named `${id}0`..`${id}3` */
function rectangle(id: string, x0: number, y0: number, x1: number, y1: number, tags: OsmTags = {}) {
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const nodes = corners.map((loc, i) => new OsmNode(context, { id: `${id}${i}`, loc }))
  const way = new OsmWay(context, {
    id,
    nodes: [...nodes.map((node) => node.id), `${id}0`],
    tags,
  })
  return [...nodes, way]
}

/** A graph of the given groups of entities, in order */
function graphOf(...groups: (OsmNode | OsmWay | OsmRelation)[][]) {
  // a working graph on top of a base graph, as the actions expect (`replace` is not allowed on a base graph)
  return new Graph(new Graph(context, groups.flat()))
}

describe('actionMergePolygon (Maid cases, as iD)', () => {
  it('nests three levels: the outermost is outer, the next inner, the innermost outer again', () => {
    const graph = graphOf(
      rectangle('wA', 0, 0, 10, 10, { building: 'yes' }),
      rectangle('wB', 2, 2, 8, 8),
      rectangle('wC', 4, 4, 6, 6),
    )
    const result = actionMergePolygon(['wA', 'wB', 'wC'], 'r1')(graph)
    const r = result.entity('r1') as OsmRelation
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('inner')
    expect(r.memberById('wC')?.role).toBe('outer')
  })

  it('accepts two outlines that overlap partly (iD does not refuse them)', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 5, 5), rectangle('wB', 3, 3, 8, 8))
    const action = actionMergePolygon(['wA', 'wB'], 'r1')
    expect(action.disabled?.(graph)).toBe(false)
    const r = action(graph).entity('r1') as OsmRelation
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('outer')
  })

  it('accepts two outlines that share an edge (iD does not refuse them)', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 5, 5), rectangle('wB', 5, 0, 10, 5))
    const action = actionMergePolygon(['wA', 'wB'], 'r1')
    expect(action.disabled?.(graph)).toBe(false)
    const r = action(graph).entity('r1') as OsmRelation
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('outer')
  })

  it('accepts two outlines that touch at one corner node, both outer', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 5, 5), rectangle('wB', 5, 5, 9, 9))
    const r = actionMergePolygon(['wA', 'wB'], 'r1')(graph).entity('r1') as OsmRelation
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('outer')
  })

  it('makes the new relation with the given id, typed as a multipolygon, and without area', () => {
    const graph = graphOf(
      rectangle('wA', 0, 0, 10, 10, { building: 'yes', area: 'yes' }),
      rectangle('wB', 2, 2, 8, 8),
    )
    const result = actionMergePolygon(['wA', 'wB'], 'r7')(graph)
    const r = result.entity('r7') as OsmRelation
    expect(r.tags).toEqual({ type: 'multipolygon', building: 'yes' })
    expect(r.members.map((m) => [m.id, m.role])).toEqual([['wA', 'outer'], ['wB', 'inner']])
  })

  it('moves the tags of outer rings to the relation and leaves the ring untagged', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 10, 10, { building: 'yes', name: 'Hall' }), rectangle('wB', 2, 2, 8, 8))
    const result = actionMergePolygon(['wA', 'wB'], 'r1')(graph)
    expect(result.entity('wA').tags).toEqual({})
    expect(result.entity('r1').tags).toEqual({ type: 'multipolygon', building: 'yes', name: 'Hall' })
  })

  it('gives an inner ring whose only tag is area=yes no tags', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 10, 10, { building: 'yes' }), rectangle('wB', 2, 2, 8, 8, { area: 'yes' }))
    const result = actionMergePolygon(['wA', 'wB'], 'r1')(graph)
    expect(result.entity('wB').tags).toEqual({})
  })

  it('keeps the tags of an inner ring that has other tags, area=yes included', () => {
    const graph = graphOf(
      rectangle('wA', 0, 0, 10, 10, { building: 'yes' }),
      rectangle('wB', 2, 2, 8, 8, { area: 'yes', natural: 'water' }),
    )
    const result = actionMergePolygon(['wA', 'wB'], 'r1')(graph)
    expect(result.entity('wB').tags).toEqual({ area: 'yes', natural: 'water' })
  })

  it('joins different building values of the outer rings with ";" as iD does', () => {
    const graph = graphOf(rectangle('wA', 0, 0, 5, 5, { building: 'house' }), rectangle('wB', 6, 6, 9, 9, { building: 'shed' }))
    const result = actionMergePolygon(['wA', 'wB'], 'r1')(graph)
    expect(result.entity('r1').tags.building).toBe('house;shed')
  })

  it('adds a closed way inside an existing multipolygon as inner and keeps the relation id and tags', () => {
    const outer = rectangle('wA', 0, 0, 10, 10)
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon', name: 'Park' },
      members: [{ type: 'way', id: 'wA', role: 'outer' }],
    })
    const graph = graphOf(outer, [relation], rectangle('wB', 2, 2, 8, 8))
    const result = actionMergePolygon(['r1', 'wB'])(graph)
    const r = result.entity('r1') as OsmRelation
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('inner')
    expect(r.tags).toEqual({ type: 'multipolygon', name: 'Park' })
    expect(result.hasEntity('wB')?.tags).toEqual({})
  })

  it('adds a closed way outside an existing multipolygon as outer', () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ type: 'way', id: 'wA', role: 'outer' }],
    })
    const graph = graphOf(rectangle('wA', 0, 0, 5, 5), [relation], rectangle('wB', 6, 6, 9, 9))
    const r = actionMergePolygon(['r1', 'wB'])(graph).entity('r1') as OsmRelation
    expect(r.memberById('wB')?.role).toBe('outer')
    expect(r.memberById('wA')?.role).toBe('outer')
  })

  it('takes the oldest of several selected multipolygons, with the tags of the others', () => {
    const graph = graphOf(
      rectangle('wA', 0, 0, 5, 5),
      rectangle('wB', 6, 6, 9, 9),
      [
        new OsmRelation(context, { id: 'r9', tags: { type: 'multipolygon', name: 'Young' }, members: [{ type: 'way', id: 'wA', role: 'outer' }] }),
        new OsmRelation(context, { id: 'r4', tags: { type: 'multipolygon', landuse: 'farm' }, members: [{ type: 'way', id: 'wB', role: 'outer' }] }),
      ],
    )
    const result = actionMergePolygon(['r9', 'r4'])(graph)
    expect(result.hasEntity('r9')).toBeUndefined()
    expect(result.entity('r4').tags).toEqual({ type: 'multipolygon', name: 'Young', landuse: 'farm' })
  })
})
