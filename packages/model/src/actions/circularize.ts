import { DEG2RAD, TAU, projWgs84ToWorld, projWorldToWgs84, vecAdd, vecInterp, vecLength, vecSubtract } from '@rapid-sdk/math';
import { OsmNode } from '../data/OsmNode.ts';
import { utilArrayUniq } from '@rapid-sdk/util';

import type { Action } from './types.ts';
import type { Graph } from '../lib/Graph.ts';
import type { OsmWay } from '../data/OsmWay.ts';
import type { Vec2 } from '@rapid-sdk/math';


// Maid: differs from Rapid here (iD's constants, from iD's modules/actions/circularize.ts)
const MAX_SEGMENT_LENGTH = 4;
export const MIN_VERTICES = 12;
export const MAX_VERTICES = 32;

// Maid: differs from Rapid here (iD's radiansToMeters, the WGS84 authalic radius)
const EARTH_RADIUS_IN_METERS = 6371007.1809;


/**
 * Circularizes a given closed way, as iD's `actionCircularize` does.
 *
 * The key nodes (members of other ways, or with interesting tags) are projected onto a circle and keep
 * their place in the way. The nodes between two key nodes are spread at constant angles between them, and
 * new nodes are added only where an arc is wider than the largest angle the circle's size allows
 * (`getMaxAngle`). A way that is not convex is first moved onto its hull (`makeConvex`).
 *
 * @param   wayID  - EntityID of the way to circularize
 * @return  An Action function that circularizes the given way
 */
// Maid: differs from Rapid here (the maxDegrees parameter is removed: the vertex count follows iD's rule, see getMaxAngle)
export function actionCircularize(wayID: EntityID): Action {

  const action = ((graph: Graph, t?: number): Graph => {
    if (t === null || !isFinite(t!)) t = 1;
    t = Math.min(Math.max(+t!, 0), 1);

    let way = graph.entity(wayID) as OsmWay;
    const origNodes: Record<EntityID, OsmNode> = {};

    for (const node of graph.childNodes(way)) {
      if (!origNodes[node.id]) {
        origNodes[node.id] = node;
      }
    }

    // Maid: a way with fewer than three nodes is not an area (kept from Rapid)
    if (Object.keys(origNodes).length < 3) return graph;

    // The local origin only keeps the numbers small (world coordinates are about 1.7e7 wide).
    const projection = localProjection(projWgs84ToWorld(origNodes[way.nodes[0]].loc!));

    // Maid: differs from Rapid here (iD makes a way that is not convex convex first, Rapid did not)
    if (!way.isConvex(graph)) {
      makeConvex(graph, wayID, projection);
    }

    // update the nodes: after makeConvex, these are the nodes at their new places
    const nodes = utilArrayUniq(graph.childNodes(way));

    // Maid: differs from Rapid here (iD: key nodes are members of more than one way or have interesting tags;
    // Rapid also counted members of relations, which iD does not)
    const keyNodes = nodes.filter(n => graph.parentWays(n).length > 1 || n.hasInterestingTags());
    const points = nodes.map(n => projection(n.loc!));
    const keyPoints = keyNodes.map(n => projection(n.loc!));
    const centroid = (points.length === 2)
      ? vecInterp(points[0], points[1], 0.5)
      : polygonCentroid(points);

    // Maid: differs from Rapid here (iD: the median distance of all nodes; Rapid used only the interesting nodes)
    const radius = median(points.map(p => vecLength(centroid, p)));
    const maxAngle = getMaxAngle(centroid, radius, projection);

    // Maid: differs from Rapid here (iD: the sign of the area of the current positions; Rapid used the geometry's winding)
    const sign = polygonArea(points) > 0 ? 1 : -1;

    // we need at least two key nodes for the algorithm to work
    if (!keyNodes.length) {
      keyNodes.push(nodes[0]);
      keyPoints.push(points[0]);
    }

    if (keyNodes.length === 1) {
      const index = nodes.indexOf(keyNodes[0]);
      const oppositeIndex = Math.floor((index + nodes.length / 2) % nodes.length);

      keyNodes.push(nodes[oppositeIndex]);
      keyPoints.push(points[oppositeIndex]);
    }

    // key points and nodes are those connected to the ways,
    // they are projected onto the circle, in between nodes are moved
    // to constant intervals between key nodes, extra in between nodes are
    // added if necessary.
    for (let i = 0; i < keyPoints.length; i++) {
      const nextKeyNodeIndex = (i + 1) % keyNodes.length;
      const startNode = keyNodes[i];
      const endNode = keyNodes[nextKeyNodeIndex];
      const startNodeIndex = nodes.indexOf(startNode);
      const endNodeIndex = nodes.indexOf(endNode);
      let numberNewPoints = -1;
      let indexRange = endNodeIndex - startNodeIndex;
      const nearNodes: Record<EntityID, number> = {};
      const inBetweenNodes: EntityID[] = [];

      if (indexRange < 0) {
        indexRange += nodes.length;
      }

      // position this key node
      const distance = vecLength(centroid, keyPoints[i]) || 1e-4;
      keyPoints[i] = [
        centroid[0] + (keyPoints[i][0] - centroid[0]) / distance * radius,
        centroid[1] + (keyPoints[i][1] - centroid[1]) / distance * radius
      ];
      let loc = projection.invert(keyPoints[i]);
      let node: OsmNode = keyNodes[i];
      let origNode = origNodes[node.id];
      node = node.move(vecInterp(origNode.loc!, loc, t!));
      graph.replace(node);

      // figure out the between delta angle we want to match to
      const startAngle = Math.atan2(keyPoints[i][1] - centroid[1], keyPoints[i][0] - centroid[0]);
      const endAngle = Math.atan2(keyPoints[nextKeyNodeIndex][1] - centroid[1], keyPoints[nextKeyNodeIndex][0] - centroid[0]);
      let totalAngle = endAngle - startAngle;

      // detects looping around -pi/pi
      if (totalAngle * sign > 0) {
        totalAngle = -sign * (TAU - Math.abs(totalAngle));
      }

      let eachAngle: number;
      do {
        numberNewPoints++;
        eachAngle = totalAngle / (indexRange + numberNewPoints);
      } while (Math.abs(eachAngle) > maxAngle);


      // move existing nodes
      for (let j = 1; j < indexRange; j++) {
        const angle = startAngle + j * eachAngle;
        loc = projection.invert([
          centroid[0] + Math.cos(angle) * radius,
          centroid[1] + Math.sin(angle) * radius
        ]);

        node = nodes[(j + startNodeIndex) % nodes.length];
        origNode = origNodes[node.id];
        nearNodes[node.id] = angle;

        node = node.move(vecInterp(origNode.loc!, loc, t!));
        graph.replace(node);
      }

      // add new in between nodes if necessary
      for (let j = 0; j < numberNewPoints; j++) {
        const angle = startAngle + (indexRange + j) * eachAngle;
        loc = projection.invert([
          centroid[0] + Math.cos(angle) * radius,
          centroid[1] + Math.sin(angle) * radius
        ]);

        // choose a nearnode to use as the original
        let min = Infinity;
        for (const nodeId in nearNodes) {
          const nearAngle = nearNodes[nodeId];
          const dist = Math.abs(nearAngle - angle);
          if (dist < min) {
            min = dist;
            origNode = origNodes[nodeId];
          }
        }

        // Maid: differs from Rapid here (iD takes the new node's start from the nearest node on the arc, at t;
        // Rapid interpolated between the two bracketing nodes in world coordinates)
        node = new OsmNode(way.context, { loc: vecInterp(origNode.loc!, loc, t!) });
        graph.replace(node);

        nodes.splice(endNodeIndex + j, 0, node);
        inBetweenNodes.push(node.id);
      }

      // Check for other ways that share these keyNodes..
      // If keyNodes are adjacent in both ways,
      // we can add inBetweenNodes to that shared way too..
      // Maid: differs from Rapid here (iD adds the new nodes to a shared way only when the two key nodes are
      // adjacent in this way (indexRange === 1) and adjacent in the shared way; Rapid added them to any edge
      // of the shared way that matched the arc)
      if (indexRange === 1 && inBetweenNodes.length) {
        const startIndex1 = way.nodes.lastIndexOf(startNode.id);
        const endIndex1 = way.nodes.lastIndexOf(endNode.id);
        let wayDirection1 = (endIndex1 - startIndex1);
        if (wayDirection1 < -1) { wayDirection1 = 1; }

        const parentWays = graph.parentWays(keyNodes[i]);
        for (let j = 0; j < parentWays.length; j++) {
          let sharedWay = parentWays[j];
          if (sharedWay.id === way.id) continue;

          if (sharedWay.isAdjacent(startNode.id, endNode.id)) {
            const startIndex2 = sharedWay.nodes.lastIndexOf(startNode.id);
            const endIndex2 = sharedWay.nodes.lastIndexOf(endNode.id);
            let wayDirection2 = (endIndex2 - startIndex2);
            let insertAt = endIndex2;
            if (wayDirection2 < -1) { wayDirection2 = 1; }

            if (wayDirection1 !== wayDirection2) {
              inBetweenNodes.reverse();
              insertAt = startIndex2;
            }
            for (let k = 0; k < inBetweenNodes.length; k++) {
              sharedWay = sharedWay.addNode(inBetweenNodes[k], insertAt + k);
            }
            graph.replace(sharedWay);
          }
        }
      }
    }

    // update the way to have all the new nodes
    const ids = nodes.map(n => n.id);
    ids.push(ids[0]);

    way = way.update({ nodes: ids });
    graph.replace(way);
    return graph.commit();
  }) as Action;


  /**
   * Returns a reason string if the circularize operation cannot be performed,
   * or `false` if it is allowed.
   * @param   graph - The current graph
   * @return  `'not_closed'` if the way is not closed;
   *          `'already_circular'` if it is already circular;
   *          `false` if the action is enabled
   */
  action.disabled = (graph: Graph): string | false => {
    const way = graph.entity(wayID) as OsmWay;
    if (!way.isClosed()) return 'not_closed';

    const nodes = utilArrayUniq(graph.childNodes(way));
    const projection = localProjection(projWgs84ToWorld(nodes[0].loc!));
    const points = nodes.map(n => projection(n.loc!));
    const hull = polygonHull(points);

    // Maid: differs from Rapid here (iD's check for fewer than three points is missing: it would fail on the null hull)
    if (!hull || hull.length !== points.length || hull.length < 3) return false;

    const centroid = polygonCentroid(points);
    const radius = median(points.map(p => vecLength(centroid, p)));
    const maxAngle = getMaxAngle(centroid, radius, projection);

    // compare distances between centroid and points
    for (const actualPoint of hull) {
      const actualDist = vecLength(actualPoint, centroid);
      const diff = Math.abs(actualDist - radius);
      // Maid: differs from Rapid here (iD compares distances, not squared distances, with 5%)
      if (diff > 0.05 * radius) {
        return false;
      }
    }

    // check if central angles are smaller than maxAngle
    for (let i = 0; i < hull.length; i++) {
      const actualPoint = hull[i];
      const nextPoint = hull[(i + 1) % hull.length];
      const startAngle = Math.atan2(actualPoint[1] - centroid[1], actualPoint[0] - centroid[0]);
      const endAngle = Math.atan2(nextPoint[1] - centroid[1], nextPoint[0] - centroid[0]);
      let angle = endAngle - startAngle;
      if (angle < 0) {
        angle = -angle;
      }
      if (angle > Math.PI) {
        angle = (TAU - angle);
      }

      // Maid: differs from Rapid here (iD's maxAngle from the size of the circle, not the maxDegrees parameter)
      if (angle > maxAngle + DEG2RAD) {
        return false;
      }
    }

    return 'already_circular';
  };


  action.transitionable = true;


  return action;
}


type Projection = ReturnType<typeof localProjection>;


/**
 * Projects WGS84 locations into local world coordinates (origin subtracted) and back.
 * The result has iD's `projection(loc)` and `projection.invert(point)`.
 * @param   origin - world coordinate of the local origin
 */
// The local origin is the first node (Rapid used the way's centroid); the arithmetic is the same up to translation.
function localProjection(origin: Vec2) {
  const project = (loc: Vec2): Vec2 => vecSubtract(projWgs84ToWorld(loc), origin);
  project.invert = (point: Vec2): Vec2 => projWorldToWgs84(vecAdd(point, origin));
  return project;
}


/**
 * Returns the maximum angle between two adjacent nodes of a circle with the given centroid and radius.
 * The circle has as many points as its size needs (about one per MAX_SEGMENT_LENGTH metres), but never fewer
 * than MIN_VERTICES or more than MAX_VERTICES. iD's getMaxAngle.
 * @param   centroid   - centroid of the circle (local coordinates)
 * @param   radius     - radius of the circle (local coordinates)
 * @param   projection - the local projection
 */
// Maid: differs from Rapid here (iD's rule for the number of vertices; Rapid used maxDegrees, 20 by default)
function getMaxAngle(centroid: Vec2, radius: number, projection: Projection): number {
  const radiusM = greatCircleMeters(
    projection.invert(centroid),
    projection.invert([centroid[0] + radius, centroid[1]])
  );
  const numberOfPoints = Math.min(MAX_VERTICES, Math.max(MIN_VERTICES,
    Math.round(radiusM * Math.PI / MAX_SEGMENT_LENGTH) * 2
  ));
  return TAU / (numberOfPoints - 1);
}


/**
 * Returns the great-circle distance in metres between two WGS84 locations, as iD's
 * `radiansToMeters(geoLength([a, b]))`.
 */
function greatCircleMeters(a: Vec2, b: Vec2): number {
  const lat1 = a[1] * DEG2RAD;
  const lat2 = b[1] * DEG2RAD;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * DEG2RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * EARTH_RADIUS_IN_METERS;
}


/**
 * Moves the interior nodes of a way that is not convex onto the surface of its convex hull.
 * Changes the graph in place. iD's makeConvex.
 * @param   graph      - the graph to change
 * @param   wayID      - the way whose nodes are moved
 * @param   projection - the local projection
 */
// Maid: differs from Rapid here (Rapid did not make a concave way convex first; iD does, with the loop below)
function makeConvex(graph: Graph, wayID: EntityID, projection: Projection): void {
  const way = graph.entity(wayID) as OsmWay;
  const nodes = utilArrayUniq(graph.childNodes(way));
  const points = nodes.map(n => projection(n.loc!));
  const sign = polygonArea(points) > 0 ? 1 : -1;
  const hull = polygonHull(points);
  if (!hull) return;

  // D3 convex hulls go counterclockwise..
  if (sign === -1) {
    nodes.reverse();
    points.reverse();
  }

  // As in iD, the loop stops at hull.length - 1, so the hull edge from its last point back to its first is not
  // straightened. Kept as iD has it (see the README).
  for (let i = 0; i < hull.length - 1; i++) {
    const startIndex = points.indexOf(hull[i]);
    const endIndex = points.indexOf(hull[i + 1]);
    let indexRange = endIndex - startIndex;

    if (indexRange < 0) {
      indexRange += nodes.length;
    }

    // move interior nodes to the surface of the convex hull..
    for (let j = 1; j < indexRange; j++) {
      const point = vecInterp(hull[i], hull[i + 1], j / indexRange);
      const node = nodes[(j + startIndex) % nodes.length].move(projection.invert(point));
      graph.replace(node);
    }
  }
}


/**
 * Returns the median of an array of numbers (the mean of the two middle values for an even count).
 * @param   values - the numbers
 * @returns median value
 */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0
    ? sorted[mid]                           // Odd length, use exact mid
    : (sorted[mid - 1] + sorted[mid]) / 2;  // Even length, take average
}


/**
 * Returns half the signed area of a polygon, with d3-polygon's sign convention.
 * iD's `d3_polygonArea`.
 */
function polygonArea(polygon: Vec2[]): number {
  let area = 0;
  let b = polygon[polygon.length - 1];

  for (let i = 0; i < polygon.length; i++) {
    const a = b;
    b = polygon[i];
    area += a[1] * b[0] - a[0] * b[1];
  }
  return area / 2;
}


/**
 * Returns the centroid of a polygon (its area centroid). iD's `d3_polygonCentroid`.
 */
function polygonCentroid(polygon: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  let k = 0;
  let b = polygon[polygon.length - 1];

  for (let i = 0; i < polygon.length; i++) {
    const a = b;
    b = polygon[i];
    const c = a[0] * b[1] - b[0] * a[1];
    k += c;
    x += (a[0] + b[0]) * c;
    y += (a[1] + b[1]) * c;
  }

  k *= 3;
  return [x / k, y / k];
}


/**
 * Returns the convex hull of the points, counterclockwise, as the same point objects. iD's `d3_polygonHull`
 * (monotone chain). Returns `null` for fewer than three points.
 */
function polygonHull(points: Vec2[]): Vec2[] | null {
  const n = points.length;
  if (n < 3) return null;

  const sortedPoints: number[][] = points.map((p, i) => [+p[0], +p[1], i]);
  sortedPoints.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const flippedPoints: number[][] = sortedPoints.map(p => [p[0], -p[1]]);

  const upperIndexes = upperHullIndexes(sortedPoints);
  const lowerIndexes = upperHullIndexes(flippedPoints);

  // Construct the hull polygon, removing possible duplicate endpoints.
  const skipLeft = lowerIndexes[0] === upperIndexes[0];
  const skipRight = lowerIndexes[lowerIndexes.length - 1] === upperIndexes[upperIndexes.length - 1];
  const hull: Vec2[] = [];

  // Add upper hull in right-to-left order.
  for (let i = upperIndexes.length - 1; i >= 0; i--) {
    hull.push(points[sortedPoints[upperIndexes[i]][2]]);
  }
  // Then add lower hull in left-to-right order.
  for (let i = skipLeft ? 1 : 0; i < lowerIndexes.length - (skipRight ? 1 : 0); i++) {
    hull.push(points[sortedPoints[lowerIndexes[i]][2]]);
  }
  return hull;
}


/**
 * Computes the upper convex hull of points sorted by x, as indices into `points` (d3-polygon's helper).
 */
function upperHullIndexes(points: number[][]): number[] {
  const n = points.length;
  const indexes = [0, 1];
  let size = 2;

  for (let i = 2; i < n; i++) {
    while (size > 1 && crossProduct(points[indexes[size - 2]], points[indexes[size - 1]], points[i]) <= 0) {
      size--;
    }
    indexes[size++] = i;
  }

  return indexes.slice(0, size);  // remove popped points
}


/**
 * Returns the cross product of AB and AC (d3-polygon's `cross`).
 */
function crossProduct(a: number[], b: number[], c: number[]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
