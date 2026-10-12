// Adopted from iD test/spec/actions/move.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

// iD's tests use planar coordinates. Maid's move works in world units, so each planar point is placed
// at the same offset from the world centre, and the delta is given in the same units.
const CENTRE = Rapid.sdk.projWgs84ToWorld([0, 0]);
const at = (x: number, y: number): [number, number] => Rapid.sdk.projWorldToWgs84([CENTRE[0] + x, CENTRE[1] + y]) as [number, number];
function planar(graph: Rapid.Graph, id: string): [number, number] {
  const w = Rapid.sdk.projWgs84ToWorld(graph.entity(id).loc!);
  return [w[0] - CENTRE[0], w[1] - CENTRE[1]];
}

describe('actionMove', () => {
  const context = new Rapid.MockContext();

  it('prevents intersections', () => {
    // u3 ------------- u2
    //                  |
    //          d       |
    //          |       |
    // u0 ----- b ----- u1
    const b = new Rapid.OsmNode(context, { id: 'b', loc: at(0, 0) });
    const d = new Rapid.OsmNode(context, { id: 'd', loc: at(0, 8) });
    const moved = new Rapid.OsmWay(context, { id: 'moved', nodes: ['b', 'd'] });

    const u0 = new Rapid.OsmNode(context, { id: 'u0', loc: at(-10, 0) });
    const u1 = new Rapid.OsmNode(context, { id: 'u1', loc: at(10, 0) });
    const u2 = new Rapid.OsmNode(context, { id: 'u2', loc: at(10, 10) });
    const u3 = new Rapid.OsmNode(context, { id: 'u3', loc: at(-10, 10) });
    const unmoved = new Rapid.OsmWay(context, { id: 'unmoved', nodes: ['u0', 'b', 'u1', 'u2', 'u3'] });

    const base = new Rapid.Graph(context, [b, d, moved, u0, u1, u2, u3, unmoved]);

    function tryDelta(delta: [number, number], expectedDelta: [number, number]) {
      const action = Rapid.actionMove(['moved'], delta);
      const result = action(new Rapid.Graph(base));

      const limitedDelta = action.delta();
      expect(limitedDelta[0]).toBeCloseTo(expectedDelta[0], 6);
      expect(limitedDelta[1]).toBeCloseTo(expectedDelta[1], 6);

      const before = planar(base, 'd');
      const after = planar(result, 'd');
      expect(after[0]).toBeCloseTo(before[0] + expectedDelta[0], 6);
      expect(after[1]).toBeCloseTo(before[1] + expectedDelta[1], 6);
    }

    // small movement: no clamping necessary
    tryDelta([0, 1], [0, 1]);
    // small movement, but would intersect other part of unmoved way:
    // stay snapped to original segment
    tryDelta([0, 3], [0, 0]);
    // larger movement: snap to top segment of unmoved way
    tryDelta([0, 6], [0, 10]);
    // large movement: move beyond top segment
    tryDelta([0, 12], [0, 12]);
    // movement perpendicular: no restrictions
    tryDelta([6, 0], [6, 0]);
  });
});
