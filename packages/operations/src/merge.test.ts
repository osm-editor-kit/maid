// Merge (C) as iD's operations/merge.js: which action runs for which selection, iD's sentences, and what is selected
// afterwards. The polygon cases are Maid's own; iD's operation has no test file in this checkout.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity } from '@osm-editor-kit/maid-model'
import { mergeOperation } from './merge.ts'
import type { OperationContext, OperationResult } from './types.ts'

const context = new ModelContext()

function node(id: string, lon: number, lat: number, tags: Record<string, string> = {}): OsmNode {
  return new OsmNode(context, { id, loc: [lon, lat], tags })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

/** A closed way over the rectangle x0..x1, y0..y1 with corner nodes `${id}0`..`${id}3` */
function rectangle(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tags: Record<string, string> = {},
): OsmEntity[] {
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  const nodes = corners.map((loc, i) => new OsmNode(context, { id: `${id}${i}`, loc }))
  return [...nodes, way(id, [...nodes.map((n) => n.id), `${id}0`], tags)]
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

function at(selected: string[], graph: Graph): OperationContext {
  return { graph, selected }
}

function apply(graph: Graph, result: OperationResult): Graph {
  return result.actions.reduce<Graph>((g, action: Action) => action(g), graph)
}

/** The multipolygon relation that holds the way `wid`, or a failing expectation */
function relationOf(graph: Graph, wid: string): OsmRelation {
  const [relation] = graph.parentRelations(graph.entity(wid))
  expect(relation).toBeInstanceOf(OsmRelation)
  return relation as OsmRelation
}

/** Checks that Merge applies and is not disabled, runs it on a copy of the base graph, as the editor does */
function run(base: Graph, selected: string[]) {
  const ctx = at(selected, new Graph(base))
  expect(mergeOperation.applies(ctx)).toBe(true)
  expect(mergeOperation.disabled(ctx)).toBeUndefined()
  const result = mergeOperation.run(ctx)
  const after = apply(new Graph(base), result)
  return { result, after, select: result.select?.(after) ?? [] }
}

describe('merge: the chain of iD', () => {
  it('two closed untagged rings that do not meet become one multipolygon (join is not adjacent)', () => {
    const base = graphOf(...rectangle('wA', 0, 0, 5, 5), ...rectangle('wB', 8, 8, 9, 9))
    expect(mergeOperation.disabled(at(['wA', 'wB'], base))).toBeUndefined()
    const { after, result } = run(base, ['wA', 'wB'])
    expect(result.annotation).toBe('Merged 2 features.')
    const r = relationOf(after, 'wA')
    expect(r.tags).toEqual({ type: 'multipolygon' })
    expect(r.memberById('wA')?.role).toBe('outer')
    expect(r.memberById('wB')?.role).toBe('outer')
  })

  it('two overlapping tagged areas are merged, not refused', () => {
    const base = graphOf(
      ...rectangle('wA', 0, 0, 5, 5, { area: 'yes', landuse: 'farm' }),
      ...rectangle('wB', 3, 3, 8, 8),
    )
    const { after, select } = run(base, ['wA', 'wB'])
    const r = relationOf(after, 'wA')
    expect(r.tags).toEqual({ type: 'multipolygon', landuse: 'farm' })
    // as iD: no relation is selected; the ways that remain are, as neither has tags of its own now
    expect(select).toEqual(['wA', 'wB'])
  })

  it('a closed way inside another becomes the inner ring, and the selection is the two ways', () => {
    const base = graphOf(
      ...rectangle('wA', 0, 0, 10, 10, { area: 'yes', building: 'yes' }),
      ...rectangle('wB', 2, 2, 8, 8, { area: 'yes' }),
    )
    const { after, select } = run(base, ['wA', 'wB'])
    const r = relationOf(after, 'wA')
    expect(r.memberById('wB')?.role).toBe('inner')
    expect(after.entity('wB').tags).toEqual({})
    expect(select).toEqual(['wA', 'wB'])
  })

  it("a multipolygon with a missing member is disabled with iD's sentence", () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ type: 'way', id: 'wX', role: 'outer' }],
    })
    const base = graphOf(...rectangle('wA', 0, 0, 5, 5), relation)
    const ctx = at(['r1', 'wA'], new Graph(base))
    expect(mergeOperation.applies(ctx)).toBe(true)
    expect(mergeOperation.disabled(ctx)).toBe(
      "These features can't be merged because at least one hasn't been fully downloaded.",
    )
  })

  it('two rings that are already the members of one multipolygon: join gives its sentence first, as iD', () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [
        { type: 'way', id: 'wA', role: 'outer' },
        { type: 'way', id: 'wB', role: 'outer' },
      ],
    })
    const base = graphOf(...rectangle('wA', 0, 0, 5, 5), ...rectangle('wB', 8, 8, 9, 9), relation)
    const ctx = at(['wA', 'wB'], new Graph(base))
    expect(mergeOperation.applies(ctx)).toBe(true)
    // two closed untagged rings are lines: join is disabled with not_adjacent, which iD shows before the polygon's reason
    expect(mergeOperation.disabled(ctx)).toBe(
      "These features can't be merged because their endpoints aren't connected.",
    )
  })

  it('a closed way already in a selected multipolygon is disabled as not eligible', () => {
    const relation = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'multipolygon' },
      members: [{ type: 'way', id: 'wA', role: 'outer' }],
    })
    const base = graphOf(...rectangle('wA', 0, 0, 5, 5), ...rectangle('wB', 8, 8, 9, 9), relation)
    const ctx = at(['r1', 'wA'], new Graph(base))
    expect(mergeOperation.disabled(ctx)).toBe("These features can't be merged.")
  })

  it('a point and an area: the point is merged into the area, and the operation runs', () => {
    const base = graphOf(
      ...rectangle('wA', 0, 0, 5, 5, { area: 'yes', building: 'yes' }),
      node('p1', 9, 9, { amenity: 'bench' }),
    )
    const { after, result } = run(base, ['p1', 'wA'])
    expect(result.annotation).toBe('Merged 2 features.')
    // as the model's merge: the point takes the place of an uninteresting corner of the way, which is removed
    expect(after.entity('wA').tags).toMatchObject({ building: 'yes', amenity: 'bench' })
    expect((after.entity('wA') as OsmWay).nodes).toContain('p1')
  })

  it('two points: they are merged into one location', () => {
    const base = graphOf(node('p1', 0, 0, { amenity: 'bench' }), node('p2', 0.001, 0.001))
    const { after, result, select } = run(base, ['p1', 'p2'])
    expect(result.annotation).toBe('Merged 2 features.')
    const survivors = ['p1', 'p2'].filter((id) => after.hasEntity(id) !== undefined)
    expect(survivors).toHaveLength(1)
    expect(after.entity(survivors[0] ?? '').tags).toMatchObject({ amenity: 'bench' })
    expect(select).toEqual(survivors)
  })

  it("two open lines that do not meet: iD's sentence for an unconnected end", () => {
    const base = graphOf(
      node('n1', 0, 0),
      node('n2', 1, 0),
      node('n3', 5, 5),
      node('n4', 6, 5),
      way('w1', ['n1', 'n2']),
      way('w2', ['n3', 'n4']),
    )
    const ctx = at(['w1', 'w2'], new Graph(base))
    expect(mergeOperation.applies(ctx)).toBe(true)
    expect(mergeOperation.disabled(ctx)).toBe(
      "These features can't be merged because their endpoints aren't connected.",
    )
  })

  it('a line and an area have no Merge', () => {
    const base = graphOf(
      ...rectangle('wA', 0, 0, 5, 5, { area: 'yes', building: 'yes' }),
      node('n1', 9, 9),
      node('n2', 10, 9),
      way('w1', ['n1', 'n2']),
    )
    expect(mergeOperation.applies(at(['wA', 'w1'], base))).toBe(false)
  })

  it('a selection with a relation that is not a multipolygon has no Merge', () => {
    const base = graphOf(
      node('p1', 0, 0),
      new OsmRelation(context, { id: 'r9', tags: { type: 'route' } }),
    )
    expect(mergeOperation.applies(at(['p1', 'r9'], base))).toBe(false)
  })

  it('a single feature has no Merge', () => {
    const base = graphOf(...rectangle('wA', 0, 0, 5, 5))
    expect(mergeOperation.applies(at(['wA'], base))).toBe(false)
  })
})
