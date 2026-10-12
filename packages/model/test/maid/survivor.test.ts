// Maid's own tests (not from Rapid): the survivor rule of connect, merge, merge_nodes and merge_polygon.
// The product owner's rule: the older node wins, and existing entities are kept before new ones.
// Test ids without a version cannot be ordered, so Rapid's rule applies to them (see utilSurvivorID).
import { describe, expect, it } from 'bun:test'
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  actionConnect,
  actionMerge,
  actionMergeNodes,
  actionMergePolygon,
  utilIsExistingEntity,
  utilSurvivorID,
} from '../../src/index.ts'

describe('utilIsExistingEntity', () => {
  it('a positive numeric id exists, a new one does not', () => {
    expect(utilIsExistingEntity({ id: 'n12' })).toBe(true)
    expect(utilIsExistingEntity({ id: 'n-1' })).toBe(false)
  })

  it('a test id exists only with a version', () => {
    expect(utilIsExistingEntity({ id: 'b' })).toBe(false)
    expect(utilIsExistingEntity({ id: 'b', version: 1 })).toBe(true)
  })
})

describe('utilSurvivorID', () => {
  it('returns undefined for no entities', () => {
    expect(utilSurvivorID([])).toBeUndefined()
  })

  it('an existing entity beats a new one', () => {
    expect(utilSurvivorID([{ id: 'n-1' }, { id: 'n7' }])).toBe('n7')
    expect(utilSurvivorID([{ id: 'n7' }, { id: 'n-1' }])).toBe('n7')
  })

  it('among existing entities the smallest id wins', () => {
    expect(utilSurvivorID([{ id: 'n9' }, { id: 'n3' }, { id: 'n-2' }])).toBe('n3')
  })

  it('among new entities the one closest to zero wins, as in iD', () => {
    expect(utilSurvivorID([{ id: 'n-3' }, { id: 'n-1' }])).toBe('n-1')
  })

  it('a versioned test id counts as existing', () => {
    expect(utilSurvivorID([{ id: 'n-1' }, { id: 'a', version: 1 }])).toBe('a')
  })

  it('test ids without a version have no order: undefined, so the caller keeps its rule', () => {
    expect(utilSurvivorID([{ id: 'a' }, { id: 'n5' }])).toBeUndefined()
    expect(utilSurvivorID([{ id: 'a' }, { id: 'b' }])).toBeUndefined()
  })

  it('several versioned test ids have no numeric order: undefined', () => {
    expect(utilSurvivorID([{ id: 'a', version: 1 }, { id: 'b', version: 2 }])).toBeUndefined()
  })
})

describe('the oldest existing entity survives (product owner)', () => {
  const context = new ModelContext()

  // The old node n5 (tagged), a newer existing node n900 (tagged) and a new node n-1 (tagged).
  const nodes = () => [
    new OsmNode(context, { id: 'n5', loc: [0, 0], tags: { highway: 'give_way' } }),
    new OsmNode(context, { id: 'n900', loc: [1, 1], tags: { crossing: 'marked' } }),
    new OsmNode(context, { id: 'n-1', loc: [2, 2], tags: { note: 'new' } }),
  ]
  const orders = [
    ['n5', 'n900', 'n-1'],
    ['n-1', 'n900', 'n5'],
    ['n900', 'n-1', 'n5'],
  ]

  it('connect: n5 survives in any order, keeps its tags and gets the others', () => {
    for (const order of orders) {
      const base = new Graph(context, [
        ...nodes(),
        new OsmWay(context, { id: 'w10', nodes: ['n-1', 'n20'] }),
        new OsmWay(context, { id: 'w11', nodes: ['n900', 'n21'] }),
      ])
      const result = actionConnect(order)(new Graph(base))

      expect(result.hasEntity('n900')).toBeUndefined()
      expect(result.hasEntity('n-1')).toBeUndefined()
      const survivor = result.entity('n5') as OsmNode
      expect(survivor.tags).toEqual({ highway: 'give_way', crossing: 'marked', note: 'new' })
      expect((result.entity('w10') as OsmWay).nodes).toEqual(['n5', 'n20'])
      expect((result.entity('w11') as OsmWay).nodes).toEqual(['n5', 'n21'])
    }
  })

  it('merge_nodes: n5 survives in any order and gets the tags of the others', () => {
    for (const order of orders) {
      const base = new Graph(context, nodes())
      const result = actionMergeNodes(order)(new Graph(base))

      expect(result.hasEntity('n900')).toBeUndefined()
      expect(result.hasEntity('n-1')).toBeUndefined()
      expect((result.entity('n5') as OsmNode).tags).toEqual({ highway: 'give_way', crossing: 'marked', note: 'new' })
    }
  })

  it('merge: a point n5 takes the place of a new child node and keeps its id, in either order', () => {
    for (const order of [['n5', 'w10'], ['w10', 'n5']]) {
      const base = new Graph(context, [
        new OsmNode(context, { id: 'n5', loc: [9, 9], tags: { highway: 'give_way' } }),
        new OsmNode(context, { id: 'n900', loc: [0, 0] }),
        new OsmNode(context, { id: 'n-1', loc: [1, 1] }),
        new OsmNode(context, { id: 'n20', loc: [2, 2] }),
        new OsmWay(context, { id: 'w10', nodes: ['n900', 'n-1', 'n20'], tags: { highway: 'footway' } }),
      ])
      const result = actionMerge(order)(new Graph(base))

      expect(result.hasEntity('n-1')).toBeUndefined()
      expect(result.hasEntity('n5')).toBeTruthy()
      expect(result.hasEntity('n900')).toBeTruthy()
      expect((result.entity('w10') as OsmWay).nodes).toEqual(['n900', 'n5', 'n20'])
      expect((result.entity('n5') as OsmNode).loc).toEqual([1, 1])
      // the point's tags move to the way, as iD does; the way's own highway value is kept as a multi value
      expect(result.entity('w10').tags).toEqual({ highway: 'footway;give_way' })
    }
  })

  it('merge_polygon: the older relation r5 survives in either order and keeps its tags', () => {
    for (const order of [['r-1', 'r5'], ['r5', 'r-1']]) {
      const base = new Graph(context, [
        new OsmNode(context, { id: 'n0', loc: [0, 0] }),
        new OsmNode(context, { id: 'n1', loc: [5, 0] }),
        new OsmNode(context, { id: 'n2', loc: [5, 5] }),
        new OsmNode(context, { id: 'n3', loc: [0, 5] }),
        new OsmNode(context, { id: 'n4', loc: [1, 1] }),
        new OsmNode(context, { id: 'n5', loc: [4, 1] }),
        new OsmNode(context, { id: 'n6', loc: [4, 4] }),
        new OsmNode(context, { id: 'n7', loc: [1, 4] }),
        new OsmWay(context, { id: 'w0', nodes: ['n0', 'n1', 'n2', 'n3', 'n0'] }),
        new OsmWay(context, { id: 'w1', nodes: ['n4', 'n5', 'n6', 'n7', 'n4'] }),
        new OsmRelation(context, {
          id: 'r5',
          tags: { type: 'multipolygon', name: 'lake' },
          members: [{ id: 'w0', type: 'way', role: 'outer' }],
        }),
        new OsmRelation(context, {
          id: 'r-1',
          tags: { type: 'multipolygon', natural: 'water' },
          members: [{ id: 'w1', type: 'way', role: 'outer' }],
        }),
      ])
      const result = actionMergePolygon(order)(new Graph(base))

      expect(result.hasEntity('r-1')).toBeUndefined()
      const survivor = result.entity('r5') as OsmRelation
      expect(survivor.tags).toEqual({ type: 'multipolygon', name: 'lake', natural: 'water' })
      expect(survivor.memberById('w0')?.role).toEqual('outer')
      expect(survivor.memberById('w1')?.role).toEqual('inner')
    }
  })
})
