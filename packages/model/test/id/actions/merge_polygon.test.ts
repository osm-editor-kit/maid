// Adopted from iD test/spec/actions/merge_polygon.js (ISC, © iD contributors), at commit 0194f3926.
import { beforeEach, describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

// The other tests of this iD file are covered by packages/model/test/actions/merge_polygon.test.js.
describe('actionMergePolygon', () => {
  const context = new Rapid.MockContext();
  let base: Rapid.Graph;

  beforeEach(() => {
    const nodes: [string, number, number][] = [
      ['n0', 0, 0], ['n1', 5, 0], ['n2', 5, 5], ['n3', 0, 5],
      ['n4', 1, 1], ['n5', 4, 1], ['n6', 4, 4], ['n7', 1, 4],
      ['n8', 2, 2], ['n9', 3, 2], ['n10', 3, 3], ['n11', 2, 3],
      ['n13', 8, 8], ['n14', 8, 9], ['n15', 9, 9]
    ];
    const ways: [string, string[]][] = [
      ['w0', ['n0', 'n1', 'n2', 'n3', 'n0']],
      ['w1', ['n4', 'n5', 'n6', 'n7', 'n4']],
      ['w2', ['n8', 'n9', 'n10', 'n11', 'n8']],
      ['w5', ['n13', 'n14', 'n15', 'n13']]
    ];
    base = new Rapid.Graph(context, [
      ...nodes.map(([id, x, y]) => new Rapid.OsmNode(context, { id, loc: [x, y] })),
      ...ways.map(([id, list]) => new Rapid.OsmWay(context, { id, nodes: list }))
    ]);
  });

  // iD's data already uses numeric ids here, so the survivor rule reads them as written
  it('creates a multipolygon from two multipolygon relations and keeps the oldest alive', () => {
    let graph = Rapid.actionMergePolygon(['w0', 'w1'], 'r2')(new Rapid.Graph(base));
    graph = Rapid.actionMergePolygon(['w2', 'w5'], 'r1')(graph);
    const result = Rapid.actionMergePolygon(['r2', 'r1'])(graph);

    // Delete other relation
    expect(result.hasEntity('r2')).toBeUndefined();

    const r = result.entity('r1') as Rapid.OsmRelation;
    expect(r.memberById('w0')?.role).toEqual('outer');
    expect(r.memberById('w1')?.role).toEqual('inner');
    expect(r.memberById('w2')?.role).toEqual('outer');
    expect(r.memberById('w5')?.role).toEqual('outer');
  });

  // needs F-actions-b-4 (the line-only tags, such as natural=coastline, stay on the outer way; Maid moves all tags of the way to the relation)
  it.todo('preserves coastline tag on the outer ways when creating a multipolygon');
});
