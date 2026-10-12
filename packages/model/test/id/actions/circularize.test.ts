// Adopted from iD test/spec/actions/circularize.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionCircularize', () => {
  const context = new Rapid.MockContext();

  // Rapid's check: the local projection of the way is within 2% of a circle's area.
  function isCircular(wayID: string, graph: Rapid.Graph): boolean {
    const way = graph.entity(wayID) as Rapid.OsmWay;
    const local = way.geoms.parts[0].local;
    const points = local.coords;
    const centroid = local.centroid;
    const radius = Rapid.sdk.vecLength(centroid, points[0]);
    const ideal = Math.PI * radius * radius;
    const pctDiff = (ideal - local.area) / ideal;
    return pctDiff < 0.02;
  }

  // iD's area of the way in lon/lat, with d3-polygon's sign convention.
  function planarArea(wayID: string, graph: Rapid.Graph): number {
    const points = graph.childNodes(graph.entity(wayID) as Rapid.OsmWay).map((n) => n.loc);
    let area = 0;
    let b = points[points.length - 1];
    for (const a of points) {
      area += b[1] * a[0] - b[0] * a[1];
      b = a;
    }
    return area / 2;
  }

  it('circularizes a closed single line way', () => {
    const a = new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] });
    const b = new Rapid.OsmNode(context, { id: 'b', loc: [0, 2] });
    const c = new Rapid.OsmNode(context, { id: 'c', loc: [2, 0] });
    const w = new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'a'] });
    const base = new Rapid.Graph(context, [a, b, c, w]);
    const graph = new Rapid.Graph(base);
    expect(planarArea('-', graph)).toEqual(2);

    const result = Rapid.actionCircularize('-')(graph);
    expect(isCircular('-', result)).toBeTruthy();
  });

  // needs F-actions-a-2
  it.todo('creates fewer nodes for small features');

  // needs F-actions-a-3
  it.todo('circularize at t = 0');
});
