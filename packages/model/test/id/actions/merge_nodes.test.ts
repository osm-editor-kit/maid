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

  // iD's data used test ids; numeric ids here, because the survivor rule needs them
  it('keeps the id of the existing node', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n1', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'n-1', loc: [4, 4], tags: { highway: 'traffic_signals' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMergeNodes(['n1', 'n-1'])(graph);

    expect(result.hasEntity('n-1')).toBeUndefined();

    const survivor = result.hasEntity('n1') as Rapid.OsmNode;
    expect(survivor).toBeInstanceOf(Rapid.OsmNode);
    expect(survivor.tags).toEqual({ highway: 'traffic_signals' });
    expect(survivor.loc).toEqual([4, 4]);
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('keeps the id of the oldest node', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n2', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'n1', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'n3', loc: [4, 4] })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMergeNodes(['n2', 'n1', 'n3'])(graph);

    expect(result.hasEntity('n2')).toBeUndefined();
    expect(result.hasEntity('n3')).toBeUndefined();
    expect(result.hasEntity('n1')).toBeInstanceOf(Rapid.OsmNode);
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('keeps the id of the oldest interesting node', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n3', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'n1', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [4, 4], tags: { highway: 'traffic_signals' } }),
      new Rapid.OsmNode(context, { id: 'n4', loc: [8, 8], tags: { crossing: 'marked' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMergeNodes(['n2', 'n1', 'n3', 'n4'])(graph);

    expect(result.hasEntity('n1')).toBeUndefined();
    expect(result.hasEntity('n3')).toBeUndefined();
    expect(result.hasEntity('n4')).toBeUndefined();
    expect(result.hasEntity('n2')).toBeInstanceOf(Rapid.OsmNode);
  });
});
