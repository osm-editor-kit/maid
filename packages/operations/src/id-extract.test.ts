// Adopted from iD test/spec/operations/extract.js (ISC, © iD contributors), at commit 0194f3926.
// API changes: `available()` is `applies`; `disabled()` returns undefined where iD returns a falsy
// value (Maid has no disabled state for extract: iD's only one is about the visible map).
import { beforeEach, describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { extractOperation } from './operations.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()

describe('iD.operationExtract', () => {
  let graph: Graph

  const at = (selected: string[]): OperationContext => ({ graph, selected })
  const load = (entities: OsmEntity[]) => {
    graph = new Graph(context, entities)
  }

  const fakeTags = { name: 'fake' }

  // Set up graph
  const createFakeNode = (id: string, hasTags: boolean) =>
    new OsmNode(context, { id, loc: [0, 0], tags: hasTags ? fakeTags : {} })

  describe('available', () => {
    beforeEach(() => {
      // a - node with tags & parent way
      // b - node with tags & 2 parent ways
      // c - node with no tags, parent way
      // d - node with no tags, 2 parent ways
      // e - node with tags, no parent way
      // f - node with no tags, no parent way
      load([
        createFakeNode('a', true),
        createFakeNode('b', true),
        createFakeNode('c', false),
        createFakeNode('d', false),
        createFakeNode('e', true),
        createFakeNode('f', false),
        new OsmWay(context, { id: 'x', nodes: ['a', 'b', 'c', 'd'] }),
        new OsmWay(context, { id: 'y', nodes: ['b', 'd'] }),
      ])
    })

    it('is not available for no selected ids', () => {
      expect(extractOperation.applies(at([]))).toBeFalsy()
    })

    it('is not available for unknown selected id', () => {
      expect(extractOperation.applies(at(['z']))).toBeFalsy()
    })

    it('is not available for selected way', () => {
      expect(extractOperation.applies(at(['x']))).toBeFalsy()
    })

    it('is not available for selected node with tags, no parent way', () => {
      expect(extractOperation.applies(at(['e']))).toBeFalsy()
    })

    it('is not available for selected node with no tags, no parent way', () => {
      expect(extractOperation.applies(at(['f']))).toBeFalsy()
    })

    it('is not available for selected node with no tags, parent way', () => {
      expect(extractOperation.applies(at(['c']))).toBeFalsy()
    })

    it('is not available for selected node with no tags, two parent ways', () => {
      expect(extractOperation.applies(at(['d']))).toBeFalsy()
    })

    it('is available for selected node with tags, parent way', () => {
      expect(extractOperation.applies(at(['a']))).toBeTruthy()
    })

    it('is available for selected node with tags, two parent ways', () => {
      expect(extractOperation.applies(at(['b']))).toBeTruthy()
    })

    it('is available for two selected nodes with tags and parent ways', () => {
      expect(extractOperation.applies(at(['a', 'b']))).toBeTruthy()
    })
  })

  describe('disabled', () => {
    it('returns enabled for non-related node', () => {
      load([
        createFakeNode('a', false),
        createFakeNode('b', true),
        createFakeNode('c', false),
        new OsmWay(context, { id: 'x', nodes: ['a', 'b', 'c'] }),
      ])
      expect(extractOperation.disabled(at(['b']))).toBeFalsy()
    })

    it('returns enabled for non-restriction related node', () => {
      load([
        createFakeNode('a', false),
        createFakeNode('b', true),
        createFakeNode('c', false),
        new OsmWay(context, { id: 'x', nodes: ['a', 'b', 'c'] }),
        new OsmRelation(context, { id: 'r', members: [{ id: 'b', type: 'node', role: 'label' }] }),
      ])
      expect(extractOperation.disabled(at(['b']))).toBeFalsy()
    })

    it('returns enabled for via node in restriction', () => {
      // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
      // from & to roles are only appropriate for Ways
      load([
        createFakeNode('a', false),
        createFakeNode('b', false),
        createFakeNode('c', false),
        createFakeNode('d', true),
        createFakeNode('e', false),
        createFakeNode('f', false),
        createFakeNode('g', false),
        new OsmWay(context, { id: 'x', nodes: ['a', 'b', 'c'] }),
        new OsmWay(context, { id: 'y', nodes: ['e', 'f', 'g'] }),
        new OsmRelation(context, {
          id: 'r',
          tags: { type: 'restriction', restriction: 'no_right_turn' },
          members: [
            { id: 'x', type: 'way', role: 'from' },
            { id: 'd', type: 'node', role: 'via' },
            { id: 'z', type: 'way', role: 'to' },
          ],
        }),
      ])
      expect(extractOperation.disabled(at(['d']))).toBeFalsy()
    })

    it('returns enabled for location_hint node in restriction', () => {
      // https://wiki.openstreetmap.org/wiki/Relation:restriction indicates that
      // from & to roles are only appropriate for Ways
      load([
        createFakeNode('a', false),
        createFakeNode('b', false),
        createFakeNode('c', false),
        createFakeNode('d', true),
        createFakeNode('e', false),
        createFakeNode('f', false),
        createFakeNode('g', false),
        new OsmWay(context, { id: 'x', nodes: ['a', 'b'] }),
        new OsmWay(context, { id: 'y', nodes: ['e', 'f', 'g'] }),
        new OsmRelation(context, {
          id: 'r',
          tags: { type: 'restriction', restriction: 'no_right_turn' },
          members: [
            { id: 'x', type: 'way', role: 'from' },
            { id: 'c', type: 'node', role: 'via' },
            { id: 'd', type: 'node', role: 'location_hint' },
            { id: 'z', type: 'way', role: 'to' },
          ],
        }),
      ])
      expect(extractOperation.disabled(at(['d']))).toBeFalsy()
    })
  })
})
