// Adopted from iD test/spec/actions/discard_tags.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionDiscardTags', () => {
  const context = new Rapid.MockContext();
  const discardTags = { created_by: true, attribution: { 'https://example.com': true } };

  it('discards obsolete key-value pairs', () => {
    const way = new Rapid.OsmWay(context, { id: 'w1', tags: { attribution: 'https://example.com' } });
    const base = new Rapid.Graph(context, [way]);
    const head = new Rapid.Graph(base).replace(way.update({ tags: { ...way.tags, foo: 'bar' } }));
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    expect(action(head).entity(way.id).tags).toEqual({ foo: 'bar' });
  });

  // needs F-actions-a-1
  it.todo('does not discard tags where the key matches but the value does not match');
});
