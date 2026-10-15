// A* over the routing graph, with edge-based states so that turn restrictions can apply.
//
// A state is an arc: the traversal of one edge in one direction. Arriving at a node by an arc, the
// next arc is checked against the turn restrictions at that node. Two extra states, the start
// departures, stand for a start point inside an edge (it leaves that edge in either direction). The
// end point inside an edge is an exit: from the node at one end of its edge, with the partial length
// to the point. The heuristic is the great-circle distance times the profile's cheapest factor, which
// never overestimates, so the first goal state taken from the heap is the cheapest route.
//
// The route comes back as way ranges. A piece that starts or ends inside a way carries a split point:
// the way must be split there, which the caller does (the router only reports where).
import { haversine } from './geo.ts'
import { snapToGraph, type RoutingGraph, type SplitPoint, type Snap } from './graph.ts'
import { MinHeap } from './heap.ts'
import { isForbidden } from './restrictions.ts'

/** A start or end of a route: a graph node, a coordinate (snapped to the nearest routable way), or a snap */
export type Endpoint = { node: EntityID } | { loc: [number, number] } | { snap: Snap }

export interface RouteOptions {
  /** How far a coordinate may be from a routable way, in metres. Default 200 */
  maxSnapM?: number
  /** Stop after this many expansions. Default 10 million */
  maxExpansions?: number
  /** `false` turns the search into Dijkstra. For checking the heuristic; the default is `true` */
  heuristic?: boolean
}

/**
 * One stretch of the route on one way. `fromIndex` and `toIndex` are indices into `way.nodes`: the
 * first and last way node the route covers, in route order. `forward` is true when the route runs in
 * the way's node order. A stretch that starts inside the way has `startSplit` (the route begins at
 * that point, between `fromIndex - 1` and `fromIndex` when forward, or between `fromIndex` and
 * `fromIndex + 1` when backward). Likewise `endSplit` for the end. When both ends lie inside one
 * segment, `fromIndex` and `toIndex` describe no whole node between them: `fromIndex > toIndex`.
 */
export interface RouteSegment {
  wayId: EntityID
  fromIndex: number
  toIndex: number
  forward: boolean
  lengthM: number
  startSplit?: SplitPoint
  endSplit?: SplitPoint
}

export type RouteResult =
  | {
      ok: true
      segments: RouteSegment[]
      /** Every split the route needs, in route order */
      splits: SplitPoint[]
      lengthM: number
      /** Length times the profile factors: what the router minimised */
      cost: number
      expanded: number
    }
  | {
      ok: false
      reason: 'start-not-routable' | 'end-not-routable' | 'no-path' | 'limit'
      expanded: number
    }

/** A stretch of one edge, before merging. Internal */
interface Piece {
  way: number
  from: number
  to: number
  forward: boolean
  lengthM: number
  cost: number
  start?: SplitPoint
  end?: SplitPoint
}

interface Exit {
  /** Node the exit leaves from, or the node the route ends at */
  node: number
  /** Way the exit runs on, or -1 at a node end (no restriction applies) */
  way: number
  cost: number
  piece?: Piece
}

interface Anchor {
  node?: number
  snap?: Snap
  loc: [number, number]
}

const DIRECT = -2
const EXIT_ONLY = -3
const NONE = -1

export function findRoute(
  rg: RoutingGraph,
  from: Endpoint,
  to: Endpoint,
  options: RouteOptions = {},
): RouteResult {
  const maxSnapM = options.maxSnapM ?? 200
  const useHeuristic = options.heuristic ?? true
  const limit = options.maxExpansions ?? 10_000_000

  const start = anchorOf(rg, from, maxSnapM)
  if (!start) return { ok: false, reason: 'start-not-routable', expanded: 0 }
  const goal = anchorOf(rg, to, maxSnapM)
  if (!goal) return { ok: false, reason: 'end-not-routable', expanded: 0 }
  if (start.node !== undefined && start.node === goal.node) {
    return { ok: true, segments: [], splits: [], lengthM: 0, cost: 0, expanded: 0 }
  }

  const edgeCount = rg.edgeFrom.length
  const arcCount = 2 * edgeCount
  const GOAL = arcCount + 2
  const minFactor = rg.profile.minFactor
  const goalLon = goal.snap ? goal.snap.loc[0] : rg.nodeLon[goal.node!]!
  const goalLat = goal.snap ? goal.snap.loc[1] : rg.nodeLat[goal.node!]!
  const heuristic = (node: number) =>
    useHeuristic ? haversine(rg.nodeLon[node]!, rg.nodeLat[node]!, goalLon, goalLat) * minFactor : 0

  // Arcs: real ones are 0 .. arcCount - 1; the two start departures are arcCount and arcCount + 1
  const departures: Array<{ head: number; piece: Piece }> = []
  const headOf = (a: number) => {
    if (a >= arcCount) return departures[a - arcCount]!.head
    const e = a >> 1
    return a & 1 ? rg.edgeFrom[e]! : rg.edgeTo[e]!
  }
  const wayOf = (a: number) =>
    a >= arcCount ? departures[a - arcCount]!.piece.way : rg.edgeWay[a >> 1]!
  const costOf = (a: number) =>
    a >= arcCount ? departures[a - arcCount]!.piece.cost : rg.edgeCost[a >> 1]!

  // Exits: how the route can reach the end
  const exits = new Map<number, Exit[]>()
  const addExit = (exit: Exit) => {
    const list = exits.get(exit.node) ?? []
    list.push(exit)
    exits.set(exit.node, list)
  }
  if (goal.node !== undefined) addExit({ node: goal.node, way: NONE, cost: 0 })
  else {
    const snap = goal.snap!
    const e = snap.edge
    if (rg.edgeFwd[e]) {
      const piece = exitPiece(rg, snap, true)
      addExit({ node: rg.edgeFrom[e]!, way: piece.way, cost: piece.cost, piece })
    }
    if (rg.edgeBwd[e]) {
      const piece = exitPiece(rg, snap, false)
      addExit({ node: rg.edgeTo[e]!, way: piece.way, cost: piece.cost, piece })
    }
  }

  const g = new Float64Array(arcCount + 3).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(arcCount + 3).fill(NONE)
  const closed = new Uint8Array(arcCount + 3)
  const heap = new MinHeap()

  let bestGoal = Number.POSITIVE_INFINITY
  let goalPrev = NONE
  let goalExit: Exit | undefined
  let directChosen: Piece | undefined

  // Start: a node leaves by its arcs; a point inside an edge leaves by the edge's ends
  if (start.node !== undefined) {
    const node = start.node
    for (let i = rg.outStart[node]!; i < rg.outStart[node + 1]!; i++) {
      const arc = rg.outArcs[i]!
      const cost = costOf(arc)
      g[arc] = cost
      heap.push(cost + heuristic(headOf(arc)), arc)
    }
    // The end point lies on an edge that leaves the start node: no turn is needed to reach it
    for (const exit of exits.get(node) ?? []) {
      if (exit.way === NONE || exit.cost >= bestGoal) continue
      bestGoal = exit.cost
      goalPrev = EXIT_ONLY
      goalExit = exit
      heap.push(exit.cost, GOAL)
    }
  } else {
    const snap = start.snap!
    const e = snap.edge
    if (rg.edgeFwd[e]) {
      const piece = startPiece(rg, snap, true)
      departures.push({ head: rg.edgeTo[e]!, piece })
    }
    if (rg.edgeBwd[e]) {
      const piece = startPiece(rg, snap, false)
      departures.push({ head: rg.edgeFrom[e]!, piece })
    }
    for (let i = 0; i < departures.length; i++) {
      const arc = arcCount + i
      const cost = costOf(arc)
      g[arc] = cost
      heap.push(cost + heuristic(headOf(arc)), arc)
    }
    // Both ends on one edge: the direct stretch, if the way allows its direction
    if (goal.snap && goal.snap.edge === snap.edge) {
      directChosen = directPiece(rg, snap, goal.snap)
      if (directChosen) {
        bestGoal = directChosen.cost
        goalPrev = DIRECT
        heap.push(directChosen.cost, GOAL)
      }
    }
  }

  let expanded = 0
  let found = false

  while (heap.size > 0) {
    const id = heap.pop()
    if (id === GOAL) {
      found = true
      break
    }
    if (closed[id]) continue
    closed[id] = 1
    expanded++
    if (expanded > limit) return { ok: false, reason: 'limit', expanded }

    const node = headOf(id)
    const way = wayOf(id)
    const here = g[id]!
    const list = exits.get(node)
    if (list) {
      for (const exit of list) {
        if (exit.way !== NONE && isForbidden(rg.restrictions.byVia, node, way, exit.way)) continue
        const total = here + exit.cost
        if (total < bestGoal) {
          bestGoal = total
          goalPrev = id
          goalExit = exit
          heap.push(total, GOAL)
        }
      }
    }
    for (let i = rg.outStart[node]!; i < rg.outStart[node + 1]!; i++) {
      const arc = rg.outArcs[i]!
      if (closed[arc]) continue
      if (isForbidden(rg.restrictions.byVia, node, way, rg.edgeWay[arc >> 1]!)) continue
      const cost = here + rg.edgeCost[arc >> 1]!
      if (cost < g[arc]!) {
        g[arc] = cost
        prev[arc] = id
        heap.push(cost + heuristic(headOf(arc)), arc)
      }
    }
  }
  if (!found) return { ok: false, reason: 'no-path', expanded }

  // Walk back from the goal
  const pieces: Piece[] = []
  if (goalPrev === DIRECT) {
    pieces.push(directChosen!)
  } else if (goalPrev === EXIT_ONLY) {
    pieces.push(goalExit!.piece!)
  } else {
    const chain: number[] = []
    for (let id = goalPrev; id !== NONE; id = prev[id]!) chain.push(id)
    chain.reverse()
    for (const arc of chain) {
      pieces.push(arc >= arcCount ? departures[arc - arcCount]!.piece : edgePiece(rg, arc))
    }
    if (goalExit?.piece) pieces.push(goalExit.piece)
  }

  // Merge stretches that continue on the same way in the same direction
  const merged: Piece[] = []
  for (const piece of pieces) {
    const last = merged.at(-1)
    if (
      last &&
      last.way === piece.way &&
      last.forward === piece.forward &&
      last.to === piece.from &&
      !last.end
    ) {
      last.to = piece.to
      last.lengthM += piece.lengthM
      last.cost += piece.cost
      last.end = piece.end
    } else {
      merged.push({ ...piece })
    }
  }

  const splits: SplitPoint[] = []
  const segments: RouteSegment[] = []
  let lengthM = 0
  for (const piece of merged) {
    lengthM += piece.lengthM
    if (piece.start) splits.push(piece.start)
    if (piece.end) splits.push(piece.end)
    segments.push({
      wayId: rg.wayIds[piece.way]!,
      fromIndex: piece.from,
      toIndex: piece.to,
      forward: piece.forward,
      lengthM: piece.lengthM,
      startSplit: piece.start,
      endSplit: piece.end,
    })
  }
  return { ok: true, segments, splits, lengthM, cost: bestGoal, expanded }
}

function anchorOf(rg: RoutingGraph, endpoint: Endpoint, maxSnapM: number): Anchor | undefined {
  if ('node' in endpoint) {
    const node = rg.nodeIndex.get(endpoint.node)
    if (node === undefined) return undefined
    return { node, loc: [rg.nodeLon[node]!, rg.nodeLat[node]!] }
  }
  if ('snap' in endpoint) return { snap: endpoint.snap, loc: endpoint.snap.loc }
  const snap = snapToGraph(rg, endpoint.loc[0], endpoint.loc[1], maxSnapM)
  return snap ? { snap, loc: snap.loc } : undefined
}

/** The distances from a snap to the edge's first node (`before`) and to its last node (`after`) */
function splitLengths(rg: RoutingGraph, snap: Snap): { before: number; after: number } {
  const e = snap.edge
  const seg0 = rg.edgeSeg0[e]!
  const last = seg0 + (rg.edgeP1[e]! - rg.edgeP0[e]!) - 1
  let before = snap.t * rg.segLen[snap.seg]!
  for (let s = seg0; s < snap.seg; s++) before += rg.segLen[s]!
  let after = (1 - snap.t) * rg.segLen[snap.seg]!
  for (let s = snap.seg + 1; s <= last; s++) after += rg.segLen[s]!
  return { before, after }
}

function splitOf(rg: RoutingGraph, snap: Snap): SplitPoint | undefined {
  if (!(snap.t > 0 && snap.t < 1)) return undefined
  return { wayId: snap.wayId, segment: snap.segment, t: snap.t, loc: snap.loc }
}

/** The stretch from a start point inside an edge: forward to the edge's last node, or backward to its first */
function startPiece(rg: RoutingGraph, snap: Snap, forward: boolean): Piece {
  const e = snap.edge
  const { before, after } = splitLengths(rg, snap)
  const s = snap.segment
  const t = snap.t
  const factor = rg.edgeFactor[e]!
  const way = rg.edgeWay[e]!
  const start = splitOf(rg, snap)
  if (forward) {
    return {
      way,
      from: t > 0 ? s + 1 : s,
      to: rg.edgeP1[e]!,
      forward,
      lengthM: after,
      cost: after * factor,
      start,
    }
  }
  return {
    way,
    from: t < 1 ? s : s + 1,
    to: rg.edgeP0[e]!,
    forward,
    lengthM: before,
    cost: before * factor,
    start,
  }
}

/** The stretch from an edge end to an end point inside the edge: forward from the first node, or backward from the last */
function exitPiece(rg: RoutingGraph, snap: Snap, forward: boolean): Piece {
  const e = snap.edge
  const { before, after } = splitLengths(rg, snap)
  const s = snap.segment
  const t = snap.t
  const factor = rg.edgeFactor[e]!
  const way = rg.edgeWay[e]!
  const end = splitOf(rg, snap)
  if (forward) {
    return {
      way,
      from: rg.edgeP0[e]!,
      to: t < 1 ? s : s + 1,
      forward,
      lengthM: before,
      cost: before * factor,
      end,
    }
  }
  return {
    way,
    from: rg.edgeP1[e]!,
    to: t > 0 ? s + 1 : s,
    forward,
    lengthM: after,
    cost: after * factor,
    end,
  }
}

/** The stretch between two points on one edge, when the way's direction allows it (the cheaper one) */
function directPiece(rg: RoutingGraph, a: Snap, b: Snap): Piece | undefined {
  if (a.edge !== b.edge) return undefined
  const e = a.edge
  const xa = splitLengths(rg, a).before
  const xb = splitLengths(rg, b).before
  const factor = rg.edgeFactor[e]!
  const way = rg.edgeWay[e]!
  const start = splitOf(rg, a)
  const end = splitOf(rg, b)
  const candidates: Piece[] = []
  if (rg.edgeFwd[e] && xb >= xa) {
    candidates.push({
      way,
      from: a.t > 0 ? a.segment + 1 : a.segment,
      to: b.t < 1 ? b.segment : b.segment + 1,
      forward: true,
      lengthM: xb - xa,
      cost: (xb - xa) * factor,
      start,
      end,
    })
  }
  if (rg.edgeBwd[e] && xa >= xb) {
    candidates.push({
      way,
      from: a.t < 1 ? a.segment : a.segment + 1,
      to: b.t > 0 ? b.segment + 1 : b.segment,
      forward: false,
      lengthM: xa - xb,
      cost: (xa - xb) * factor,
      start,
      end,
    })
  }
  candidates.sort((x, y) => x.cost - y.cost)
  return candidates[0]
}

/** The piece of a real arc: the whole edge in its direction */
function edgePiece(rg: RoutingGraph, arc: number): Piece {
  const e = arc >> 1
  const forward = (arc & 1) === 0
  const p0 = rg.edgeP0[e]!
  const p1 = rg.edgeP1[e]!
  return {
    way: rg.edgeWay[e]!,
    from: forward ? p0 : p1,
    to: forward ? p1 : p0,
    forward,
    lengthM: rg.edgeLen[e]!,
    cost: rg.edgeCost[e]!,
  }
}
