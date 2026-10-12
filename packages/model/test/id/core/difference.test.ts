// Adopted from iD test/spec/core/difference.js (ISC, © iD contributors), at commit 0194f3926.
// Most of iD's difference tests are covered by test/data/Difference.test.js (see docs/research/id-tests/core.md).
import { describe, expect, it } from 'bun:test'
import * as Rapid from '../../rapid.ts'
import { Difference } from '../../../src/lib/Difference.ts'

describe('iD.coreDifference', () => {
  describe('#summary', () => {
    const context = new Rapid.MockContext()
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', tags: { crossing: 'marked' } }),
      new Rapid.OsmNode(context, { id: 'b' }),
      new Rapid.OsmNode(context, { id: 'v' }),
      new Rapid.OsmNode(context, { id: 'p', tags: { power: 'pole' } }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'] }),
    ])

    it('reports a vertex as modified when it was previously a point', () => {
      const node = base.entity('p').mergeTags({ ref: '42' })
      const way = base.entity('-').addNode('p')
      const head = new Rapid.Graph(base).replace(way).replace(node)
      const diff = new Difference(base, head)
      const summary = [...diff.summary().values()]

      // iD reports the way and the former point, both as modified, in this order
      expect(summary).toHaveLength(2)
      expect(summary[0]).toMatchObject({ changeType: 'modified' })
      expect(summary[0]!.entity).toBe(way)
      expect(summary[0]!.graph).toBe(head)
      expect(summary[1]).toMatchObject({ changeType: 'modified' })
      expect(summary[1]!.entity).toBe(node)
      expect(summary[1]!.graph).toBe(head)
    })
  })

  describe('#extantIDs', () => {
    // needs F-core-4
    it.todo('includes the ids of created entities')
    // needs F-core-4
    it.todo('includes the ids of modified entities')
    // needs F-core-4
    it.todo('omits the ids of deleted entities')
    // needs F-core-4
    it.todo('omits the ids of members of modified relations by default')
    // needs F-core-4
    it.todo('includes the ids of members of modified relations with option')
  })
})
