// Adopted from iD test/spec/osm/note.js (ISC, © iD contributors), at commit 0194f3926.
// Parked: Maid's notes are plain data (`Note` in packages/module-notes/src/model.ts), not model objects with extent, isNew and move (F-osm-3).
import { describe, it } from 'bun:test';

describe('iD.osmNote', function () {
  // needs F-osm-3
  it.todo('returns a note');

  describe('#extent', function () {
    // needs F-osm-3
    it.todo('returns a note extent');
  });

  describe('#isNew', function () {
    // needs F-osm-3
    it.todo('returns true if a note is new');
    // needs F-osm-3
    it.todo('returns false if a note is not new');
  });

  describe('#move', function () {
    // needs F-osm-3
    it.todo('returns an moved note');
  });
});
