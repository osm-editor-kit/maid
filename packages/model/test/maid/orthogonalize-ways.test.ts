// Maid, not iD: buildings that share walls are squared together (actionOrthogonalizeWays). The two rows are the ones
// Tobias selected in the small fixture (2026-11-12): with iD's one-after-the-other squaring the wall between them was
// not square, and in the row of four it moved further right on every press.
import { describe, expect, it } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { Graph, ModelContext, OsmNode, OsmWay, actionOrthogonalizeWays, entitiesFromOsmJson } from '../../src/index.ts';
import { geoSphericalDistance } from '@rapid-sdk/math';
import type { OsmJsonElement } from '../../src/index.ts';

const fixture = JSON.parse(
  gunzipSync(readFileSync(`${import.meta.dir}/../../../../fixtures/small.json.gz`)).toString(),
) as { elements: OsmJsonElement[] };

function load(): Graph {
  const context = new ModelContext();
  return new Graph(new Graph(context, entitiesFromOsmJson(context, fixture.elements)));
}

const ROWS: Record<string, string[]> = {
  'two buildings': ['w324998179', 'w324998129'],
  'four buildings': ['w324998231', 'w45101239', 'w324998229', 'w324998221'],
};

/** Angle in degrees at each node of a way, in metres around 52.39° N */
function angles(graph: Graph, wayID: string): Map<string, number> {
  const ids = (graph.entity(wayID) as OsmWay).nodes.slice(0, -1);
  const k = Math.cos(52.39 * Math.PI / 180);
  const xy = (id: string) => { const [lon, lat] = (graph.entity(id) as OsmNode).loc!; return [lon * k, lat]; };
  const out = new Map<string, number>();
  ids.forEach((id, i) => {
    const [a, b, c] = [ids[(i - 1 + ids.length) % ids.length]!, id, ids[(i + 1) % ids.length]!].map(xy);
    const p = [a![0]! - b![0]!, a![1]! - b![1]!], q = [c![0]! - b![0]!, c![1]! - b![1]!];
    const cos = (p[0]! * q[0]! + p[1]! * q[1]!) / (Math.hypot(p[0]!, p[1]!) * Math.hypot(q[0]!, q[1]!));
    out.set(id, Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
  });
  return out;
}

const nearSquare = (deg: number, within: number) => [0, 90, 180].some(target => Math.abs(deg - target) < within);

describe('actionOrthogonalizeWays (Maid)', () => {
  for (const [name, ids] of Object.entries(ROWS)) {
    describe(name, () => {
      const before = load();
      const action = actionOrthogonalizeWays(ids);
      const after = action(load());

      it('is enabled before', () => {
        expect(action.disabled!(before)).toBe(false);
      });

      it('makes every corner within 13° of square exactly square, in every building', () => {
        for (const id of ids) {
          const old = angles(before, id);
          for (const [node, deg] of angles(after, id)) {
            if (old.has(node) && nearSquare(old.get(node)!, 13)) expect(nearSquare(deg, 0.01)).toBe(true);
          }
        }
      });

      it('moves no node by more than 30 cm', () => {
        for (const id of ids) {
          for (const node of (after.entity(id) as OsmWay).nodes) {
            const a = (before.entity(node) as OsmNode).loc!, b = (after.entity(node) as OsmNode).loc!;
            expect(geoSphericalDistance(a, b)).toBeLessThan(0.3);
          }
        }
      });

      it('has nothing left to do on a second press', () => {
        expect(actionOrthogonalizeWays(ids).disabled!(after)).toBe('square_enough');
        const again = actionOrthogonalizeWays(ids)(after);
        for (const id of ids) {
          for (const node of (again.entity(id) as OsmWay).nodes) {
            const a = (after.entity(node) as OsmNode).loc!, b = (again.entity(node) as OsmNode).loc!;
            expect(geoSphericalDistance(a, b)).toBeLessThan(0.001);
          }
        }
      });
    });
  }
});
