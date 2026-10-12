// Adopted from iD test/spec/osm/node.js (ISC, © iD contributors), at commit 0194f3926.
// The other tests of this file are covered by packages/model/test/data/OsmNode.test.js (same titles, same assertions).
import { describe, it } from 'bun:test';

describe('iD.osmNode', function () {
  describe('#directions', function () {
    describe('side', function () {
      // needs F-osm-6
      it.todo('supports side=left');
      // needs F-osm-6
      it.todo('supports side=rigHt');
      // needs F-osm-6
      it.todo('supports side=both');
      // needs F-osm-6
      // iD's loop runs six tests from this title: direction=left, direction=right, side=forward, side=backward, side=northwest, side=45
      it.todo('ignores ${key}=${value} since it\'s invalid');
      // needs F-osm-6
      it.todo('supports a mix of direction=* and side=*');
      // needs F-osm-6
      it.todo('supports railway:turnout_side=right');
      // needs F-osm-6
      it.todo('supports railway:turnout_side=left');
    });
  });
});
