// Adopted from iD test/spec/actions/disconnect.js (ISC, © iD contributors), at commit 0194f3926.
// Only the tests without a Rapid counterpart by title and scenario are here; the others are in packages/model/test/actions/disconnect.test.js.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionDisconnect', () => {
  const context = new Rapid.MockContext();

  it('preserves the closed way when part of a larger disconnect operation', () => {
    // Situation:
    //    a ---- bb === c
    //           =   ==
    //           = ==
    //           d
    // Disconnect - at b (whilst == is selected).
    //
    // Expected result:
    //    a ---- b   ee === c
    //               =   ==
    //               = ==
    //               d
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a' }),
      new Rapid.OsmNode(context, { id: 'b' }),
      new Rapid.OsmNode(context, { id: 'c' }),
      new Rapid.OsmNode(context, { id: 'd' }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['b', 'c', 'd', 'b'] }),
    ]);
    const graph = Rapid.actionDisconnect('b', 'e').limitWays(['='])(new Rapid.Graph(base));

    expect(graph.entity('-').nodes).toEqual(['a', 'b']);
    expect(graph.entity('=').nodes).toEqual(['e', 'c', 'd', 'e']);
  });

  it('replaces later occurrences in a self-intersecting way', () => {
    // Situation:
    //  a --- b
    //   \   /
    //    \ /
    //     c
    // Disconnect at a
    //
    // Expected result:
    //  a --- b
    //        |
    //  d --- c
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a' }),
      new Rapid.OsmNode(context, { id: 'b' }),
      new Rapid.OsmNode(context, { id: 'c' }),
      new Rapid.OsmWay(context, { id: 'w', nodes: ['a', 'b', 'c', 'a'] }),
    ]);
    const graph = Rapid.actionDisconnect('a', 'd')(new Rapid.Graph(base));

    expect(graph.entity('w').nodes).toEqual(['a', 'b', 'c', 'd']);
  });

  it('disconnects a way with multiple intersection points', () => {
    // Situation:
    //  a == b -- c
    //       |    |
    //       e -- d
    // 2 ways a-b  and  b-c-d-e-b
    //
    // Disconnect at b
    //
    // Expected Result:
    //  a == b   * -- c
    //           |    |
    //           e -- d
    // 2 ways a-b  and  *-c-d-e-*
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a' }),
      new Rapid.OsmNode(context, { id: 'b' }),
      new Rapid.OsmNode(context, { id: 'c' }),
      new Rapid.OsmNode(context, { id: 'd' }),
      new Rapid.OsmNode(context, { id: 'e' }),
      new Rapid.OsmWay(context, { id: 'w1', nodes: ['a', 'b'] }),
      new Rapid.OsmWay(context, { id: 'w2', nodes: ['b', 'c', 'd', 'e', 'b'] }),
    ]);
    const graph = Rapid.actionDisconnect('b', '*')(new Rapid.Graph(base));

    expect(graph.entity('w1').nodes).toEqual(['a', 'b']);
    expect(graph.entity('w2').nodes).toEqual(['*', 'c', 'd', 'e', '*']);
  });
});
