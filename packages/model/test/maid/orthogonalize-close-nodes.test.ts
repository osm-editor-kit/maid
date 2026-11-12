// Maid, not iD: squaring merges consecutive nodes that are almost at the same place (SQUARE_MERGE_METERS), and the
// node that stays goes too when it is then on a straight edge. Coordinates are a building in Berlin, about 10 x 15 m.
import { describe, expect, it } from 'bun:test';
import { Graph, ModelContext, OsmNode, OsmWay, actionOrthogonalize } from '../../src/index.ts';
import type { Action } from '../../src/actions/types.ts';

const context = new ModelContext();

const disabled = (action: Action, graph: Graph) => action.disabled!(graph);
const nodesOf = (graph: Graph, id: string) => (graph.entity(id) as OsmWay).nodes;

// metres → degrees around Berlin (52.5° N)
const lat0 = 52.5, lon0 = 13.4;
const mLat = 1 / 111_320, mLon = 1 / (111_320 * Math.cos(lat0 * Math.PI / 180));
const at = (x: number, y: number): [number, number] => [lon0 + x * mLon, lat0 + y * mLat];

/**
 *    a ------ p q ------- b        p and q: a step of `step` metres, left over after lining up two edges
 *    |                    |
 *    d ------------------ c
 */
function building(step: number, tags: Record<string, Record<string, string>> = {}) {
  return new Graph(new Graph(context, [
    new OsmNode(context, { id: 'a', loc: at(0, 15) }),
    new OsmNode(context, { id: 'p', loc: at(5, 15), tags: tags.p }),
    new OsmNode(context, { id: 'q', loc: at(5, 15 + step), tags: tags.q }),
    new OsmNode(context, { id: 'b', loc: at(10, 15 + step) }),
    new OsmNode(context, { id: 'c', loc: at(10, 0) }),
    new OsmNode(context, { id: 'd', loc: at(0, 0) }),
    new OsmWay(context, { id: 'w', tags: { building: 'house' }, nodes: ['a', 'p', 'q', 'b', 'c', 'd', 'a'] }),
  ]));
}

describe('actionOrthogonalize: close nodes (Maid)', () => {
  it('is not "square enough" while two nodes are almost at the same place', () => {
    const graph = building(0.03);
    expect(disabled(actionOrthogonalize('w'), graph)).toBe(false);
  });

  it('merges the pair and drops the node left on the straight edge', () => {
    const result = actionOrthogonalize('w')(building(0.03));
    expect(nodesOf(result, 'w')).toEqual(['a', 'b', 'c', 'd', 'a']);
    expect(result.hasEntity('p')).toBeUndefined();
    expect(result.hasEntity('q')).toBeUndefined();
  });

  it('is "square enough" afterwards', () => {
    const result = actionOrthogonalize('w')(building(0.03));
    expect(disabled(actionOrthogonalize('w'), result)).toBe('square_enough');
  });

  it('keeps a step longer than the limit', () => {
    const graph = building(0.5);
    expect(disabled(actionOrthogonalize('w'), graph)).toBe('square_enough');
  });

  it('keeps the node with tags, and moves it onto the edge', () => {
    const result = actionOrthogonalize('w')(building(0.03, { p: { entrance: 'yes' } }));
    expect(nodesOf(result, 'w')).toEqual(['a', 'p', 'b', 'c', 'd', 'a']);
    expect(result.hasEntity('q')).toBeUndefined();
  });

  it('keeps both when both have tags', () => {
    const graph = building(0.03, { p: { entrance: 'yes' }, q: { entrance: 'service' } });
    expect(disabled(actionOrthogonalize('w'), graph)).toBe('square_enough');
  });

  it('moves the merged node towards the other one during the transition, and deletes it only at the end', () => {
    const result = actionOrthogonalize('w')(building(0.03), 0.5);
    expect(nodesOf(result, 'w')).toContain('q');
    expect(nodesOf(result, 'w')).toContain('p');
  });

  it('merges a node at the same place as the closing node', () => {
    const graph = new Graph(new Graph(context, [
      new OsmNode(context, { id: 'a', loc: at(0, 0) }),
      new OsmNode(context, { id: 'b', loc: at(10, 0) }),
      new OsmNode(context, { id: 'c', loc: at(10, 10) }),
      new OsmNode(context, { id: 'd', loc: at(0, 10) }),
      new OsmNode(context, { id: 'e', loc: at(0, 0.01) }),
      new OsmWay(context, { id: 'w', tags: { building: 'yes' }, nodes: ['a', 'b', 'c', 'd', 'e', 'a'] }),
    ]));
    const result = actionOrthogonalize('w')(graph);
    expect(nodesOf(result, 'w')).toEqual(['a', 'b', 'c', 'd', 'a']);
  });

  it('leaves a tiny way alone', () => {
    const tiny = (x: number, y: number) => at(x / 20, y / 20);
    const graph = new Graph(new Graph(context, [
      new OsmNode(context, { id: 'a', loc: tiny(0, 15) }),
      new OsmNode(context, { id: 'p', loc: tiny(5, 15) }),
      new OsmNode(context, { id: 'q', loc: tiny(5, 15.5) }),
      new OsmNode(context, { id: 'b', loc: tiny(10, 15.5) }),
      new OsmNode(context, { id: 'c', loc: tiny(10, 0) }),
      new OsmNode(context, { id: 'd', loc: tiny(0, 0) }),
      new OsmWay(context, { id: 'w', nodes: ['a', 'p', 'q', 'b', 'c', 'd', 'a'] }),
    ]));
    expect(disabled(actionOrthogonalize('w'), graph)).toBe('square_enough');
  });
});
