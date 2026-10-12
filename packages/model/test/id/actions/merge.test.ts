// Adopted from iD test/spec/actions/merge.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionMerge', () => {
  const context = new Rapid.MockContext();

  // iD's data used test ids; numeric ids here, because the survivor rule needs them
  it('preserves existing point id when possible', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n1', loc: [1, 0], tags: { n1: 'n1' } }),
      new Rapid.OsmNode(context, { id: 'n-1', loc: [0, 0], tags: { a: 'a' } }),
      new Rapid.OsmNode(context, { id: 'n-2', loc: [0, 1] }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['n-1', 'n-2'], tags: { w: 'w' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMerge(['n1', 'w'])(graph);

    expect(result.hasEntity('n1')).toBeTruthy();
    expect(result.hasEntity('n-1')).toBeUndefined();
    expect(result.hasEntity('n-2')).toBeTruthy();
    expect(result.entity('w').tags).toEqual({ n1: 'n1', w: 'w' });
    expect(result.entity('w').nodes).toEqual(['n1', 'n-2']);
    expect(result.entity('n1').loc[0]).toEqual(0);
    expect(result.entity('n1').loc[1]).toEqual(0);
  });

  // iD's data used test ids; numeric ids here, because the survivor rule needs them
  it('preserves existing point ids when possible', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n1', loc: [1, 0], tags: { n1: 'n1' } }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [2, 0], tags: { n2: 'n2' } }),
      new Rapid.OsmNode(context, { id: 'n-1', loc: [0, 1] }),
      new Rapid.OsmNode(context, { id: 'n-2', loc: [0, 2], tags: { b: 'b' } }),
      new Rapid.OsmNode(context, { id: 'n-3', loc: [0, 3] }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['n-1', 'n-2', 'n-3'], tags: { w: 'w' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMerge(['n1', 'n2', 'w'])(graph);

    expect(result.hasEntity('n1')).toBeTruthy();
    expect(result.hasEntity('n2')).toBeTruthy();
    expect(result.hasEntity('n-1')).toBeUndefined();
    expect(result.hasEntity('n-2')).toBeUndefined();
    expect(result.hasEntity('n-3')).toBeTruthy();
    expect(result.entity('n2').tags).toEqual({ b: 'b' });
    expect(result.entity('w').tags).toEqual({ n1: 'n1', n2: 'n2', w: 'w' });
    expect(result.entity('w').nodes).toEqual(['n1', 'n2', 'n-3']);
    expect(result.entity('n1').loc[0]).toEqual(0);
    expect(result.entity('n1').loc[1]).toEqual(1);
    expect(result.entity('n2').loc[0]).toEqual(0);
    expect(result.entity('n2').loc[1]).toEqual(2);
  });

  // iD's data used test ids; numeric ids here, because the survivor rule needs them
  it('preserves existing node ids when possible', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n-1', loc: [1, 0], tags: { a: 'a' } }),
      new Rapid.OsmNode(context, { id: 'n-2', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'n1', loc: [0, 1] }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [0, 2], tags: { n2: 'n2' } }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['n1', 'n2'], tags: { w: 'w' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMerge(['n-1', 'n-2', 'w'])(graph);

    expect(result.hasEntity('n-1')).toBeUndefined();
    expect(result.hasEntity('n-2')).toBeUndefined();
    expect(result.hasEntity('n1')).toBeTruthy();
    expect(result.hasEntity('n2')).toBeTruthy();
    expect(result.entity('w').tags).toEqual({ a: 'a', w: 'w' });
    expect(result.entity('w').nodes).toEqual(['n1', 'n2']);
    expect(result.entity('n1').loc[0]).toEqual(0);
    expect(result.entity('n1').loc[1]).toEqual(1);
    expect(result.entity('n2').loc[0]).toEqual(0);
    expect(result.entity('n2').loc[1]).toEqual(2);
  });

  it('preserves interesting existing node ids when possible', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n1', loc: [1, 0], tags: { n1: 'n1' } }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [0, 1], tags: { n2: 'n2' } }),
      new Rapid.OsmNode(context, { id: 'n3', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['n2', 'n3'], tags: { w: 'w' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMerge(['n1', 'w'])(graph);

    expect(result.hasEntity('n1')).toBeTruthy();
    expect(result.hasEntity('n2')).toBeTruthy();
    expect(result.hasEntity('n3')).toBeUndefined();
    expect(result.entity('w').tags).toEqual({ n1: 'n1', w: 'w' });
    expect(result.entity('w').nodes).toEqual(['n2', 'n1']);
    expect(result.entity('n1').loc[0]).toEqual(0);
    expect(result.entity('n1').loc[1]).toEqual(2);
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('preserves oldest interesting existing node ids', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'n3', loc: [1, 0], tags: { n3: 'n3' } }),
      new Rapid.OsmNode(context, { id: 'n6', loc: [2, 0], tags: { n6: 'n6' } }),
      new Rapid.OsmNode(context, { id: 'n2', loc: [0, 1], tags: { n2: 'n2' } }),
      new Rapid.OsmNode(context, { id: 'n5', loc: [0, 2], tags: { n5: 'n5' } }),
      new Rapid.OsmNode(context, { id: 'n1', loc: [0, 3], tags: { n1: 'n1' } }),
      new Rapid.OsmNode(context, { id: 'n4', loc: [0, 4], tags: { n4: 'n4' } }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['n2', 'n5', 'n1', 'n4'], tags: { w: 'w' } })
    ]);
    const graph = new Rapid.Graph(base);
    const result = Rapid.actionMerge(['n3', 'n6', 'w'])(graph);

    expect(result.hasEntity('n1')).toBeTruthy();
    expect(result.hasEntity('n2')).toBeTruthy();
    expect(result.hasEntity('n3')).toBeTruthy();
    expect(result.hasEntity('n4')).toBeTruthy();
    expect(result.hasEntity('n5')).toBeUndefined();
    expect(result.hasEntity('n6')).toBeUndefined();
    expect(result.entity('w').tags).toEqual({ n3: 'n3', n6: 'n6', w: 'w' });
    expect(result.entity('w').nodes).toEqual(['n2', 'n3', 'n1', 'n4']);
    expect(result.entity('n3').loc[0]).toEqual(0);
    expect(result.entity('n3').loc[1]).toEqual(2);
  });
});
