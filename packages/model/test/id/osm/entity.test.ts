// Adopted from iD test/spec/osm/entity.js (ISC, © iD contributors), at commit 0194f3926.
// The covered tests of this file are in packages/model/test/data/OsmEntity.test.js and OsmWay.test.js (see osm.md).
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

const context = new Rapid.MockContext();

describe('iD.OsmAbstractEntity', function () {
  // needs F-osm-4
  it.todo('is frozen');
  // needs F-osm-4
  it.todo('freezes tags');
  // needs F-osm-4
  it.todo('freezes node-specific properties such as loc');

  describe('.id', function () {
    describe('.toOSM', function () {
      it('reverses fromOSM, including negative ids', function () {
        expect(Rapid.OsmEntity.toOSM(Rapid.OsmEntity.fromOSM('node', '1'))).toEqual('1');
        expect(Rapid.OsmEntity.toOSM(Rapid.OsmEntity.fromOSM('node', '-1'))).toEqual('-1');
      });

      it('returns the empty string for other strings', function () {
        expect(Rapid.OsmEntity.toOSM('a')).toEqual('');
        expect(Rapid.OsmEntity.toOSM('x5')).toEqual('');
      });
    });
  });

  describe('#update', function () {
    it('updates the specified attributes', function () {
      const tags = { foo: 'bar' };
      const e = new Rapid.OsmNode(context).update({ tags: tags });
      expect(e.tags).toEqual(tags);
    });

    it('preserves existing attributes', function () {
      const e = new Rapid.OsmWay(context, { id: 'w1' }).update({});
      expect(e.id).toEqual('w1');
    });

    it('doesn\'t modify the input', function () {
      const attrs = { tags: { foo: 'bar' } };
      new Rapid.OsmNode(context).update(attrs);
      expect(attrs).toEqual({ tags: { foo: 'bar' } });
    });

    it('doesn\'t copy prototype properties', function () {
      expect(Object.hasOwn(new Rapid.OsmNode(context).update({}), 'update')).toBe(false);
    });
  });

  describe('#mergeTags', function () {
    // needs F-osm-5
    it.todo('accepts override tags');
  });
});
