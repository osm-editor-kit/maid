// Adopted from iD test/spec/actions/reflect.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

// iD's tests use planar coordinates. Maid's locations are lon/lat and the reflection works in world space,
// so each planar point is placed at the same offset from the world centre, and read back the same way.
const CENTRE = Rapid.sdk.projWgs84ToWorld([0, 0]);
const at = (x: number, y: number): [number, number] => Rapid.sdk.projWorldToWgs84([CENTRE[0] + x, CENTRE[1] + y]) as [number, number];
function expectAt(graph: Rapid.Graph, id: string, x: number, y: number) {
  const w = Rapid.sdk.projWgs84ToWorld(graph.entity(id).loc!);
  expect(w[0] - CENTRE[0]).toBeCloseTo(x, 6);
  expect(w[1] - CENTRE[1]).toBeCloseTo(y, 6);
}

describe('actionReflect', () => {
  const context = new Rapid.MockContext();

  function rectangle() {
    return new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: at(0, 0) }),
      new Rapid.OsmNode(context, { id: 'b', loc: at(4, 0) }),
      new Rapid.OsmNode(context, { id: 'c', loc: at(4, 2) }),
      new Rapid.OsmNode(context, { id: 'd', loc: at(1, 2) }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
  }

  describe('transitions', () => {
    it('reflect short at t = 0', () => {
      const graph = new Rapid.Graph(rectangle());
      const result = Rapid.actionReflect(['-']).useLongAxis(false)(graph, 0);
      expectAt(result, 'a', 0, 0);
      expectAt(result, 'b', 4, 0);
      expectAt(result, 'c', 4, 2);
      expectAt(result, 'd', 1, 2);
    });

    it('reflect short at t = 0.5', () => {
      const graph = new Rapid.Graph(rectangle());
      const result = Rapid.actionReflect(['-']).useLongAxis(false)(graph, 0.5);
      expectAt(result, 'a', 2, 0);
      expectAt(result, 'b', 2, 0);
      expectAt(result, 'c', 2, 2);
      expectAt(result, 'd', 2, 2);
    });

    it('reflect short at t = 1', () => {
      const graph = new Rapid.Graph(rectangle());
      const result = Rapid.actionReflect(['-']).useLongAxis(false)(graph, 1);
      expectAt(result, 'a', 4, 0);
      expectAt(result, 'b', 0, 0);
      expectAt(result, 'c', 0, 2);
      expectAt(result, 'd', 3, 2);
    });
  });
});
