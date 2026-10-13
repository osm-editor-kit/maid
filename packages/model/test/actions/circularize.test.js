import { describe, it } from 'bun:test';
import { assert } from 'chai';
import * as Rapid from '../rapid.ts';


describe('actionCircularize', () => {
  const context = new Rapid.MockContext();


  function isCircular(wayID, graph) {
    const way = graph.entity(wayID);
    const local = way.geoms.parts[0].local;
    const points = local.coords;
    const centroid = local.centroid;
    const radius = Rapid.sdk.vecLength(centroid, points[0]);
    const ideal = Math.PI * radius * radius;
    const pctDiff = (ideal - local.area) / ideal;
    return (pctDiff < 0.02);   // within 2% of circular area..
  }


  // Maid: expectation changed to iD's behaviour (decided 2026-10-13): iD's check, the area within 0.1% of the
  // regular polygon with the same vertices. Rapid's check above reads the radius from the first node, which is
  // not on the circle at t = 0.5 now that the way starts with a new node.
  function isCircularID(wayID, graph) {
    const nodes = graph.childNodes(graph.entity(wayID));
    const world = nodes.map(n => Rapid.sdk.projWgs84ToWorld(n.loc));
    const points = world.map(p => Rapid.sdk.vecSubtract(p, world[0]));
    const centroid = polygonCentroid(points);
    const radius = Rapid.sdk.vecLength(centroid, points[0]);
    const n = points.length - 1;
    const estArea = Math.pow(radius, 2) * n / 2 * Math.sin(2 * Math.PI / n);
    const trueArea = Math.abs(polygonArea(points));
    return Math.abs(estArea - trueArea) / estArea < 1e-3;
  }


  // d3-polygon's polygonArea and polygonCentroid, as iD's tests use them.
  function polygonArea(points) {
    let area = 0;
    let b = points[points.length - 1];
    for (const a of points) {
      area += b[1] * a[0] - b[0] * a[1];
      b = a;
    }
    return area / 2;
  }


  function polygonCentroid(polygon) {
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


  function intersection(a, b) {
    return (new Set(a)).intersection(new Set(b));
  }


  function angle(point1, point2, center) {
    let vector1 = [point1[0] - center[0], point1[1] - center[1]];
    let vector2 = [point2[0] - center[0], point2[1] - center[1]];
    let distance;

    distance = Rapid.sdk.vecLength(vector1, [0, 0]);
    vector1 = [vector1[0] / distance, vector1[1] / distance];

    distance = Rapid.sdk.vecLength(vector2, [0, 0]);
    vector2 = [vector2[0] / distance, vector2[1] / distance];

    return Math.acos(vector1[0] * vector2[0] + vector1[1] * vector2[1]) * Rapid.sdk.RAD2DEG;
  }


  function area(wayID, graph) {
    const way = graph.entity(wayID);
    return way.geoms.parts[0].local.area;
  }


  it('creates nodes if necessary', () => {
    //  d ---- c
    //  |      |
    //  a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));
    // Maid: expectation changed to iD's behaviour (decided 2026-10-13)
    assert.lengthOf(result.entity('-').nodes, 33);
  });


  it('reuses existing nodes', () => {
    //  d,e -- c
    //  |      |
    //  a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));

    const nodes = result.entity('-').nodes;
    assert.includeMembers(nodes, ['a', 'b', 'c', 'd', 'e']);
  });


  it('limits movement of nodes that are members of other ways', () => {
    //  b ---- a
    //  |      |
    //  c ---- d
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [-2, 2] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [-2, -2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [2, -2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['d'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));
    const dist = Rapid.sdk.vecLength(result.entity('d').loc, [2, -2]);
    assert.closeTo(dist, 0, 1e-3, 'd did not move much');
  });


  it('creates circle respecting min-angle limit', () => {
    //  d ---- c
    //  |      |
    //  a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));

    const way = result.entity('-');
    const points = way.geoms.parts[0].world.coords;
    const centroid = way.geoms.parts[0].world.centroid;

    // Maid: expectation changed to iD's behaviour (decided 2026-10-13): iD's largest angle for a circle of 32 vertices, 360 / 31
    const maxAngle = 360 / 31;
    for (let i = 0; i < points.length - 1; i++) {
      assert.isAtMost(angle(points.at(i), points.at(i+1), centroid), maxAngle);
    }
    assert.isAtMost(angle(points.at(-2), points.at(0), centroid), maxAngle);
  });


  it('leaves clockwise ways clockwise', () => {
    //  d ---- c
    //  |      |    a-d-c-b-a is clockwise
    //  a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '+', nodes: ['a', 'd', 'c', 'b', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('+')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('+', result));

    const nodeIDs = result.entity('+').nodes.filter(nodeID => ['a', 'b', 'c', 'd'].includes(nodeID));
    // Maid: expectation changed to iD's behaviour (decided 2026-10-13): the closing node is a new node, so 'a' is listed once
    assert.deepEqual(nodeIDs, ['a', 'd', 'c', 'b']);  // still in this order
  });


  it('leaves counterclockwise ways counterclockwise', () => {
    //  d ---- c
    //  |      |   a-b-c-d-a is counterclockwise
    //  a ---- b
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));

    const nodeIDs = result.entity('-').nodes.filter(nodeID => ['a', 'b', 'c', 'd'].includes(nodeID));
    // Maid: expectation changed to iD's behaviour (decided 2026-10-13): the closing node is a new node, so 'a' is listed once
    assert.deepEqual(nodeIDs, ['a', 'b', 'c', 'd']);  // still in this order
  });


  it('adds new nodes on shared way wound in opposite direction', () => {
    //  c ---- b ---- f
    //  |     /       |
    //  |    a        |
    //  |     \       |
    //  d ---- e ---- g
    //
    //  a-b-c-d-e-a is counterclockwise
    //  a-b-f-g-e-a is clockwise
    //
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [ 0,  0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [ 1,  2] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [-2,  2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [-2, -2] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [ 1, -2] }),
      new Rapid.OsmNode(context, { id: 'f', loc: [ 3,  2] }),
      new Rapid.OsmNode(context, { id: 'g', loc: [ 3, -2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['a', 'b', 'f', 'g', 'e', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const intersect1 = intersection(graph.entity('-').nodes, graph.entity('=').nodes);
    assert.lengthOf(intersect1, 3);
    assert.isFalse(graph.entity('-').isConvex(graph));
    assert.isTrue(graph.entity('=').isConvex(graph));

    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));

    const intersect2 = intersection(result.entity('-').nodes, result.entity('=').nodes);
    assert.isAbove(intersect2.size, 3);
    assert.isTrue(result.entity('-').isConvex(result));
    assert.isFalse(result.entity('=').isConvex(result));
  });


  it('adds new nodes on shared way wound in similar direction', () => {
    //  c ---- b ---- f
    //  |     /       |
    //  |    a        |
    //  |     \       |
    //  d ---- e ---- g
    //
    //  a-b-c-d-e-a is counterclockwise
    //  a-e-g-f-b-a is counterclockwise
    //
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [ 0,  0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [ 1,  2] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [-2,  2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [-2, -2] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [ 1, -2] }),
      new Rapid.OsmNode(context, { id: 'f', loc: [ 3,  2] }),
      new Rapid.OsmNode(context, { id: 'g', loc: [ 3, -2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['a', 'e', 'g', 'f', 'b', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    const intersect1 = intersection(graph.entity('-').nodes, graph.entity('=').nodes);
    assert.lengthOf(intersect1, 3);
    assert.isFalse(graph.entity('-').isConvex(graph));
    assert.isTrue(graph.entity('=').isConvex(graph));

    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));

    const intersect2 = intersection(result.entity('-').nodes, result.entity('=').nodes);
    assert.isAbove(intersect2.size, 3);
    assert.isTrue(result.entity('-').isConvex(result));
    assert.isFalse(result.entity('=').isConvex(result));
  });


  it('circularizes extremely concave ways with a key node on the wrong side of the centroid', () => {
    //  c ------------ b -- f
    //  |       ___---      |
    //  |  a ===            |
    //  |       ---___      |
    //  d ------------ e -- g
    //
    //  a-b-c-d-e-a is extremely concave and 'a' is to the left of centoid..
    //
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [ 0,  0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [10,  2] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [-2,  2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [-2, -2] }),
      new Rapid.OsmNode(context, { id: 'e', loc: [10, -2] }),
      new Rapid.OsmNode(context, { id: 'f', loc: [15,  2] }),
      new Rapid.OsmNode(context, { id: 'g', loc: [15, -2] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['a', 'b', 'f', 'g', 'e', 'a'] })
    ]);

    const graph = new Rapid.Graph(base);
    assert.isFalse(graph.entity('-').isConvex(graph));

    const result = Rapid.actionCircularize('-')(graph);
    assert.instanceOf(result, Rapid.Graph);
    assert.isTrue(isCircular('-', result));
    assert.isTrue(result.entity('-').isConvex(result));
  });


  describe('disabled', () => {
    it('not disable circularize when its not circular', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const disabled = Rapid.actionCircularize('-').disabled(graph);
      assert.isFalse(disabled);
    });

    it('is disabled if not closed', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd'] })
      ]);

      const graph = new Rapid.Graph(base);
      const disabled = Rapid.actionCircularize('-').disabled(graph);
      assert.strictEqual(disabled, 'not_closed');
    });

    it('is disabled if already circular', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const result = Rapid.actionCircularize('-')(graph);
      const disabled = Rapid.actionCircularize('-').disabled(result);
      assert.strictEqual(disabled, 'already_circular');
    });
  });


  describe('transitions', () => {
    it('is transitionable', () => {
      assert.isTrue(Rapid.actionCircularize().transitionable);
    });

    it('circularize at t = 0', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const result = Rapid.actionCircularize('-')(graph, 0);
      assert.isFalse(isCircular('-', result));
      // Maid: expectation changed to iD's behaviour (decided 2026-10-13): iD inserts the vertices at t = 0 (33 entries)
      assert.lengthOf(result.entity('-').nodes, 33);
    });

    it('circularize at t = 0.5', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const a0 = area('-', Rapid.actionCircularize('-')(base.snapshot(), 0));
      const a1 = area('-', Rapid.actionCircularize('-')(base.snapshot(), 1));
      const result = Rapid.actionCircularize('-')(graph, 0.5);
      const aHalf = area('-', result);
      assert.isFalse(isCircularID('-', result));        // not circular yet
      // Maid: expectation changed to iD's behaviour (decided 2026-10-13): all final nodes exist (33 entries)
      assert.lengthOf(result.entity('-').nodes, 33);
      assert.isAbove(aHalf, a0);   // more area than at t=0
      assert.isBelow(aHalf, a1);   // less area than at t=1
    });

    it('circularize at t = 1', () => {
      const base = new Rapid.Graph(context, [
        new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
        new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
        new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
        new Rapid.OsmNode(context, { id: 'd', loc: [0, 2] }),
        new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);

      const graph = new Rapid.Graph(base);
      const result = Rapid.actionCircularize('-')(graph, 1);
      assert.isTrue(isCircular('-', result));
      // Maid: expectation changed to iD's behaviour (decided 2026-10-13)
      assert.lengthOf(result.entity('-').nodes, 33);
    });
  });

});
