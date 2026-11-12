import { actionDeleteNode } from './delete_node.ts';
import { closeNodesToDrop } from './orthogonalize.ts';
import { DEG2RAD, projWorldToWgs84, vecAdd, vecInterp, vecProject, vecSubtract } from '@rapid-sdk/math';
import { geoOrthoNormalizedDotProduct } from '../geo/ortho.ts';
import { Graph } from '../lib/Graph.ts';
import { OsmNode } from '../data/OsmNode.ts';
import { OsmWay } from '../data/OsmWay.ts';

import type { Action } from './types.ts';
import type { Vec2 } from '@rapid-sdk/math';


/** Ways whose own directions differ by less than this are squared to one common direction */
const SAME_DIRECTION_DEGREES = 5;

/** "Square enough": no node would move by more than this share of the group's size */
const SQUARE_ENOUGH_SHARE = 1e-4;


/** One way of the group */
interface Ring {
  id: EntityID;
  isClosed: boolean;
  /** The nodes the shape is made of, without the closing node: all but the uninteresting ones on a straight edge */
  ids: EntityID[];
  /** Nodes that matter but are on a straight edge (they stay on it) */
  straight: Set<EntityID>;
}

/** What squaring computes, without changing the graph */
interface Plan {
  origin: Vec2;
  /** Old and new local world coordinate of every node of the shapes */
  from: Map<EntityID, Vec2>;
  to: Map<EntityID, Vec2>;
  /** Uninteresting nodes on a straight edge: go at t = 1, else onto the edge, with the way they are in */
  removable: Map<EntityID, EntityID>;
  rings: Ring[];
  /** No edge is near a right angle to another */
  notSquarish: boolean;
  /** Size of the group (diagonal of its box) in world units */
  size: number;
}


/**
 * Maid, not iD: squares several ways that share nodes (for example a row of buildings) together, as one shape.
 *
 * iD squares the selected ways one after the other. A node two buildings share is moved by the first building and moved
 * again by the second, which undoes part of the first: the wall between them is not square, and every further press
 * moves it a little more, it never comes to rest.
 *
 * Here, as JOSM's Orthogonalize does for several ways: the ways get one common direction (the length-weighted mean of
 * their edges, modulo 90°). Each edge within `threshold` of it runs along it or across it; every node of an edge along
 * the direction gets the same "across" coordinate, every node of an edge across it the same "along" coordinate, each
 * the mean of the nodes' coordinates before. So every building is square on its own, a shared wall is square in both
 * buildings, the outline of the row is square, the shape changes as little as the mean allows, and a second press has
 * nothing left to do. An edge further than `threshold` from both (a diagonal wall) keeps no rule and goes with its ends.
 *
 * Ways that point in clearly different directions (more than `SAME_DIRECTION_DEGREES`) get a direction of their own and
 * are squared after the larger group, keeping the nodes it already placed.
 *
 * As iD: consecutive nodes almost at the same place merge (`actionOrthogonalize`), uninteresting nodes on a straight
 * edge go, the ends of an open way stay where they are.
 *
 * @param   wayIDs     The ways, connected by shared nodes
 * @param   threshold  Degrees from the direction (or across it) within which an edge is squared (default: 13)
 * @return  An Action that squares the ways together
 */
export function actionOrthogonalizeWays(wayIDs: EntityID[], threshold?: number): Action {
  threshold ||= 13;
  const thr = threshold * DEG2RAD;
  const upperThreshold = Math.cos(thr);


  const action = function(graph: Graph, t?: number): Graph {
    if (t === null || t === undefined || !isFinite(t)) t = 1;
    t = Math.min(Math.max(+t, 0), 1);
    if (t === 0) return graph;

    for (const wayID of wayIDs) {
      let way = (graph.entity(wayID) as OsmWay).removeNode('');   // remove consecutive duplicates
      if (way.tags.nonsquare) {
        const tags = { ...way.tags };
        delete tags.nonsquare;
        way = way.update({ tags });
      }
      graph.replace(way);
    }

    // merge nodes almost at the same place, per way (the node that goes is in this way only)
    const dropped = new Set<EntityID>();
    for (const wayID of wayIDs) {
      const way = graph.entity(wayID) as OsmWay;
      const nodes = graph.childNodes(way).slice();
      if (way.isClosed()) nodes.pop();
      for (const [droppedID, keptID] of closeNodesToDrop(graph, nodes, way.isClosed())) {
        dropped.add(droppedID);
        if (t === 1) {
          graph = actionDeleteNode(droppedID)(graph);
        } else {
          const dropping = graph.entity(droppedID) as OsmNode;
          const keeping = graph.entity(keptID) as OsmNode;
          graph.replace(dropping.move(vecInterp(dropping.loc!, keeping.loc!, t)));
        }
      }
    }

    const plan = makePlan(graph, dropped);
    if (!plan || plan.notSquarish) return graph.commit();
    const { origin, from, to, removable, rings } = plan;

    const moveTo = (id: EntityID, coord: Vec2) => {
      const node = graph.entity(id) as OsmNode;
      graph.replace(node.move(vecInterp(node.loc!, projWorldToWgs84(vecAdd(coord, origin)), t!)));
    };

    for (const [id, coord] of to) {
      const old = from.get(id)!;
      if (old[0] !== coord[0] || old[1] !== coord[1]) moveTo(id, coord);
    }

    for (const [id, wayID] of removable) {
      const node = graph.entity(id) as OsmNode;
      if (t === 1) {
        graph = actionDeleteNode(id)(graph);
        continue;
      }
      const ring = rings.find(r => r.id === wayID)!;
      const coords = ring.ids.map(n => to.get(n)!);
      if (ring.isClosed) coords.push(coords[0]);
      const old = node.geoms.parts[0].world?.coords as Vec2 | undefined;
      const closest = old && vecProject(vecSubtract(old, origin), coords);
      if (closest) moveTo(id, closest.point);
    }

    return graph.commit();
  } as Action;


  /**
   * Where every node goes.
   * @param   graph    The graph
   * @param   dropped  Nodes that are merged away (still in the graph while transitioning)
   * @return  The plan, or undefined when a node has no coordinate
   */
  function makePlan(graph: Graph, dropped: Set<EntityID>): Plan | undefined {
    let origin: Vec2 | undefined;
    const from = new Map<EntityID, Vec2>();
    const rings: Ring[] = [];
    const removable = new Map<EntityID, EntityID>();
    const pinned = new Set<EntityID>();

    for (const wayID of wayIDs) {
      const way = graph.entity(wayID) as OsmWay;
      const isClosed = way.isClosed();
      const nodes = graph.childNodes(way).filter(node => !dropped.has(node.id));
      if (isClosed) nodes.pop();
      for (const node of nodes) {
        const coord = node.geoms.parts[0].world?.coords as Vec2 | undefined;
        if (!coord) return undefined;
        if (!origin) origin = coord;
        from.set(node.id, vecSubtract(coord, origin));
      }
      if (!isClosed && nodes.length) {
        pinned.add(nodes[0].id);
        pinned.add(nodes[nodes.length - 1].id);
      }

      // as iD: nodes on a nearly straight edge are not corners; the uninteresting ones go
      const count = new Map<EntityID, number>();
      for (const node of nodes) count.set(node.id, (count.get(node.id) ?? 0) + 1);
      const ids: EntityID[] = [];
      const straight = new Set<EntityID>();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let isStraight = false;
        if (nodes.length > 3 && (isClosed || (i > 0 && i < nodes.length - 1)) && count.get(node.id) === 1) {
          const a = from.get(nodes[(i - 1 + nodes.length) % nodes.length].id)!;
          const b = from.get(nodes[(i + 1) % nodes.length].id)!;
          isStraight = Math.abs(geoOrthoNormalizedDotProduct(a, b, from.get(node.id)!)) > upperThreshold;
        }
        if (isStraight && !node.isInteresting(graph)) {
          removable.set(node.id, wayID);
          continue;
        }
        if (isStraight) straight.add(node.id);
        ids.push(node.id);
      }
      if (ids.length < 3) return undefined;
      rings.push({ id: wayID, isClosed, ids, straight });
    }
    if (!origin) return undefined;
    for (const id of removable.keys()) from.delete(id);

    // the edges of each way, and groups of ways that point the same way
    const edgesOf = (ring: Ring): [EntityID, EntityID][] => {
      const edges: [EntityID, EntityID][] = [];
      const n = ring.ids.length;
      for (let i = 0; i < (ring.isClosed ? n : n - 1); i++) edges.push([ring.ids[i], ring.ids[(i + 1) % n]]);
      return edges;
    };
    const groups: { rings: Ring[]; angle: number; length: number }[] = [];
    for (const ring of rings) {
      const { angle, length } = direction(edgesOf(ring), from);
      const group = groups.find(g => Math.abs(angleDiff(g.angle, angle)) < SAME_DIRECTION_DEGREES * DEG2RAD);
      if (group) {
        group.rings.push(ring);
        group.angle = direction(group.rings.flatMap(edgesOf), from).angle;
        group.length += length;
      } else {
        groups.push({ rings: [ring], angle, length });
      }
    }
    groups.sort((a, b) => b.length - a.length);

    // per group: same "along" (u) or "across" (v) coordinate for the ends of each edge, the mean (or the pinned value)
    const to = new Map(from);
    let notSquarish = true;
    for (const group of groups) {
      const cos = Math.cos(group.angle), sin = Math.sin(group.angle);
      const uv = (c: Vec2): Vec2 => [c[0] * cos + c[1] * sin, -c[0] * sin + c[1] * cos];
      const xy = (c: Vec2): Vec2 => [c[0] * cos - c[1] * sin, c[0] * sin + c[1] * cos];
      const sameU = new UnionFind(), sameV = new UnionFind();
      const ids = new Set<EntityID>();
      for (const [a, b] of group.rings.flatMap(edgesOf)) {
        ids.add(a); ids.add(b);
        const d = vecSubtract(from.get(b)!, from.get(a)!);
        if (d[0] === 0 && d[1] === 0) continue;
        const off = Math.abs(angleDiff(Math.atan2(d[1], d[0]), group.angle));   // 0: along, π/2: across
        if (off < thr) {
          sameV.union(a, b);
          notSquarish = false;
        } else if (Math.abs(off - Math.PI / 2) < thr) {
          sameU.union(a, b);
          notSquarish = false;
        }
      }
      const current = new Map([...ids].map(id => [id, uv(to.get(id)!)] as const));
      const mean = (uf: UnionFind, k: 0 | 1) => {
        const sums = new Map<EntityID, { all: number; n: number; pin: number; p: number }>();
        for (const id of ids) {
          const root = uf.find(id);
          const s = sums.get(root) ?? { all: 0, n: 0, pin: 0, p: 0 };
          s.all += current.get(id)![k]; s.n++;
          if (pinned.has(id)) { s.pin += current.get(id)![k]; s.p++; }
          sums.set(root, s);
        }
        return (id: EntityID) => {
          const s = sums.get(uf.find(id))!;
          return s.p ? s.pin / s.p : s.all / s.n;
        };
      };
      const u = mean(sameU, 0), v = mean(sameV, 1);
      for (const id of ids) {
        if (!pinned.has(id)) to.set(id, xy([u(id), v(id)]));
        pinned.add(id);   // later groups keep it
      }
    }

    // nodes that matter on a diagonal straight edge: back onto the line of their neighbours
    for (const ring of rings) {
      const n = ring.ids.length;
      for (let i = 0; i < n; i++) {
        const id = ring.ids[i];
        if (!ring.straight.has(id)) continue;
        const a = to.get(ring.ids[(i - 1 + n) % n])!, b = to.get(ring.ids[(i + 1) % n])!;
        const closest = vecProject(to.get(id)!, [a, b]);
        if (closest) to.set(id, closest.point);
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of from.values()) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { origin, from, to, removable, rings, notSquarish, size: Math.hypot(maxX - minX, maxY - minY) };
  }


  /**
   * Returns why the ways can't be squared together, or `false`.
   * @param   graph  The current graph
   * @return  `'not_squarish'` when no edge is near the common direction or across it, `'square_enough'` when no node
   *          would move (more than `SQUARE_ENOUGH_SHARE` of the group's size), or `false`
   */
  action.disabled = function(graph: Graph): string | false {
    for (const wayID of wayIDs) {
      const way = graph.entity(wayID) as OsmWay;
      const nodes = graph.childNodes(way).slice();
      if (way.isClosed()) nodes.pop();
      if (closeNodesToDrop(graph, nodes, way.isClosed()).size > 0) return false;
    }
    const plan = makePlan(graph, new Set());
    if (!plan || plan.notSquarish) return 'not_squarish';
    if (plan.removable.size) return false;
    for (const [id, coord] of plan.to) {
      const old = plan.from.get(id)!;
      if (Math.hypot(coord[0] - old[0], coord[1] - old[1]) > SQUARE_ENOUGH_SHARE * plan.size) return false;
    }
    return 'square_enough';
  };


  action.transitionable = true;

  return action;
}


/**
 * The direction of a set of edges, modulo 90°: the mean of 4 × each edge's angle, weighted by its length, then
 * again with only the edges near the result (a diagonal wall does not tilt the rest).
 * @param   edges   Pairs of node ids
 * @param   coords  Coordinates by node id
 * @return  The angle in radians, and the total length of the edges
 */
function direction(edges: [EntityID, EntityID][], coords: Map<EntityID, Vec2>): { angle: number; length: number } {
  const vectors = edges.map(([a, b]) => vecSubtract(coords.get(b)!, coords.get(a)!)).filter(d => d[0] || d[1]);
  const length = vectors.reduce((sum, d) => sum + Math.hypot(d[0], d[1]), 0);
  let angle = 0;
  let near = vectors;
  for (let pass = 0; pass < 3; pass++) {
    let c = 0, s = 0;
    for (const d of near) {
      const len = Math.hypot(d[0], d[1]);
      const phi = Math.atan2(d[1], d[0]);
      c += len * Math.cos(4 * phi);
      s += len * Math.sin(4 * phi);
    }
    if (c === 0 && s === 0) break;
    angle = Math.atan2(s, c) / 4;
    near = vectors.filter(d => {
      const off = Math.abs(angleDiff(Math.atan2(d[1], d[0]), angle));
      return off < 15 * DEG2RAD || Math.abs(off - Math.PI / 2) < 15 * DEG2RAD;
    });
    if (!near.length) break;
  }
  return { angle, length };
}


/**
 * The difference of two angles modulo 180°, in [-90°, 90°) as radians: 0 for parallel, ±π/2 for across.
 * @param   a  An angle in radians
 * @param   b  An angle in radians
 * @return  a − b, modulo π
 */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  if (d >= Math.PI / 2) d -= Math.PI;
  return d;
}


/** Union-find over node ids */
class UnionFind {
  private parent = new Map<EntityID, EntityID>();

  find(id: EntityID): EntityID {
    let root = id;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: EntityID, b: EntityID): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}
