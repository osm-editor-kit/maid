// Adopted from iD test/spec/actions/merge.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionMerge', () => {
  const context = new Rapid.MockContext();

  // needs F-actions-b-1 (iD's rules for keeping an existing point's id; Maid's merge always takes the first uninteresting child)
  it.todo('preserves existing point id when possible');
  it.todo('preserves existing point ids when possible');
  it.todo('preserves existing node ids when possible');

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

  // needs F-actions-b-1
  it.todo('preserves oldest interesting existing node ids');
});
