// Adopted from iD test/spec/osm/deprecated.ts (ISC, © iD contributors), at commit 0194f3926.
// Parked: the model has no matcher for id-tagging-schema's deprecated.json (F-osm-1).
import { describe, it } from 'bun:test';

describe('getDeprecatedTags', () => {
  // needs F-osm-1
  it.todo('returns none if entity has no tags');
  // needs F-osm-1
  it.todo('returns none when no tags are deprecated');
  // needs F-osm-1
  it.todo('returns 1:0 replacement');
  // needs F-osm-1
  it.todo('returns 1:1 replacement');
  // needs F-osm-1
  it.todo('returns 1:1 wildcard');
  // needs F-osm-1
  it.todo('returns 1:2 total replacement');
  // needs F-osm-1
  it.todo('returns 1:2 partial replacement');
  // needs F-osm-1
  it.todo('returns 2:1 replacement');
});

describe('deprecatedTagValuesByKey', () => {
  // needs F-osm-1
  it.todo('groups simple deprecations by key');
});
