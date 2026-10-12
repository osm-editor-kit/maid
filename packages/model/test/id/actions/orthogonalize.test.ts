// Adopted from iD test/spec/actions/orthogonalize.js (ISC, © iD contributors), at commit 0194f3926.
// Only the iD test that has no counterpart in test/actions/orthogonalize.test.js is here. The other 39 pair with
// Rapid's tests by title (see the report). iD passes an identity projection; Maid's action projects itself,
// and the input is the same planar layout, used as lon/lat, as in Rapid's tests.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionOrthogonalize', () => {
  const context = new Rapid.MockContext();

  describe('closed paths', () => {
    it('preserves a way\'s duplicate vertices', () => {
      // #9155
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2.1, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2.1, 0] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'e', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const result = Rapid.actionOrthogonalize('-')(graph);
      expect(result.entity('-').nodes.length).toEqual(6);
    });
  });
});
