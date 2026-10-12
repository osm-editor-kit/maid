// Adopted from iD test/spec/operations/delete.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: iD's fake context and `enter` become the result of `run`: `select` is asked with the
// graph the actions left behind, where iD's test reads `selectedIDs()` of the mode it entered.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteOperation } from './operations.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()

/** Runs delete on a selection as the editor does: the actions on a copy of the graph */
function perform(entities: OsmEntity[], selected: string[]) {
  const base = new Graph(context, entities)
  const ctx: OperationContext = { graph: new Graph(base), selected }
  expect(deleteOperation.applies(ctx)).toBe(true)
  expect(deleteOperation.disabled(ctx)).toBeUndefined()
  const result = deleteOperation.run(ctx)
  const after = result.actions.reduce((g, action) => action(g), new Graph(base))
  return { after, selected: result.select?.(after) }
}

describe('iD.operationDelete', () => {
  describe('selects next node automatically', () => {
    it('selects next node after deleting first node of a way', () => {
      const { after, selected } = perform(
        [
          new OsmNode(context, { id: 'n1' }),
          new OsmNode(context, { id: 'n2' }),
          new OsmNode(context, { id: 'n3' }),
          new OsmWay(context, { id: 'w', nodes: ['n1', 'n2', 'n3'] }),
        ],
        ['n1'],
      )
      expect(after.hasEntity('w')).toBeTruthy()
      expect(selected).toEqual(['n2'])
    })

    it('selects previous node after deleting last node of a way', () => {
      const { after, selected } = perform(
        [
          new OsmNode(context, { id: 'n1' }),
          new OsmNode(context, { id: 'n2' }),
          new OsmNode(context, { id: 'n3' }),
          new OsmNode(context, { id: 'n4' }),
          new OsmWay(context, { id: 'w', nodes: ['n1', 'n2', 'n3', 'n4'] }),
        ],
        ['n4'],
      )
      expect(after.hasEntity('w')).toBeTruthy()
      expect(selected).toEqual(['n3'])
    })

    it('selects nearest node after deleting a middle node of a way', () => {
      const { after, selected } = perform(
        [
          new OsmNode(context, { id: 'n1', loc: [0, 0] }),
          new OsmNode(context, { id: 'n2', loc: [1, 0] }),
          new OsmNode(context, { id: 'n3', loc: [3, 0] }),
          new OsmWay(context, { id: 'w', nodes: ['n1', 'n2', 'n3'] }),
        ],
        ['n2'],
      )
      expect(after.hasEntity('w')).toBeTruthy()
      expect(selected).toEqual(['n1'])
    })

    it('does not crash for a single-noded way', () => {
      // https://github.com/openstreetmap/iD/issues/9007
      const { after, selected } = perform(
        [new OsmNode(context, { id: 'n' }), new OsmWay(context, { id: 'w', nodes: ['n'] })],
        ['n'],
      )
      expect(after.hasEntity('w')).toBeFalsy()
      expect(selected).toEqual([])
    })
  })
})
