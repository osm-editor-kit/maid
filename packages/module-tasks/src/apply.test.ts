import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { applyTaskOption, createTaskFeature, deleteTaskFeatures } from './apply.ts'

const option = { set: { surface: 'asphalt' }, remove: ['note'] }

function history() {
  const context = new ModelContext()
  const edits = new EditHistory(context)
  edits.merge([
    new OsmWay(context, {
      id: 'w1',
      nodes: [],
      tags: { highway: 'residential', note: 'check', surface: 'gravel' },
    }),
  ])
  return edits
}

const tagsOf = (edits: EditHistory, id: string) => edits.staging.graph.hasEntity(id)?.tags

describe('applyTaskOption', () => {
  it('sets and removes tags as one undo step with the annotation', () => {
    const edits = history()
    expect(applyTaskOption(edits, 'w1', option, 'Task: Fix it', false)).toEqual({ ok: true })
    expect(tagsOf(edits, 'w1')).toEqual({ highway: 'residential', surface: 'asphalt' })
    expect(edits.index).toBe(1)
    expect(edits.getUndoAnnotation()).toBe('Task: Fix it')
    edits.undo()
    expect(tagsOf(edits, 'w1')).toEqual({
      highway: 'residential',
      note: 'check',
      surface: 'gravel',
    })
  })

  it('changes several features in one undo step and leaves one that has the tags', () => {
    const edits = history()
    const context = edits.staging.graph.hasEntity('w1')?.context
    if (!context) throw new Error('no context')
    edits.merge([
      new OsmWay(context, { id: 'w2', nodes: [], tags: { highway: 'service', note: 'x' } }),
      new OsmWay(context, {
        id: 'w3',
        nodes: [],
        tags: { highway: 'service', surface: 'asphalt' },
      }),
    ])
    expect(applyTaskOption(edits, ['w1', 'w2', 'w3'], option, 'x', false, ['w9'])).toEqual({
      ok: true,
    })
    expect(tagsOf(edits, 'w1')).toEqual({ highway: 'residential', surface: 'asphalt' })
    expect(tagsOf(edits, 'w2')).toEqual({ highway: 'service', surface: 'asphalt' })
    expect(edits.index).toBe(1)
    edits.undo()
    expect(tagsOf(edits, 'w2')).toEqual({ highway: 'service', note: 'x' })
    // one read-only feature stops all of them
    expect(applyTaskOption(edits, ['w1', 'w2'], option, 'x', (id) => id === 'w2')).toEqual({
      ok: false,
      reason: 'read-only',
    })
  })

  it('refuses a read-only feature and changes nothing', () => {
    const edits = history()
    expect(applyTaskOption(edits, 'w1', option, 'x', true)).toEqual({
      ok: false,
      reason: 'read-only',
    })
    expect(edits.index).toBe(0)
  })

  it('refuses a feature that is not in the data', () => {
    expect(applyTaskOption(history(), 'w9', option, 'x', false)).toEqual({
      ok: false,
      reason: 'missing',
    })
  })

  it('does not commit an option that is applied already', () => {
    const edits = history()
    applyTaskOption(edits, 'w1', option, 'x', false)
    expect(applyTaskOption(edits, 'w1', option, 'x', false)).toEqual({
      ok: false,
      reason: 'applied',
    })
    expect(edits.index).toBe(1)
  })
})

/** A way of two nodes, one of them also on a second way, and a tagged node */
function deletable() {
  const context = new ModelContext()
  const edits = new EditHistory(context)
  edits.merge([
    new OsmNode(context, { id: 'n1', loc: [13.4, 52.39] }),
    new OsmNode(context, { id: 'n2', loc: [13.41, 52.39] }),
    new OsmNode(context, { id: 'n3', loc: [13.42, 52.39] }),
    new OsmNode(context, { id: 'n4', loc: [13.43, 52.39], tags: { amenity: 'bench' } }),
    new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'path' } }),
    new OsmWay(context, { id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'path' } }),
  ])
  return edits
}

describe('createTaskFeature', () => {
  it('adds a tagged node at a point as one undo step and selects it', () => {
    const edits = history()
    const { id } = createTaskFeature(
      edits,
      { type: 'Point', coordinates: [13.4, 52.39] },
      { amenity: 'bench' },
      'Task: add',
    )
    const node = edits.staging.graph.hasEntity(id)
    expect(node).toBeInstanceOf(OsmNode)
    expect(node?.tags).toEqual({ amenity: 'bench' })
    expect((node as OsmNode).loc).toEqual([13.4, 52.39])
    expect(edits.index).toBe(1)
    edits.undo()
    expect(edits.staging.graph.hasEntity(id)).toBeUndefined()
  })

  it('adds a way of new untagged nodes along a line', () => {
    const edits = history()
    const { id } = createTaskFeature(
      edits,
      {
        type: 'LineString',
        coordinates: [
          [13.4, 52.39],
          [13.41, 52.39],
          [13.42, 52.391],
        ],
      },
      { highway: 'footway' },
      'x',
    )
    const way = edits.staging.graph.hasEntity(id) as OsmWay
    expect(way.tags).toEqual({ highway: 'footway' })
    expect(way.nodes).toHaveLength(3)
    expect(
      way.nodes.every((n) => edits.staging.graph.hasEntity(n)?.tags.highway === undefined),
    ).toBe(true)
  })

  it('adds a closed way for a polygon, without repeating the last position', () => {
    const edits = history()
    const ring: [number, number][] = [
      [13.4, 52.39],
      [13.41, 52.39],
      [13.41, 52.391],
      [13.4, 52.39],
    ]
    const { id } = createTaskFeature(
      edits,
      { type: 'Polygon', coordinates: [ring] },
      { leisure: 'playground' },
      'x',
    )
    const way = edits.staging.graph.hasEntity(id) as OsmWay
    expect(way.nodes).toHaveLength(4)
    expect(way.nodes[0]).toBe(way.nodes[3])
    expect(new Set(way.nodes).size).toBe(3)
  })
})

describe('deleteTaskFeatures', () => {
  const free = () => false

  it('deletes a way and its untagged nodes nothing else uses, as one undo step', () => {
    const edits = deletable()
    expect(deleteTaskFeatures(edits, ['w1'], 'Task: delete', free)).toEqual({ ok: true })
    const graph = edits.staging.graph
    expect(graph.hasEntity('w1')).toBeUndefined()
    expect(graph.hasEntity('n1')).toBeUndefined()
    // shared with w2
    expect(graph.hasEntity('n2')).toBeDefined()
    expect(edits.index).toBe(1)
    edits.undo()
    expect(edits.staging.graph.hasEntity('w1')).toBeDefined()
  })

  it('deletes several features at once', () => {
    const edits = deletable()
    expect(deleteTaskFeatures(edits, ['w2', 'n4'], 'x', free)).toEqual({ ok: true })
    expect(edits.staging.graph.hasEntity('n4')).toBeUndefined()
    expect(edits.index).toBe(1)
  })

  it('refuses read-only and missing features, and says when they are deleted already', () => {
    const edits = deletable()
    expect(deleteTaskFeatures(edits, ['w1'], 'x', (id) => id === 'w1')).toEqual({
      ok: false,
      reason: 'read-only',
    })
    expect(deleteTaskFeatures(edits, ['w1', 'w9'], 'x', free)).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(deleteTaskFeatures(edits, ['w9'], 'x', free)).toEqual({ ok: false, reason: 'missing' })
    deleteTaskFeatures(edits, ['w1'], 'x', free)
    expect(deleteTaskFeatures(edits, ['w1'], 'x', free)).toEqual({ ok: false, reason: 'applied' })
    expect(edits.index).toBe(1)
  })

  it("refuses what iD's Delete refuses: a route member, a Wikidata tag", () => {
    const edits = deletable()
    const context = edits.context
    edits.merge([
      new OsmRelation(context, {
        id: 'r1',
        tags: { type: 'route', route: 'hiking' },
        members: [{ id: 'w1', type: 'way', role: '' }],
      }),
      new OsmNode(context, { id: 'n5', loc: [13.44, 52.39], tags: { wikidata: 'Q1' } }),
    ])
    expect(deleteTaskFeatures(edits, ['w1'], 'x', free)).toEqual({
      ok: false,
      reason: 'part_of_relation',
    })
    expect(deleteTaskFeatures(edits, ['n5'], 'x', free)).toEqual({
      ok: false,
      reason: 'has_wikidata_tag',
    })
  })
})
