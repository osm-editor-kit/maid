// Adopted from iD test/spec/osm/changeset.js (ISC, © iD contributors), at commit 0194f3926.
// The other eight tests of this file are covered by packages/model/test/data/OsmChangeset.test.js (same titles, same assertions).
// The two here assert iD's generator name 'iD' with Maid's name in its place: Maid writes '@generator': 'Maid' (decided 2026-10-13).
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('#asJXON', () => {
  const context = new Rapid.MockContext();

  it('converts a node to jxon', () => {
    const changeset = new Rapid.OsmChangeset(context, { tags: { comment: 'hello' } });
    expect(changeset.asJXON()).toEqual({
      osm: {
        changeset: {
          tag: [{ '@k': 'comment', '@v': 'hello' }],
          '@version': 0.6,
          '@generator': 'Maid'
        }
      }
    });
  });
});

describe('#osmChangeJXON', () => {
  const context = new Rapid.MockContext();

  it('converts change data to JXON', () => {
    const changeset = new Rapid.OsmChangeset(context);
    const jxon = changeset.osmChangeJXON({ created: [], modified: [], deleted: [] });

    expect(jxon).toEqual({
      osmChange: {
        '@version': 0.6,
        '@generator': 'Maid',
        'create': {},
        'modify': {},
        'delete': { '@if-unused': true }
      }
    });
  });
});
