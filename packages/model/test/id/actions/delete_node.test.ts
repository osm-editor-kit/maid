// Adopted from iD test/spec/actions/delete_node.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionDeleteNode', () => {
  const context = new Rapid.MockContext();

  it('deletes a single-node way fully when deleting its only node', () => {
    const node = new Rapid.OsmNode(context);
    const way = new Rapid.OsmWay(context, { nodes: [node.id] });
    const action = Rapid.actionDeleteNode(node.id);
    const base = new Rapid.Graph(context, [node, way]);
    const graph = action(new Rapid.Graph(base));
    expect(graph.hasEntity(way.id)).toBeUndefined();
  });
});
