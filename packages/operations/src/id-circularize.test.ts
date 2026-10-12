// Adopted from iD test/spec/operations/circularize.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: `available()` is `applies`, `disabled()` returns a sentence or undefined (iD: a
// reason code or false). The reason codes are compared through the sentences of the same reasons.
import { beforeEach, describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { circularizeOperation } from './operations.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()

/** iD's reason code `not_closed`, as Maid says it: one feature, and several */
const NOT_CLOSED = "This can't be made round because it is not a loop."
const NOT_CLOSED_SEVERAL = "These can't be made round because they are not loops."

describe('iD.operationCircularize', () => {
  let graph: Graph

  /** iD's operation for a selection of ids on the current graph */
  const at = (selected: string[]): OperationContext => ({ graph, selected })

  const node = (id: string, loc: [number, number]) => new OsmNode(context, { id, loc })
  const way = (id: string, nodes: string[]) => new OsmWay(context, { id, nodes })
  const load = (entities: OsmEntity[]) => {
    graph = new Graph(context, entities)
  }

  describe('#available', () => {
    beforeEach(() => {
      load([
        node('n1', [0, 0]),
        node('n2', [0, 1]),
        node('n3', [1, 1]),
        node('n11', [10, 0]),
        node('n12', [10, 1]),
        node('n13', [11, 1]),
        way('w1', ['n1', 'n2']),
        way('w2', ['n1', 'n2', 'n3', 'n1']),
        way('w3', ['n11', 'n12', 'n13', 'n11']),
        way('w4', ['n11', 'n12']),
        way('w5', ['n12', 'n13']),
        way('w6', ['n13', 'n11']),
      ])
    })

    it('is not available for no selected ids', () => {
      expect(circularizeOperation.applies(at([]))).toBeFalsy()
    })

    it('is disabled for way with only 2 nodes', () => {
      expect(circularizeOperation.applies(at(['w1']))).toBeTruthy()
      expect(circularizeOperation.disabled(at(['w1']))).toBe(NOT_CLOSED)
    })

    it('is available for a closed way', () => {
      expect(circularizeOperation.applies(at(['w2']))).toBeTruthy()
      // iD: false, which means not disabled
      expect(circularizeOperation.disabled(at(['w2']))).toBeUndefined()
    })

    it('is disabled for an unclosed way', () => {
      expect(circularizeOperation.applies(at(['w4']))).toBeTruthy()
      expect(circularizeOperation.disabled(at(['w4']))).toBe(NOT_CLOSED)
    })

    it('is available for a multiselection of closed ways', () => {
      expect(circularizeOperation.applies(at(['w2', 'w3']))).toBeTruthy()
      expect(circularizeOperation.disabled(at(['w2', 'w3']))).toBeUndefined()
    })

    it.todo('is available for a multiselection of unclosed ways forming a ring', () => {}) // needs F-ops-1

    it('is disabled for a multiselection of unclosed ways not forming a ring', () => {
      expect(circularizeOperation.applies(at(['w4', 'w6']))).toBeTruthy()
      expect(circularizeOperation.disabled(at(['w4', 'w6']))).toBe(NOT_CLOSED_SEVERAL)
    })

    it('is not available for a multiselection of a closed way and a non-way entity', () => {
      expect(circularizeOperation.applies(at(['w2', 'n11']))).toBeFalsy()
    })

    it('is available for a multiselection of a closed way and some unclosed ways forming a loop', () => {
      expect(circularizeOperation.applies(at(['w2', 'w4', 'w5', 'w6']))).toBeTruthy()
      // the closed way can run, so the selection is not disabled (Maid does not join w4 to w6)
      expect(circularizeOperation.disabled(at(['w2', 'w4', 'w5', 'w6']))).toBeUndefined()
    })

    it('is available for a multiselection of a closed way and some unclosed ways not forming a loop', () => {
      expect(circularizeOperation.applies(at(['w2', 'w4', 'w5']))).toBeTruthy()
      expect(circularizeOperation.disabled(at(['w2', 'w4', 'w5']))).toBeUndefined()
    })

    it.todo('performs operation without creating superfluous entities', () => {}) // needs F-ops-1
  })
})
