// Adopted from iD test/spec/actions/upgrade_tags.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionUpgradeTags', () => {
  const context = new Rapid.MockContext();

  // Rapid's test of the same behaviour passes an empty object; iD's passes `undefined`.
  it('upgrades a tag with no replacement tags', () => {
    const oldTags = { highway: 'no' };
    const newTags = undefined;
    const entity = new Rapid.OsmNode(context, { tags: { highway: 'no', name: 'Foo' } });
    const base = new Rapid.Graph(context, [entity]);
    const graph = Rapid.actionUpgradeTags(entity.id, oldTags, newTags)(new Rapid.Graph(base));
    expect(graph.entity(entity.id).tags).toEqual({ name: 'Foo' });
  });
});
