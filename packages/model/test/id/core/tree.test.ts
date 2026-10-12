// Adopted from iD test/spec/core/tree.js (ISC, © iD contributors), at commit 0194f3926.
// iD's tree is graph-aware: it answers for one graph version and follows parent ways and relations.
// Maid's spatial index (src/spatial/SpatialIndex.ts) holds items by box and id; EditHistory keeps it in step
// with the difference (complete()). The tests below check the index and not the graph, where they can.
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import { SpatialIndex } from '../../../src/spatial/SpatialIndex.ts'

const context = new Rapid.MockContext()

describe('iD.coreTree', () => {
  describe('#rebase', () => {
    it('is idempotent', () => {
      const index = new SpatialIndex()
      const item = { id: 'n', minX: 1, minY: 1, maxX: 1, maxY: 1, contents: 'n' }
      index.replaceItems('tree', [item])
      index.replaceItems('tree', [item])
      expect(index.getAllItems('tree')).toHaveLength(1)
    })

    // needs F-core-3
    it.todo('does not insert if entity has a modified version')

    it('does not error on self-referencing relations', () => {
      const relation = new Rapid.OsmRelation(context, {
        id: 'r1',
        members: [
          { id: 'n', type: 'node', role: '' },
          { id: 'r1', type: 'relation', role: '' },
        ],
      })
      const index = new SpatialIndex()
      const item = { id: relation.id, minX: 1, minY: 1, maxX: 1, maxY: 1, contents: relation }
      expect(() => index.replaceItems('tree', [item])).not.toThrow()
      expect(index.hasItem('tree', 'r1')).toBe(true)
    })

    // needs F-core-3
    it.todo('adjusts entities that are force-rebased')
  })

  describe('#intersects', () => {
    // needs F-core-3
    it.todo('includes intersecting relations after incomplete members are loaded')
    // needs F-core-3
    it.todo('includes intersecting ways after missing nodes are loaded')
    // needs F-core-3
    it.todo('adjusts parent ways when a member node is moved')
    // needs F-core-3
    it.todo('adjusts parent relations when a member node is moved')
    // needs F-core-3
    it.todo('adjusts all parent relations when a member node is moved')
    // needs F-core-3
    it.todo('adjusts parent relations of parent ways when a member node is moved')
    // needs F-core-3
    it.todo('adjusts parent ways when a member node is removed')
    // needs F-core-3
    it.todo("don't include parent way multiple times when multiple child nodes are moved")
    // needs F-core-3
    it.todo("doesn't include removed entities after rebase")
    // needs F-core-3
    it.todo('handles recursive relations')
  })
})
