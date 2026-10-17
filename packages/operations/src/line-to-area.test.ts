// Treat as area: Maid's own operation (no iD counterpart). A closed line without feature tags gets area=yes.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { isNonFeatureKey, lineToAreaOperation } from './line-to-area.ts'
import type { OperationContext, OperationResult } from './types.ts'

const context = new ModelContext()

const node = (id: string, lon: number, lat: number) =>
  new OsmNode(context, { id, loc: [lon, lat], tags: {} })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })

const graphOf = (...entities: OsmEntity[]) => new Graph(context, entities)
const at = (graph: Graph, selected: string[]): OperationContext => ({ graph, selected })

/** Applies the actions of a result in order, as the editor does, on a copy of the graph */
function apply(graph: Graph, result: OperationResult): Graph {
  return result.actions.reduce((g, action) => action(g), new Graph(graph))
}

const square = (id: string, tags: Record<string, string>) => way(id, ['a', 'b', 'c', 'a'], tags)
const corners = [node('a', 0, 0), node('b', 0.001, 0), node('c', 0.001, 0.001)]

describe('Treat as area: what it applies to', () => {
  it('applies to a closed untagged line, with its label, no key and no reason to refuse', () => {
    const graph = graphOf(...corners, square('w1', {}))
    expect(lineToAreaOperation.id).toBe('line-to-area')
    expect(lineToAreaOperation.label).toBe('Treat as area')
    expect(lineToAreaOperation.shortcut).toBeUndefined()
    expect(lineToAreaOperation.applies(at(graph, ['w1']))).toBe(true)
    expect(lineToAreaOperation.disabled(at(graph, ['w1']))).toBeUndefined()
  })

  it('applies when the tags are only non-feature tags', () => {
    const tags = {
      source: 'survey',
      'source:name': 'Ortsbegehung',
      note: 'check the edge',
      'note:en': 'check',
      fixme: 'survey again',
      'fixme:type': 'yes',
      created_by: 'JOSM',
      description: 'a rough outline',
    }
    const graph = graphOf(...corners, square('w1', tags))
    expect(lineToAreaOperation.applies(at(graph, ['w1']))).toBe(true)
  })

  it('does not apply to a closed line with a feature tag: area=yes would change its meaning', () => {
    const featureTags: Record<string, string>[] = [
      { highway: 'footway' },
      { name: 'Ring' },
      { barrier: 'fence' },
    ]
    for (const tags of featureTags) {
      const graph = graphOf(...corners, square('w1', tags))
      expect(lineToAreaOperation.applies(at(graph, ['w1']))).toBe(false)
    }
  })

  it('does not apply to a way that is an area already: building=yes, or area=yes', () => {
    const areas: Record<string, string>[] = [{ building: 'yes' }, { area: 'yes' }]
    for (const tags of areas) {
      const graph = graphOf(...corners, square('w1', tags))
      expect(lineToAreaOperation.applies(at(graph, ['w1']))).toBe(false)
    }
  })

  it('does not apply to area=no, which the editor sets on purpose', () => {
    const graph = graphOf(...corners, square('w1', { area: 'no' }))
    expect(lineToAreaOperation.applies(at(graph, ['w1']))).toBe(false)
  })

  it('does not apply to an open line, to a closed way of two nodes, or to a point', () => {
    const open = graphOf(...corners, way('w1', ['a', 'b', 'c'], {}))
    expect(lineToAreaOperation.applies(at(open, ['w1']))).toBe(false)
    const degenerate = graphOf(node('a', 0, 0), node('b', 0.001, 0), way('w2', ['a', 'b', 'a'], {}))
    expect(lineToAreaOperation.applies(at(degenerate, ['w2']))).toBe(false)
    expect(lineToAreaOperation.applies(at(open, ['a']))).toBe(false)
  })

  it('does not apply to more than one selected way', () => {
    const graph = graphOf(...corners, square('w1', {}), way('w2', ['c', 'a', 'b', 'c'], {}))
    expect(lineToAreaOperation.applies(at(graph, ['w1', 'w2']))).toBe(false)
  })
})

describe('isNonFeatureKey', () => {
  it('names the keys that say nothing about what the way is', () => {
    for (const key of [
      'source',
      'source:name',
      'note',
      'note:en',
      'fixme',
      'fixme:type',
      'created_by',
      'description',
    ]) {
      expect(isNonFeatureKey(key)).toBe(true)
    }
  })

  it('does not take the keys of a feature, nor a key that only starts like one', () => {
    for (const key of ['name', 'highway', 'area', 'sources', 'notes', 'source_name', 'fixmes']) {
      expect(isNonFeatureKey(key)).toBe(false)
    }
  })
})

describe('Treat as area: what it does', () => {
  it('sets area=yes on the way, keeps its tags, and names the undo step', () => {
    const graph = graphOf(...corners, square('w1', { source: 'survey' }))
    const result = lineToAreaOperation.run(at(graph, ['w1']))
    expect(result.annotation).toBe('Treated a closed line as an area')
    expect(result.select).toBeUndefined()
    const after = apply(graph, result).hasEntity('w1') as OsmWay | undefined
    expect(after?.tags).toEqual({ source: 'survey', area: 'yes' })
    expect(after?.isArea()).toBe(true)
  })

  it('makes the way an area for the type search: its geometry is area', () => {
    const graph = graphOf(...corners, square('w1', {}))
    const after = apply(graph, lineToAreaOperation.run(at(graph, ['w1']))).hasEntity('w1') as
      | OsmWay
      | undefined
    expect(after?.isClosed()).toBe(true)
    expect(after?.tags.area).toBe('yes')
  })

  it('refuses to run for a selection it does not apply to', () => {
    const graph = graphOf(...corners, square('w1', { highway: 'footway' }))
    expect(() => lineToAreaOperation.run(at(graph, ['w1']))).toThrow()
  })
})
