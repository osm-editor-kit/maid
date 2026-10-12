// Adopted from iD test/spec/operations/straighten.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: `available()` is `applies`. The iD nodes have no position; Maid's nodes need one,
// so each gets a distinct one (applicability does not depend on positions).
import { beforeEach, describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { straightenOperation } from './operations.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()

describe('iD.operationStraighten', () => {
  let graph: Graph

  const at = (selected: string[]): OperationContext => ({ graph, selected })
  const load = (entities: OsmEntity[]) => {
    graph = new Graph(context, entities)
  }
  /** Nodes need a position in Maid; the positions do not affect what is straightenable */
  const nodes = (...ids: string[]) =>
    ids.map((id, i) => new OsmNode(context, { id, loc: [i * 0.001, 0] }))

  describe('#available', () => {
    beforeEach(() => {
      // w1 - way with 2 nodes
      // w1-2 - way with 2 nodes connected to w1
      // w2 - way with 3 nodes connected to w1
      // w3 - way with 3 nodes connected to w2
      // w4 - way with 3 nodes connected to w3
      // w5 - way with 4 nodes not connected to any other nodes
      load([
        ...nodes(
          'n1',
          'n2',
          'n2-1',
          'n3',
          'n4',
          'n5',
          'n6',
          'n7',
          'n8',
          'n9',
          'n10',
          'n11',
          'n12',
          'n13',
        ),
        new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'] }),
        new OsmWay(context, { id: 'w1-2', nodes: ['n2', 'n2-1'] }),
        new OsmWay(context, { id: 'w2', nodes: ['n2', 'n3', 'n4'] }),
        new OsmWay(context, { id: 'w2-2', nodes: ['n4', 'n13', 'n2'] }), // w-2 reversed
        new OsmWay(context, { id: 'w3', nodes: ['n4', 'n5', 'n6'] }),
        new OsmWay(context, { id: 'w4', nodes: ['n6', 'n7', 'n8'] }),
        new OsmWay(context, { id: 'w5', nodes: ['n9', 'n10', 'n11', 'n12'] }),
      ])
    })

    it('is not available for no selected ids', () => {
      expect(straightenOperation.applies(at([]))).toBeFalsy()
    })

    it('is not available for way with only 2 nodes', () => {
      expect(straightenOperation.applies(at(['w1']))).toBeFalsy()
    })

    it('is available for way with only 2 nodes connected to another 2-node way', () => {
      expect(straightenOperation.applies(at(['w1', 'w1-2']))).toBeTruthy()
    })

    it('is not available for non-continuous ways', () => {
      expect(straightenOperation.applies(at(['w2', 'w4']))).toBeFalsy()
    })

    it('is available for selected way with more than 2 nodes', () => {
      expect(straightenOperation.applies(at(['w2']))).toBeTruthy()
    })

    it('is available for selected, ordered, continuous ways', () => {
      expect(straightenOperation.applies(at(['w1', 'w2', 'w3']))).toBeTruthy()
    })

    it('is available for selected, un-ordered, continuous ways', () => {
      expect(straightenOperation.applies(at(['w1', 'w3', 'w2']))).toBeTruthy()
    })

    it('is available for selected, continuous ways with different way-directions', () => {
      expect(straightenOperation.applies(at(['w1', 'w3', 'w2-2']))).toBeTruthy()
    })

    it('is available for 2 selected nodes in the same way, more than one node apart', () => {
      expect(straightenOperation.applies(at(['w5', 'n9', 'n11']))).toBeTruthy()
    })

    it('is available for 2 selected nodes in adjacent ways, more than one node apart', () => {
      expect(straightenOperation.applies(at(['w2', 'w3', 'n5', 'n3']))).toBeTruthy()
    })

    it('is available for 2 selected nodes in non-adjacent ways, providing in between ways are selected', () => {
      expect(straightenOperation.applies(at(['n2', 'n7', 'w4', 'w1', 'w3', 'w2']))).toBeTruthy()
    })

    it('is available for 2 selected nodes in non-adjacent, non-same-directional ways, providing in between ways are selected', () => {
      expect(straightenOperation.applies(at(['n2', 'n7', 'w4', 'w1', 'w3', 'w2-2']))).toBeTruthy()
    })

    it('is not available for nodes not on selected ways', () => {
      expect(straightenOperation.applies(at(['w5', 'n4', 'n11']))).toBeFalsy()
    })

    it('is not available for one selected node', () => {
      expect(straightenOperation.applies(at(['w5', 'n9']))).toBeFalsy()
    })

    it('is not available for more than two selected nodes', () => {
      expect(straightenOperation.applies(at(['w5', 'n9', 'n11', 'n12']))).toBeFalsy()
    })
  })
})
