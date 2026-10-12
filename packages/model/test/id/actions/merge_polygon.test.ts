// Adopted from iD test/spec/actions/merge_polygon.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test';

// The other tests of this iD file are covered by packages/model/test/actions/merge_polygon.test.js.
describe('actionMergePolygon', () => {
  // needs F-actions-b-3 (when two multipolygon relations are merged, the oldest one keeps its id, as in iD; Maid keeps the first in the list)
  it.todo('creates a multipolygon from two multipolygon relations and keeps the oldest alive');

  // needs F-actions-b-4 (the line-only tags, such as natural=coastline, stay on the outer way; Maid moves all tags of the way to the relation)
  it.todo('preserves coastline tag on the outer ways when creating a multipolygon');
});
