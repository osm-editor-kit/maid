// Adopted from iD test/spec/osm/changeset.js (ISC, © iD contributors), at commit 0194f3926.
// The other eight tests of this file are covered by packages/model/test/data/OsmChangeset.test.js (same titles, same assertions).
// The two parked here assert iD's generator name 'iD'; Maid writes 'Rapid' (F-osm-2).
import { describe, it } from 'bun:test';

describe('#asJXON', () => {
  // needs F-osm-2
  it.todo('converts a node to jxon');
});

describe('#osmChangeJXON', () => {
  // needs F-osm-2
  it.todo('converts change data to JXON');
});
