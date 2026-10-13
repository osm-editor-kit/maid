// Adopted from iD test/spec/actions/circularize.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';
import { MAX_VERTICES, MIN_VERTICES } from '../../../src/actions/circularize.ts';

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

  // iD's check: the area is within 0.1% of the regular polygon with the same number of vertices, in Mercator
  // coordinates relative to the first node (iD projects with a small translation, so this is the same test).
  function isCircularID(wayID: string, graph: Rapid.Graph): boolean {
    const nodes = graph.childNodes(graph.entity(wayID) as Rapid.OsmWay);
    const world = nodes.map((n) => Rapid.sdk.projWgs84ToWorld(n.loc!));
    const points = world.map((p) => Rapid.sdk.vecSubtract(p, world[0]));
    const centroid = polygonCentroid(points);
    const radius = Rapid.sdk.vecLength(centroid, points[0]);
    const n = points.length - 1;
    const estArea = Math.pow(radius, 2) * n / 2 * Math.sin(2 * Math.PI / n);
    const trueArea = Math.abs(polygonArea(points));
    return Math.abs(estArea - trueArea) / estArea < 1e-3;
  }

  // d3-polygon's polygonArea and polygonCentroid, as iD's tests use them.
  function polygonArea(points: [number, number][]): number {
    let area = 0;
    let b = points[points.length - 1];
    for (const a of points) {
      area += b[1] * a[0] - b[0] * a[1];
      b = a;
    }
    return area / 2;
  }

  function polygonCentroid(polygon: [number, number][]): [number, number] {
    let x = 0;
    let y = 0;
    let k = 0;
    let b = polygon[polygon.length - 1];
    for (const p of polygon) {
      const a = b;
      b = p;
      const c = a[0] * b[1] - b[0] * a[1];
      k += c;
      x += (a[0] + b[0]) * c;
      y += (a[1] + b[1]) * c;
    }
    k *= 3;
    return [x / k, y / k];
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

  it('creates fewer nodes for small features', () => {
    //    d - c
    //    |   |
    //    a - b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2e-5, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2e-5, 2e-5] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2e-5] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const graph = new Rapid.Graph(base);

    const result = Rapid.actionCircularize('-')(graph);
    expect(isCircularID('-', result)).toBeTruthy();
    expect(result.entity('-').nodes).toHaveLength(MIN_VERTICES + 1);
  });

  it('circularize at t = 0', () => {
    //    d ---- c
    //    |      |
    //    a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const graph = new Rapid.Graph(base);

    const result = Rapid.actionCircularize('-')(graph, 0);
    expect(isCircularID('-', result)).toBeFalsy();
    expect(result.entity('-').nodes).toHaveLength(MAX_VERTICES + 1);
    expect(planarArea('-', result)).toBeCloseTo(-4, 2);
  });
});
