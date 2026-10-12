// Adopted from iD test/spec/actions/extract.js (ISC, © iD contributors), at commit 0194f3926.
// iD's third argument (extract relations) does not exist in Maid: Maid always moves a node's relation membership to the new node, which is what iD does with that argument set. The test that expects the default is parked as F-actions-a-6.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionExtract', () => {
  const context = new Rapid.MockContext();
  const tags = { 'name': 'test' };

  function createTargetNode(id: string, loc: [number, number]) {
    return new Rapid.OsmNode(context, { id, loc, tags });
  }

  // The action works on a head graph (Rapid's tests make one from a base graph).
  function headGraph(entities: Array<Rapid.OsmNode | Rapid.OsmWay | Rapid.OsmRelation>): Rapid.Graph {
    return new Rapid.Graph(new Rapid.Graph(context, entities));
  }

  describe('linear way', () => {
    let graph: Rapid.Graph;
    // Each test starts from a fresh graph.
    const makeGraph = () => headGraph([
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [3, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd'] }),
    ]);

    describe('target in first position', () => {
      // Swap target into the location & position of A
      const setup = () => makeGraph().replace(createTargetNode('a', [0, 0]));

      it('does not change length of way', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        expect(assertionGraph.entity('-').nodes.length).toEqual(4);
      });

      it('does not change order of nodes', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const target = assertionGraph.entity('-');
        // The id of the replacement node is not known, so only the known nodes are asserted.
        expect(target.nodes[1]).toEqual('b');
        expect(target.nodes[2]).toEqual('c');
        expect(target.nodes[3]).toEqual('d');
      });

      it('does not change location of nodes', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
        expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
        expect(assertionGraph.entity(nodes[2]).loc).toEqual([2, 0]);
        expect(assertionGraph.entity(nodes[3]).loc).toEqual([3, 0]);
      });

      it('does replace target node', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(nodes[0]).not.toEqual('a');
        expect(assertionGraph.entity(nodes[0]).tags).toEqual({});
      });

      it('does detach target node', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const targetNode = assertionGraph.entity('a');
        expect(targetNode).toBeDefined();
        expect(targetNode.loc).toEqual([0, 0]);
        expect(targetNode.tags).toEqual(tags);
        expect(assertionGraph.parentWays(targetNode)).toEqual([]);
      });
    });

    describe('target in second position', () => {
      // Swap target into the location & position of B
      const setup = () => makeGraph().replace(createTargetNode('b', [1, 0]));

      it('does not change length of way', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        expect(assertionGraph.entity('-').nodes.length).toEqual(4);
      });

      it('does not change order of nodes', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const target = assertionGraph.entity('-');
        expect(target.nodes[0]).toEqual('a');
        expect(target.nodes[2]).toEqual('c');
        expect(target.nodes[3]).toEqual('d');
      });

      it('does not change location of nodes', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
        expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
        expect(assertionGraph.entity(nodes[2]).loc).toEqual([2, 0]);
        expect(assertionGraph.entity(nodes[3]).loc).toEqual([3, 0]);
      });

      it('does replace target node', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(nodes[1]).not.toEqual('b');
        expect(assertionGraph.entity(nodes[1]).tags).toEqual({});
      });

      it('does detach target node', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const targetNode = assertionGraph.entity('b');
        expect(targetNode).toBeDefined();
        expect(targetNode.loc).toEqual([1, 0]);
        expect(targetNode.tags).toEqual(tags);
        expect(assertionGraph.parentWays(targetNode)).toEqual([]);
      });
    });
  });

  describe('closed way', () => {
    //
    //  d -- c
    //  |    |
    //  a -- b
    //
    const makeGraph = () => headGraph([
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [1, 1] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 1] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] }),
    ]);

    describe('target in first position', () => {
      const setup = () => makeGraph().replace(createTargetNode('a', [0, 0]));

      it('does not change length of way', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        expect(assertionGraph.entity('-').nodes.length).toEqual(5);
      });

      it('does not change order of nodes', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const target = assertionGraph.entity('-');
        expect(target.nodes[1]).toEqual('b');
        expect(target.nodes[2]).toEqual('c');
        expect(target.nodes[3]).toEqual('d');
        expect(target.nodes[0]).toEqual(target.nodes[4]);
      });

      it('does not change location of nodes', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
        expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
        expect(assertionGraph.entity(nodes[2]).loc).toEqual([1, 1]);
        expect(assertionGraph.entity(nodes[3]).loc).toEqual([0, 1]);
      });

      it('does replace target node', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(nodes[0]).not.toEqual('a');
        expect(nodes[4]).not.toEqual('a');
        expect(assertionGraph.entity(nodes[0]).tags).toEqual({});
      });

      it('does detach target node', () => {
        const assertionGraph = Rapid.actionExtract('a')(setup());
        const targetNode = assertionGraph.entity('a');
        expect(targetNode).toBeDefined();
        expect(targetNode.loc).toEqual([0, 0]);
        expect(targetNode.tags).toEqual(tags);
        expect(assertionGraph.parentWays(targetNode)).toEqual([]);
      });
    });

    describe('target in second position', () => {
      const setup = () => makeGraph().replace(createTargetNode('b', [1, 0]));

      it('does not change length of way', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        expect(assertionGraph.entity('-').nodes.length).toEqual(5);
      });

      it('does not change order of nodes', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const target = assertionGraph.entity('-');
        expect(target.nodes[0]).toEqual('a');
        expect(target.nodes[2]).toEqual('c');
        expect(target.nodes[3]).toEqual('d');
        expect(target.nodes[4]).toEqual('a');
      });

      it('does not change location of nodes', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
        expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
        expect(assertionGraph.entity(nodes[2]).loc).toEqual([1, 1]);
        expect(assertionGraph.entity(nodes[3]).loc).toEqual([0, 1]);
      });

      it('does replace target node', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const nodes = assertionGraph.entity('-').nodes;
        expect(nodes[1]).not.toEqual('b');
        expect(assertionGraph.entity(nodes[1]).tags).toEqual({});
      });

      it('does detach target node', () => {
        const assertionGraph = Rapid.actionExtract('b')(setup());
        const targetNode = assertionGraph.entity('b');
        expect(targetNode).toBeDefined();
        expect(targetNode.loc).toEqual([1, 0]);
        expect(targetNode.tags).toEqual(tags);
        expect(assertionGraph.parentWays(targetNode)).toEqual([]);
      });
    });
  });

  describe('intersecting linear ways', () => {
    //
    //           f
    //           ‖
    //           e
    //           ‖
    // a -- b -- c -- d
    //
    // Node c represents the target
    const setup = () => headGraph([
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 0], tags }),
      new Rapid.OsmNode(context, { id: 'd', loc: [3, 0] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [2, 1] }),
      new Rapid.OsmNode(context, { id: 'f', loc: [2, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['c', 'e', 'f'] }),
    ]);

    it('does not change length of ways', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      expect(assertionGraph.entity('-').nodes.length).toEqual(4);
      expect(assertionGraph.entity('=').nodes.length).toEqual(3);
    });

    it('does not change order of nodes', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      let target = assertionGraph.entity('-');
      expect(target.nodes[0]).toEqual('a');
      expect(target.nodes[1]).toEqual('b');
      expect(target.nodes[3]).toEqual('d');
      target = assertionGraph.entity('=');
      expect(target.nodes[1]).toEqual('e');
      expect(target.nodes[2]).toEqual('f');
    });

    it('does not change location of nodes', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      let nodes = assertionGraph.entity('-').nodes;
      expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
      expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
      expect(assertionGraph.entity(nodes[2]).loc).toEqual([2, 0]);
      expect(assertionGraph.entity(nodes[3]).loc).toEqual([3, 0]);
      nodes = assertionGraph.entity('=').nodes;
      expect(assertionGraph.entity(nodes[0]).loc).toEqual([2, 0]);
      expect(assertionGraph.entity(nodes[1]).loc).toEqual([2, 1]);
      expect(assertionGraph.entity(nodes[2]).loc).toEqual([2, 2]);
    });

    it('uses same replacement node at intersection', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      expect(assertionGraph.entity('-').nodes[2]).toEqual(assertionGraph.entity('=').nodes[0]);
    });

    it('does replace target node', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      const nodes = assertionGraph.entity('-').nodes;
      expect(nodes[2]).not.toEqual('c');
      expect(assertionGraph.entity(nodes[2]).tags).toEqual({});
      expect(assertionGraph.entity('=').nodes[0]).toEqual(nodes[2]);
    });

    it('does detach target node', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      const targetNode = assertionGraph.entity('c');
      expect(targetNode).toBeDefined();
      expect(targetNode.loc).toEqual([2, 0]);
      expect(targetNode.tags).toEqual(tags);
      expect(assertionGraph.parentWays(targetNode)).toEqual([]);
    });
  });

  describe('intersecting closed way', () => {
    const setup = () => headGraph([
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [1, 1], tags }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 1] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [2, 1] }),
      new Rapid.OsmNode(context, { id: 'f', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'g', loc: [1, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['c', 'e', 'f', 'g', 'c'] }),
    ]);

    it('does not change length of ways', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      expect(assertionGraph.entity('-').nodes.length).toEqual(5);
      expect(assertionGraph.entity('=').nodes.length).toEqual(5);
    });

    it('does not change order of nodes', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      let target = assertionGraph.entity('-');
      expect(target.nodes[0]).toEqual('a');
      expect(target.nodes[1]).toEqual('b');
      expect(target.nodes[3]).toEqual('d');
      expect(target.nodes[0]).toEqual(target.nodes[4]);
      target = assertionGraph.entity('=');
      expect(target.nodes[1]).toEqual('e');
      expect(target.nodes[2]).toEqual('f');
      expect(target.nodes[3]).toEqual('g');
      expect(target.nodes[0]).toEqual(target.nodes[4]);
    });

    it('does not change location of nodes', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      let nodes = assertionGraph.entity('-').nodes;
      expect(assertionGraph.entity(nodes[0]).loc).toEqual([0, 0]);
      expect(assertionGraph.entity(nodes[1]).loc).toEqual([1, 0]);
      expect(assertionGraph.entity(nodes[2]).loc).toEqual([1, 1]);
      expect(assertionGraph.entity(nodes[3]).loc).toEqual([0, 1]);
      nodes = assertionGraph.entity('=').nodes;
      expect(assertionGraph.entity(nodes[0]).loc).toEqual([1, 1]);
      expect(assertionGraph.entity(nodes[1]).loc).toEqual([2, 1]);
      expect(assertionGraph.entity(nodes[2]).loc).toEqual([2, 2]);
      expect(assertionGraph.entity(nodes[3]).loc).toEqual([1, 2]);
    });

    it('uses same replacement node at intersection', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      expect(assertionGraph.entity('-').nodes[2]).toEqual(assertionGraph.entity('=').nodes[0]);
    });

    it('does replace target node', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      const nodes = assertionGraph.entity('-').nodes;
      expect(nodes[0]).not.toEqual('c');
      expect(nodes[4]).not.toEqual('c');
      expect(assertionGraph.entity(nodes[0]).tags).toEqual({});
    });

    it('does detach target node', () => {
      const assertionGraph = Rapid.actionExtract('c')(setup());
      const targetNode = assertionGraph.entity('c');
      expect(targetNode).toBeDefined();
      expect(targetNode.loc).toEqual([1, 1]);
      expect(targetNode.tags).toEqual(tags);
      expect(assertionGraph.parentWays(targetNode)).toEqual([]);
    });
  });

  describe('with relation', () => {
    const setup = () => headGraph([
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0], tags }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c'] }),
      new Rapid.OsmRelation(context, {
        id: 'r',
        tags: { type: 'route', route: 'foot' },
        members: [
          { id: 'a', type: 'node', role: 'point' },
          { id: 'b', type: 'node', role: 'point' },
          { id: 'c', type: 'node', role: 'point' },
        ],
      }),
    ]);

    // needs F-actions-a-6
    it.todo('does not extract relations by default');

    it('detached node not a member of relation', () => {
      const assertionGraph = Rapid.actionExtract('b')(setup());
      const targetNode = assertionGraph.entity('b');
      expect(assertionGraph.parentRelations(targetNode).length).toEqual(0);
    });

    it('new node is a member of relation', () => {
      const assertionGraph = Rapid.actionExtract('b')(setup());
      const targetWay = assertionGraph.entity('-') as Rapid.OsmWay;
      const newNodeId = targetWay.nodes.filter(m => m !== 'a' && m !== 'b' && m !== 'c')[0];
      const newNode = assertionGraph.entity(newNodeId);
      expect(assertionGraph.parentRelations(newNode).length).toEqual(1);
      expect(assertionGraph.parentRelations(newNode)[0].id).toEqual('r');
    });

    it('Relation membership has the same properties', () => {
      const assertionGraph = Rapid.actionExtract('b')(setup());
      const targetWay = assertionGraph.entity('-') as Rapid.OsmWay;
      const newNodeId = targetWay.nodes.filter(m => m !== 'a' && m !== 'b' && m !== 'c')[0];
      const targetRelation = assertionGraph.entity('r') as Rapid.OsmRelation;
      const targetMember = targetRelation.memberById(newNodeId);
      expect(targetMember).toEqual({ id: newNodeId, index: 1, type: 'node', role: 'point' });
    });
  });
});
