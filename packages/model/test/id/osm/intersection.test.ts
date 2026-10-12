// Adopted from iD test/spec/osm/intersection.js (ISC, © iD contributors), at commit 0194f3926.
// The other tests of this file are covered by packages/model/test/lib/intersection.test.js (same titles, same assertions,
// except 'restricts turns with a restriction relation', which tests the same behaviour with a relation without a restriction value).
import { beforeAll, describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';
import osmRulesets from '../../../src/schema/osm_rulesets.json5';

describe('iD.osmIntersection', function () {
  const context = new Rapid.MockContext();
  context.systems.schema = new Rapid.SchemaSystem(context);
  const maxDist = Infinity;

  beforeAll(() => {
    const schema = context.systems.schema;
    schema.requestedAssetIDs = '';
    return schema.initAsync().then(() => schema.merge(osmRulesets));
  });

  describe('highways', function () {
    it('includes line highways', function () {
      const graph = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'u', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: '*', loc: [1, 0] }),
        new Rapid.OsmNode(context, { id: 'w', loc: [2, 0] }),
        new Rapid.OsmWay(context, { id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['*', 'w'] }),
      ]);
      const result = Rapid.osmIntersection(context, graph, '*', maxDist).ways;
      expect(result.map(function (i) { return i.id; })).toEqual(['=']);
    });
  });

  describe('#turns', function () {
    it('restricts turns with a no_* restriction relation', function () {
      // u ==== * ---> w
      const graph = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'u', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: '*', loc: [1, 0] }),
        new Rapid.OsmNode(context, { id: 'w', loc: [2, 0] }),
        new Rapid.OsmWay(context, { id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } }),
        new Rapid.OsmRelation(context, {
          id: 'r',
          tags: { type: 'restriction', restriction: 'no_straight_on' },
          members: [
            { id: '=', role: 'from', type: 'way' },
            { id: '-', role: 'to', type: 'way' },
            { id: '*', role: 'via', type: 'node' },
          ],
        }),
      ]);
      const turns = Rapid.osmIntersection(context, graph, '*', maxDist).turns('=');

      expect(turns.length).toEqual(2);

      expect(turns[0]).toBeInstanceOf(Rapid.osmTurn);
      expect(turns[0].key).toEqual('=_*_=');
      expect(turns[0].u).toBe(true);

      expect(turns[1]).toBeInstanceOf(Rapid.osmTurn);
      expect(turns[1].key).toEqual('=_*_-');
      expect(turns[1].u).toBeFalsy();
      expect(turns[1].restrictionID).toEqual('r');
      expect(turns[1].direct).toBe(true);
      expect(turns[1].only).toBeFalsy();
    });
  });
});
