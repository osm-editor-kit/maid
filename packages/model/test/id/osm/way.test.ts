// Adopted from iD test/spec/osm/way.js (ISC, © iD contributors), at commit 0194f3926.
// The covered tests of this file are in packages/model/test/data/OsmWay.test.js (same titles, or the same behaviour
// under a different grouping, e.g. isOneWay). See osm.md.
import { describe, it } from 'bun:test';

describe('iD.osmWay', function () {
  // needs F-osm-4
  it.todo('freezes nodes');

  describe('#sidednessIdentifier', function () {
    // needs F-osm-8
    it.todo('returns tag when the tag has implied sidedness');
    // needs F-osm-8
    it.todo('returns null when tag does not have implied sidedness');
  });

  describe('#area', function () {
    // needs F-osm-9
    it.todo('returns a relative measure of area');
    // needs F-osm-9
    it.todo('treats unclosed areas as if they were closed');
    // needs F-osm-9
    it.todo('returns 0 for degenerate areas');
  });
});
