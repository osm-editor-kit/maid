// Maid's own test: actionDeleteMembers leaves the caller's index array as it was.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, actionDeleteMembers } from '../../src/index.ts'

describe('actionDeleteMembers', () => {
  it('removes the members and does not reorder the given indexes', () => {
    const context = new ModelContext()
    const graph = new Graph(context, [
      new OsmNode(context, { id: 'n1', loc: [0, 0] }),
      new OsmNode(context, { id: 'n2', loc: [1, 0] }),
      new OsmNode(context, { id: 'n3', loc: [2, 0] }),
      new OsmRelation(context, {
        id: 'r1',
        members: [
          { id: 'n1', type: 'node', role: '' },
          { id: 'n2', type: 'node', role: '' },
          { id: 'n3', type: 'node', role: '' },
        ],
      }),
    ])
    const indexes = [0, 2]
    const result = actionDeleteMembers('r1', indexes)(new Graph(graph))
    expect((result.entity('r1') as OsmRelation).members.map((m) => m.id)).toEqual(['n2'])
    expect(indexes).toEqual([0, 2])
  })
})
