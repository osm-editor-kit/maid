// Adopted from iD test/spec/actions/merge_nodes.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionMergeNodes', () => {
  const context = new Rapid.MockContext();

  it('keeps the id of the interesting node', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n1', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [4, 4], tags: { highway: 'traffic_signals' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMergeNodes(['n1', 'n2'])(graph);

    expect(result.hasEntity('n1')).toBeUndefined();

    const survivor = result.hasEntity('n2') as Rapid.OsmNode;
    expect(survivor).toBeInstanceOf(Rapid.OsmNode);
    expect(survivor.tags).toEqual({ highway: 'traffic_signals' });
    expect(survivor.loc).toEqual([4, 4]);
  });

  // needs F-actions-b-2 (connect picks the oldest interesting existing node as survivor, as iD does)
  it.todo('keeps the id of the existing node');
  it.todo('keeps the id of the oldest node');
  it.todo('keeps the id of the oldest interesting node');
});
