import { actionDeleteNode } from './delete_node.ts';
import { DEG2RAD, geoSphericalDistance, projWorldToWgs84, vecAdd, vecEqual, vecInterp, vecLength, vecNormalize, vecProject, vecScale, vecSubtract } from '@rapid-sdk/math';
import { geoOrthoCalcScore, geoOrthoCanOrthogonalize, geoOrthoNormalizedDotProduct } from '../geo/ortho.ts';
import { Graph } from '../lib/Graph.ts';
import { OsmNode } from '../data/OsmNode.ts';
import { OsmWay } from '../data/OsmWay.ts';

import type { Action } from './types.ts';
import type { Vec2 } from '@rapid-sdk/math';


/**
 * Maid, not iD: two consecutive nodes of a squared way that are closer than this become one. iD keeps them, even at
 * the same place (iD #9155): a step a few centimetres long then counts as two right angles, and the shape is
 * "already square" with a redundant pair of nodes in it (for example after the extrude tool lined up two edges).
 */
export const SQUARE_MERGE_METERS = 0.2;

/** A way whose box has a shorter diagonal than this keeps its close nodes: they may be the detail (as iD's close_nodes) */
const SQUARE_MERGE_MIN_WAY_METERS = 1.5;


/** Point with ID and coordinate for orthogonalization */
interface OrthoPoint {
  id: EntityID;
  coord: Vec2;
}

/** Corner tracking for triangle orthogonalization */
interface Corner {
  i: number;
  dotp: number;
}


/**
 * Attempts to orthogonalize a way by making its angles closer to 90°.
 * For ways with 3 nodes, adjusts only the corner vertex.
 * For larger polygons, iteratively adjusts vertices to achieve right angles.
 *
 * @param   wayID      - EntityID of the way to orthogonalize
 * @param   vertexID   - Optional specific vertex to orthogonalize
 * @param   threshold  - Degree threshold for angle adjustment (default: 13)
 * @param   epsilon    - Epsilon for convergence testing (default: 1e-4)
 * @return  An Action function that orthogonalizes the given way
 */
export function actionOrthogonalize(
  wayID: EntityID,
  vertexID?: EntityID,
  threshold?: number,
  epsilon?: number
): Action {

  epsilon ||= 1e-4;
  threshold ||= 13;  // degrees within right or straight to alter

  // We test normalized dot products so we can compare as cos(angle)
  const lowerThreshold: number = Math.cos((90 - threshold) * DEG2RAD);
  const upperThreshold: number = Math.cos(threshold * DEG2RAD);


  const action = function(graph: Graph, t?: number): Graph {
    if (t === null || t === undefined || !isFinite(t)) t = 1;
    t = Math.min(Math.max(+t, 0), 1);
    if (t === 0) return graph;

    let way = graph.entity(wayID) as OsmWay;
    way = way.removeNode('');   // sanity check - remove any consecutive duplicates

    // since we're squaring, remove indication that this is physically unsquare
    if (way.tags.nonsquare) {
      const tags = { ...way.tags };  // shallow copy
      delete tags.nonsquare;
      way = way.update({ tags: tags });
    }

    graph.replace(way);

    const isClosed: boolean = way.isClosed();
    let nodes: OsmNode[] = graph.childNodes(way).slice();  // shallow copy
    if (isClosed) nodes.pop();

    // If orthogonalizing a single vertex, gather its neighbor nodes.
    if (vertexID !== undefined) {
      nodes = getSelfAndNeighbors(nodes, vertexID, isClosed);
      if (nodes.length !== 3) return graph.commit();
    }

    // Maid: merge nodes that are almost at the same place, before the angles are looked at. The node that goes
    // is an uninteresting one, the one that stays may then be on a straight line and goes as such below.
    if (vertexID === undefined) {
      const dropped = closeNodesToDrop(graph, nodes, isClosed);
      if (dropped.size) {
        for (const [droppedID, keptID] of dropped) {
          if (t === 1) {
            graph = actionDeleteNode(droppedID)(graph);
          } else {
            const dropping = graph.entity(droppedID) as OsmNode;
            const keeping = graph.entity(keptID) as OsmNode;
            graph.replace(dropping.move(vecInterp(dropping.loc!, keeping.loc!, t)));
          }
        }
        nodes = nodes.filter(node => !dropped.has(node.id));
      }
    }

    // note: all geometry functions here use the unclosed node/point/coord list
    const nodeCount: Record<EntityID, number> = {};
    const points: OrthoPoint[] = [];
    let origin: Vec2 | undefined;
    const corner: Corner = { i: 0, dotp: 1 };
    let node: OsmNode;
    let point: OrthoPoint;
    let score: number;
    let motions: Vec2[];

    // Gather world coordinates, choose a local origin for floating point stability.
    for (const node of nodes) {
      const coord = node.geoms.parts[0].world?.coords as Vec2;  // A node should have a single world coord
      if (!coord) continue;
      if (!origin) origin = coord;
      nodeCount[node.id] = (nodeCount[node.id] || 0) + 1;
      points.push({
        id: node.id,
        coord: vecSubtract(coord, origin)   // world -> local
      });
    }
    if (!origin || !points.length) return graph;

    // Right triangle, move only one vertex..
    if (points.length === 3) {
      for (let i = 0; i < 1000; i++) {
        motions = points.map(calcMotion);
        points[corner.i].coord = vecAdd(points[corner.i].coord, motions[corner.i]);
        score = corner.dotp;
        if (score < epsilon) break;
      }

      node = graph.entity(nodes[corner.i].id) as OsmNode;
      const coord = vecAdd(points[corner.i].coord, origin);  // local -> world
      const loc2 = projWorldToWgs84(coord);
      graph.replace(node.move(vecInterp(node.loc!, loc2, t)));

    // More than 3 points, orthogonalize shape..
    } else {
      const straights: OrthoPoint[] = [];
      const simplified: OrthoPoint[] = [];

      // Remove points from nearly straight sections..
      // This produces a simplified shape to orthogonalize
      for (let i = 0; i < points.length; i++) {
        point = points[i];
        let dotp = 0;
        if (isClosed || (i > 0 && i < points.length - 1)) {
          const a: OrthoPoint = points[(i - 1 + points.length) % points.length];
          const b: OrthoPoint = points[(i + 1) % points.length];
          dotp = Math.abs(geoOrthoNormalizedDotProduct(a.coord, b.coord, point.coord));
        }

        if (dotp > upperThreshold) {
          straights.push(point);
        } else {
          simplified.push(point);
        }
      }

      // Orthogonalize the simplified shape
      const originalPoints: OrthoPoint[] = structuredClone(simplified);
      let movedPoints: OrthoPoint[] = structuredClone(simplified);

      // Determine target positions.
      score = Infinity;
      for (let i = 0; i < 1000; i++) {
        motions = simplified.map(calcMotion);

        for (let j = 0; j < motions.length; j++) {
          simplified[j].coord = vecAdd(simplified[j].coord, motions[j]);
        }
        const newScore: number = geoOrthoCalcScore(simplified, isClosed, epsilon, threshold);
        if (newScore < score) {
          movedPoints = structuredClone(simplified);
          score = newScore;
        }
        if (score < epsilon) break;
      }

      const movedCoords: Vec2[] = movedPoints.map(p => p.coord);
      if (isClosed) movedCoords.push(movedCoords[0]);

      // Move the nodes that should move.
      for (let i = 0; i < movedPoints.length; i++) {
        point = movedPoints[i];
        if (!vecEqual(originalPoints[i].coord, point.coord)) {
          node = graph.entity(point.id) as OsmNode;
          const coord = vecAdd(point.coord, origin);  // local -> world
          const loc2 = projWorldToWgs84(coord);
          graph.replace(node.move(vecInterp(node.loc!, loc2, t)));
        }
      }

      // Deal with nodes along straight segments.
      // if t=1, remove them if uninteresting,
      // else relocate them to the edge of the shape
      for (const point of straights) {
        if (nodeCount[point.id] > 1) continue;   // skip self-intersections

        node = graph.entity(point.id) as OsmNode;

        if (t === 1 && !node.isInteresting(graph)) {
          graph = actionDeleteNode(node.id)(graph);
        } else {
          const closest = vecProject(point.coord, movedCoords);
          if (closest) {
            const coord = vecAdd(closest.point, origin);  // local -> world
            const loc2 = projWorldToWgs84(coord);
            graph.replace(node.move(vecInterp(node.loc!, loc2, t)));
          }
        }
      }
    }

    return graph.commit();


    /**
     * Computes the motion vector that moves vertex `i` toward a right angle
     * with its two neighbours.  Returns `[0, 0]` for endpoints of open ways,
     * self-intersecting nodes, or vertices whose angle is already close enough
     * to orthogonal.
     * @param   point - The vertex to move, with `coord` in local-origin world units
     * @param   i     - Index of the vertex in `arr`
     * @param   arr   - Full ordered array of vertices
     * @return  Motion vector in local-origin world units
     */
    function calcMotion(point: OrthoPoint, i: number, arr: OrthoPoint[]): Vec2 {
      // don't try to move the endpoints of a non-closed way.
      if (!isClosed && (i === 0 || i === arr.length - 1)) return [0, 0];
      // don't try to move a node that appears more than once (self intersection)
      if (nodeCount[arr[i].id] > 1) return [0, 0];

      const a: Vec2 = arr[(i - 1 + arr.length) % arr.length].coord;
      const origin: Vec2 = point.coord;
      const b: Vec2 = arr[(i + 1) % arr.length].coord;
      let p: Vec2 = vecSubtract(a, origin);
      let q: Vec2 = vecSubtract(b, origin);

      const scale: number = 2 * Math.min(vecLength(p), vecLength(q));
      p = vecNormalize(p);
      q = vecNormalize(q);

      const dotp: number = (p[0] * q[0] + p[1] * q[1]);
      const val: number = Math.abs(dotp);

      if (val < lowerThreshold) {  // nearly orthogonal
        corner.i = i;
        corner.dotp = val;
        const vec: Vec2 = vecNormalize(vecAdd(p, q));
        return vecScale(vec, 0.1 * dotp * scale);
      }

      return [0, 0];   // do nothing
    }
  } as Action;


  /**
   * Maid: which nodes of the way go because they are almost at the place of their neighbour (`SQUARE_MERGE_METERS`),
   * each with the node that stays there. Only an uninteresting node goes (no tags that matter, in this way only and
   * once, in no relation), and not an end of an open way. Nothing goes when fewer than three nodes would be left or
   * the way is tiny.
   * @param   graph     The graph
   * @param   nodes     The way's nodes, without the closing node of a closed way
   * @param   isClosed  Whether the way is closed
   * @return  Dropped node id → the id of the node that stays at its place
   */
  function closeNodesToDrop(graph: Graph, nodes: OsmNode[], isClosed: boolean): Map<EntityID, EntityID> {
    const dropped = new Map<EntityID, EntityID>();
    if (nodes.length < 4 || nodes.some(node => !node.loc)) return dropped;

    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const node of nodes) {
      const [lon, lat] = node.loc!;
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    if (geoSphericalDistance([minLon, minLat], [maxLon, maxLat]) < SQUARE_MERGE_MIN_WAY_METERS) return dropped;

    const count = new Map<EntityID, number>();
    for (const node of nodes) count.set(node.id, (count.get(node.id) ?? 0) + 1);
    const ends = isClosed ? new Set<EntityID>() : new Set([nodes[0].id, nodes[nodes.length - 1].id]);
    const canDrop = (node: OsmNode) => count.get(node.id) === 1 && !ends.has(node.id) && !node.isInteresting(graph);
    const close = (a: OsmNode, b: OsmNode) => a.id !== b.id && geoSphericalDistance(a.loc!, b.loc!) < SQUARE_MERGE_METERS;

    const kept: OsmNode[] = [];
    for (const node of nodes) {
      const last = kept[kept.length - 1];
      if (last && close(last, node)) {
        if (canDrop(node)) {
          dropped.set(node.id, last.id);
          continue;
        }
        if (canDrop(last)) {
          dropped.set(last.id, node.id);
          kept[kept.length - 1] = node;
          continue;
        }
      }
      kept.push(node);
    }
    if (isClosed && kept.length > 1) {
      const first = kept[0];
      const last = kept[kept.length - 1];
      if (close(last, first)) {
        if (canDrop(last)) {
          dropped.set(last.id, first.id);
          kept.pop();
        } else if (canDrop(first)) {
          dropped.set(first.id, last.id);
          kept.shift();
        }
      }
    }
    if (kept.length < 3) return new Map();

    // a node can stay for one that went for another one later: point every dropped node at the one that stays
    const stays = new Set(kept.map(node => node.id));
    for (const [droppedID, keptID] of dropped) {
      let target = keptID;
      while (!stays.has(target)) target = dropped.get(target)!;
      dropped.set(droppedID, target);
    }
    return dropped;
  }


  /**
   * Given a nodelist and target nodeID, returns [previous, target, next].
   * Note that the nodelist array will already have its connecting node popped off,
   * so we need to pass in the `isClosed` flag to decide whether to treat it like a closed loop.
   * @param   nodes     The nodes array
   * @param   targetID  The vertex we are interested in
   * @param   isClosed  Whether the node array should be treated as a closed loop
   * @return  The target node and neighbors, as [previous, target, next]
   */
  function getSelfAndNeighbors(nodes: OsmNode[], targetID: EntityID, isClosed: boolean): OsmNode[] {
    const first: number = isClosed ? 0 : 1;
    const last: number = isClosed ? nodes.length : nodes.length - 1;

    for (let i = first; i < last; i++) {
      if (nodes[i].id === targetID) {
        return [
          nodes[(i - 1 + nodes.length) % nodes.length],
          nodes[i],
          nodes[(i + 1) % nodes.length]
        ];
      }
    }

    return [];
  }


  /**
   * Returns a reason string if the orthogonalize operation cannot be performed,
   * or `false` if it is allowed.
   * @param   graph - The current graph
   * @return  `'end_vertex'` if a single vertex is at an end of the way and has no two neighbors;
   *          `'not_squarish'` if the geometry cannot be made square;
   *          `'square_enough'` if all angles are already within the squareness tolerance;
   *          `false` if the action is enabled
   */
  action.disabled = function(graph: Graph): string | false {
    graph = graph.snapshot();    // make a copy
    let way = graph.entity(wayID) as OsmWay;
    way = way.removeNode('');    // sanity check - remove any consecutive duplicates
    graph.replace(way);

    const isClosed: boolean = way.isClosed();
    let nodes: OsmNode[] = graph.childNodes(way).slice();  // shallow copy
    if (isClosed) nodes.pop();

    let allowStraightAngles = false;
    if (vertexID !== undefined) {  // If orthogonalizing a single vertex, gather its neighbor nodes.
      allowStraightAngles = true;
      nodes = getSelfAndNeighbors(nodes, vertexID, isClosed);
      if (nodes.length !== 3) return 'end_vertex';
    }

    // Maid: nodes almost at the same place are merged by squaring, so there is something to do
    if (vertexID === undefined && closeNodesToDrop(graph, nodes, isClosed).size > 0) return false;

    // Gather world coordinates, choose a local origin for floating point stability.
    const points: Vec2[] = [];
    let origin: Vec2 | undefined;

    for (const node of nodes) {
      const coord = node.geoms.parts[0].world?.coords as Vec2;  // A node should have a single world coord
      if (!coord)  continue;
      if (!origin) origin = coord;
      points.push(vecSubtract(coord, origin));  // world -> local
    }
    if (!origin || !points.length) {
      return 'not_squarish';
    }

    const score: number | null = geoOrthoCanOrthogonalize(points, isClosed, epsilon, threshold, allowStraightAngles);
    if (score === null) {
      return 'not_squarish';
    } else if (score === 0) {
      return 'square_enough';
    } else {
      return false;
    }
  };


  action.transitionable = true;

  return action;
}
