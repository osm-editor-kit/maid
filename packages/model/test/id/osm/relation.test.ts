// Adopted from iD test/spec/osm/relation.js (ISC, © iD contributors), at commit 0194f3926.
// The covered tests of this file are in packages/model/test/data/OsmRelation.test.js (its multipolygon block included)
// and OsmEntity.test.js (creationOrder). The two winding-order tests are n/a, see osm.md.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

const context = new Rapid.MockContext();

describe('iD.osmRelation', function () {
  // needs F-osm-4
  it.todo('freezes nodes');

  describe('#asGeoJSON', function () {
    it('forces clockwise winding order for outer multipolygon ways', function () {
      const a = new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] });
      const b = new Rapid.OsmNode(context, { id: 'b', loc: [0, 1] });
      const c = new Rapid.OsmNode(context, { id: 'c', loc: [1, 0] });
      const w = new Rapid.OsmWay(context, { id: 'w', nodes: [a.id, c.id, b.id, a.id] });
      const r = new Rapid.OsmRelation(context, { id: 'r', tags: { type: 'multipolygon' }, members: [{ id: w.id, type: 'way' }] });
      const g = new Rapid.Graph(context, [a, b, c, w, r]);
      const json = r.asGeoJSON(g).geometry;

      expect(json.coordinates[0][0]).toEqual([a.loc, b.loc, c.loc, a.loc]);
    });

    it('forces counterclockwise winding order for inner multipolygon ways', function () {
      const a = new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] });
      const b = new Rapid.OsmNode(context, { id: 'b', loc: [0, 1] });
      const c = new Rapid.OsmNode(context, { id: 'c', loc: [1, 0] });
      const d = new Rapid.OsmNode(context, { id: 'd', loc: [0.1, 0.1] });
      const e = new Rapid.OsmNode(context, { id: 'e', loc: [0.1, 0.2] });
      const f = new Rapid.OsmNode(context, { id: 'f', loc: [0.2, 0.1] });
      const outer = new Rapid.OsmWay(context, { id: 'outer', nodes: [a.id, b.id, c.id, a.id] });
      const inner = new Rapid.OsmWay(context, { id: 'inner', nodes: [d.id, e.id, f.id, d.id] });
      const r = new Rapid.OsmRelation(context, { id: 'r', members: [{ id: outer.id, type: 'way' }, { id: inner.id, role: 'inner', type: 'way' }] });
      const g = new Rapid.Graph(context, [a, b, c, d, e, f, outer, inner, r]);

      expect(r.multipolygon(g)[0][1]).toEqual([d.loc, f.loc, e.loc, d.loc]);
    });
  });

  describe('#hasFromViaTo', function () {
    it('returns true if the `intersection` role is used instead of `via` for destination signs', () => {
      const r = new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'destination_sign' },
        members: [
          { role: 'from', id: 'f', type: 'way' },
          { role: 'intersection', id: 'v', type: 'node' },
          { role: 'to', id: 't', type: 'way' },
        ],
      });
      expect(r.hasFromViaTo()).toBe(true);
    });

    it('returns false if the `intersection` role is used on anything other than a destination sign', () => {
      const r = new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'restriction' },
        members: [
          { role: 'from', id: 'f', type: 'way' },
          { role: 'intersection', id: 'v', type: 'node' },
          { role: 'to', id: 't', type: 'way' },
        ],
      });
      expect(r.hasFromViaTo()).toBe(false);
    });
  });
});
