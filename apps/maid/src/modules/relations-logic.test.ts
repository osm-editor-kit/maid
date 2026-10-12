import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import {
  joinableRelations,
  loadedRelations,
  memberLabel,
  membershipsOf,
  relationLabel,
} from './relations-logic.ts'

const context = new ModelContext()

function relation(
  id: string,
  tags: Record<string, string>,
  members: { id: string; type: 'node' | 'way' | 'relation'; role: string }[] = [],
) {
  return new OsmRelation(context, { id, tags, members })
}

describe('loadedRelations', () => {
  it('lists the relations of the base data and skips other entities', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }),
      relation('r2', { name: 'Two' }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    expect(
      loadedRelations(base)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['r1', 'r2'])
  })

  it('uses the local version of a relation that was edited, and drops a deleted one', () => {
    const base = new Graph(context, [
      relation('r1', { name: 'Old' }),
      relation('r2', { name: 'Gone' }),
    ])
    const local = new Graph(base)
    local.replace(relation('r1', { name: 'New' }))
    local.remove(base.entity('r2'))
    const relations = loadedRelations(local)
    expect(relations.map((r) => r.id)).toEqual(['r1'])
    expect(relations[0]?.tags.name).toBe('New')
  })

  it('includes a relation that only exists in the local edits', () => {
    const base = new Graph(context, [relation('r1', { name: 'Base' })])
    const local = new Graph(base)
    local.replace(relation('r9', { name: 'Added' }))
    expect(
      loadedRelations(local)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['r1', 'r9'])
  })
})

describe('relationLabel', () => {
  it('uses the name first', () => {
    expect(relationLabel(relation('r1', { name: 'Ring road', ref: 'A1', type: 'route' }))).toBe(
      'Ring road',
    )
  })

  it('uses the ref with the type in front', () => {
    expect(relationLabel(relation('r1', { ref: '100', type: 'route' }))).toBe('route 100')
  })

  it('uses the type alone when there is no name or ref', () => {
    expect(relationLabel(relation('r1', { type: 'multipolygon' }))).toBe('multipolygon')
  })

  it('falls back to "Relation" and ignores blank tags', () => {
    expect(relationLabel(relation('r1', {}))).toBe('Relation')
    expect(relationLabel(relation('r1', { name: '  ', ref: '' }))).toBe('Relation')
  })

  it('uses the ref alone when there is no type', () => {
    expect(relationLabel(relation('r1', { ref: '7' }))).toBe('7')
  })
})

describe('memberLabel', () => {
  it('uses the name, else the main tag, else nothing', () => {
    expect(memberLabel({ name: 'Main Street', highway: 'residential' })).toBe('Main Street')
    expect(memberLabel({ highway: 'residential', source: 'survey' })).toBe('highway=residential')
    expect(memberLabel({ source: 'survey' })).toBeUndefined()
    expect(memberLabel(undefined)).toBeUndefined()
  })
})

describe('membershipsOf', () => {
  it('lists each parent relation with the member index and role', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'w1', type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'stop' },
      ]),
      relation('r2', { type: 'site' }, [{ id: 'n1', type: 'node', role: 'member' }]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    const found = membershipsOf(base, 'n1').map((m) => [m.relation.id, m.index, m.role])
    expect(found).toEqual([
      ['r1', 1, 'stop'],
      ['r2', 0, 'member'],
    ])
  })

  it('gives an entity that is in one relation twice two entries', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [
        { id: 'n1', type: 'node', role: 'stop' },
        { id: 'w1', type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'platform' },
      ]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
      new OsmWay(context, { id: 'w1', nodes: ['n1'], tags: {} }),
    ])
    const found = membershipsOf(base, 'n1').map((m) => [m.index, m.role])
    expect(found).toEqual([
      [0, 'stop'],
      [2, 'platform'],
    ])
  })

  it('forgets a relation that was deleted in the local edits', () => {
    const base = new Graph(context, [
      relation('r1', { type: 'route' }, [{ id: 'n1', type: 'node', role: 'stop' }]),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
    ])
    const local = new Graph(base)
    local.remove(base.entity('r1'))
    expect(membershipsOf(local, 'n1')).toEqual([])
  })

  it('is empty for an entity that is in no relation or does not exist', () => {
    const base = new Graph(context, [new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} })])
    expect(membershipsOf(base, 'n1')).toEqual([])
    expect(membershipsOf(base, 'n404')).toEqual([])
  })
})

describe('joinableRelations', () => {
  it('leaves out the entity itself and the relations it is already in, sorted by label', () => {
    const base = new Graph(context, [
      relation('r1', { name: 'Zeta' }, [{ id: 'n1', type: 'node', role: '' }]),
      relation('r2', { name: 'Alpha' }),
      relation('r3', { ref: '5', type: 'route' }),
      new OsmNode(context, { id: 'n1', loc: [0, 0], tags: {} }),
    ])
    expect(joinableRelations(base, 'n1').map((r) => r.id)).toEqual(['r2', 'r3'])
  })
})
