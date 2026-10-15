// A routing graph built from the loaded data, for one profile.
//
// Junction nodes are the nodes where a route can turn: the ends of a way, and nodes that two or more
// routable ways share. Every other node of a way is an interior point of an edge. An edge runs
// between two junction nodes along one way and keeps that way's position range, so the route can be
// written back as way ranges. With `everyNode` every node of a routable way is a junction; that
// variant is for the measurement in tools/bench/routing-bench.ts.
//
// A node missing from the loaded data breaks its way: the parts on each side are routed separately,
// so the router never crosses an unloaded stretch (core rule 1: the router sees only what is loaded).
//
// Arcs: each edge has a forward arc (id 2e, from the edge's first node to its last) and a backward arc
// (id 2e+1), each present only when the way allows that direction. The router's states are arcs.
import {
  OsmNode,
  OsmRelation,
  OsmWay,
  type Graph as ModelGraph,
  type OsmEntity,
} from '@osm-editor-kit/maid-model'
import { haversine, METRES_PER_DEG } from './geo.ts'
import type { Profile, WayRule } from './profile.ts'
import { buildRestrictions, type RestrictionTable } from './restrictions.ts'

export interface BuildOptions {
  /** Only ways with a node inside this box `[minLon, minLat, maxLon, maxLat]`. Default: all loaded ways */
  bbox?: [number, number, number, number]
  /** Every node of a routable way is a junction (see the top of this file) */
  everyNode?: boolean
}

/** A point where a route starts or ends inside a way: the route needs a new node there */
export interface SplitPoint {
  wayId: EntityID
  /** The way node before the point: the point lies between `way.nodes[segment]` and `[segment + 1]` */
  segment: number
  /** Fraction along that segment, strictly between 0 and 1 */
  t: number
  loc: [number, number]
}

/** A point on a routable way, the nearest one to a click or a coordinate */
export interface Snap {
  /** Edge index in the graph */
  edge: number
  /** Global segment index (one segment is one pair of neighbouring way nodes) */
  seg: number
  wayIdx: number
  wayId: EntityID
  /** The way node before the point (`way.nodes[segment]`) */
  segment: number
  /** Fraction along the segment, 0 to 1 */
  t: number
  loc: [number, number]
  distanceM: number
}

/** The routing graph of one profile. Typed arrays, built once, read by the router */
export interface RoutingGraph {
  profile: Profile
  /** Junction node index to OSM node id */
  nodeIds: EntityID[]
  nodeIndex: Map<EntityID, number>
  nodeLon: Float64Array
  nodeLat: Float64Array
  /** Routable way index to OSM way id, and its rule */
  wayIds: EntityID[]
  wayIndex: Map<EntityID, number>
  wayRules: WayRule[]
  // edges
  edgeFrom: Int32Array
  edgeTo: Int32Array
  edgeWay: Int32Array
  /** Positions of the edge's first and last node in `way.nodes` (first < last) */
  edgeP0: Int32Array
  edgeP1: Int32Array
  edgeLen: Float64Array
  edgeFactor: Float64Array
  edgeCost: Float64Array
  edgeFwd: Uint8Array
  edgeBwd: Uint8Array
  /** First segment of the edge; its segments are consecutive */
  edgeSeg0: Int32Array
  // segments (one per pair of neighbouring way nodes)
  segEdge: Int32Array
  segPos: Int32Array
  segLen: Float64Array
  segLon0: Float64Array
  segLat0: Float64Array
  segLon1: Float64Array
  segLat1: Float64Array
  // arcs, by node: arcs leaving node n are outArcs[outStart[n] .. outStart[n + 1])
  outStart: Int32Array
  outArcs: Int32Array
  restrictions: RestrictionTable
  grid: SegmentGrid
  stats: GraphStats
}

export interface GraphStats {
  profile: string
  everyNode: boolean
  buildMs: number
  ways: number
  nodes: number
  edges: number
  segments: number
  arcs: number
  restrictions: { applied: number; skipped: RestrictionTable['skipped'] }
}

/** The grid of segments that snapping searches. Cells are CELL_DEG degrees square */
export interface SegmentGrid {
  minLon: number
  minLat: number
  cols: number
  rows: number
  cellStart: Int32Array
  cellSegs: Int32Array
}

const CELL_DEG = 0.001

/** A snap this close (metres along its segment) to a way node is that node: see snapToGraph */
const NODE_SNAP_M = 1

/** Every entity of the graph as the app sees it: edited entities win, deleted ones are left out */
export function loadedEntities(graph: ModelGraph): OsmEntity[] {
  const out: OsmEntity[] = []
  for (const [id, entity] of graph.base.entities) {
    if (entity && !graph.local.entities.has(id)) out.push(entity)
  }
  for (const entity of graph.local.entities.values()) {
    if (entity) out.push(entity)
  }
  return out
}

interface RoutableWay {
  id: EntityID
  nodes: EntityID[]
  rule: WayRule
  /** Pairs of positions [first, last] of each run of loaded nodes */
  runs: number[]
}

export function buildRoutingGraph(
  graph: ModelGraph,
  profile: Profile,
  options: BuildOptions = {},
): RoutingGraph {
  const started = performance.now()
  const everyNode = options.everyNode ?? false
  const bbox = options.bbox

  const locCache = new Map<EntityID, [number, number] | null>()
  const locOf = (id: EntityID): [number, number] | null => {
    let loc = locCache.get(id)
    if (loc === undefined) {
      const entity = graph.hasEntity(id)
      const at = entity instanceof OsmNode ? entity.loc : undefined
      loc = at ? [at[0], at[1]] : null
      locCache.set(id, loc)
    }
    return loc
  }
  const inBox = (loc: [number, number]) =>
    bbox === undefined ||
    (loc[0] >= bbox[0] && loc[1] >= bbox[1] && loc[0] <= bbox[2] && loc[1] <= bbox[3])

  // 1. Routable ways and their runs of loaded nodes
  const ways: RoutableWay[] = []
  const relations: OsmRelation[] = []
  for (const entity of loadedEntities(graph)) {
    if (entity instanceof OsmRelation) {
      relations.push(entity)
      continue
    }
    if (!(entity instanceof OsmWay)) continue
    const rule = profile.wayRule(entity.tags)
    if (!rule) continue

    const nodes = entity.nodes
    const runs: number[] = []
    let inside = false
    let start = -1
    for (let k = 0; k < nodes.length; k++) {
      const loc = locOf(nodes[k]!)
      if (loc) {
        if (start < 0) start = k
        if (inBox(loc)) inside = true
      }
      if (!loc || k === nodes.length - 1) {
        if (start >= 0) {
          const end = loc ? k : k - 1
          if (end > start) runs.push(start, end)
          start = -1
        }
      }
    }
    if (runs.length === 0 || (bbox !== undefined && !inside)) continue
    ways.push({ id: entity.id, nodes, rule, runs })
  }

  // 2. How many routable ways use each node (a node used twice in one way counts twice)
  const uses = new Map<EntityID, number>()
  for (const way of ways) {
    for (let r = 0; r < way.runs.length; r += 2) {
      for (let k = way.runs[r]!; k <= way.runs[r + 1]!; k++) {
        const id = way.nodes[k]!
        uses.set(id, (uses.get(id) ?? 0) + 1)
      }
    }
  }

  // 3. Edges and segments
  const nodeIds: EntityID[] = []
  const nodeIndex = new Map<EntityID, number>()
  const nodeLonList: number[] = []
  const nodeLatList: number[] = []
  const nodeOf = (id: EntityID): number => {
    let index = nodeIndex.get(id)
    if (index === undefined) {
      index = nodeIds.length
      nodeIndex.set(id, index)
      nodeIds.push(id)
      const loc = locOf(id)!
      nodeLonList.push(loc[0])
      nodeLatList.push(loc[1])
    }
    return index
  }

  const wayIds: EntityID[] = []
  const wayIndex = new Map<EntityID, number>()
  const wayRules: WayRule[] = []

  const edgeFrom: number[] = []
  const edgeTo: number[] = []
  const edgeWay: number[] = []
  const edgeP0: number[] = []
  const edgeP1: number[] = []
  const edgeLen: number[] = []
  const edgeFactor: number[] = []
  const edgeCost: number[] = []
  const edgeFwd: number[] = []
  const edgeBwd: number[] = []
  const edgeSeg0: number[] = []

  const segEdge: number[] = []
  const segPos: number[] = []
  const segLen: number[] = []
  const segLon0: number[] = []
  const segLat0: number[] = []
  const segLon1: number[] = []
  const segLat1: number[] = []

  const emitEdge = (wayIdx: number, p0: number, p1: number) => {
    const way = ways[wayIdx]!
    const rule = way.rule
    const edge = edgeFrom.length
    const seg0 = segEdge.length
    let length = 0
    for (let k = p0; k < p1; k++) {
      const a = locOf(way.nodes[k]!)!
      const b = locOf(way.nodes[k + 1]!)!
      const d = haversine(a[0], a[1], b[0], b[1])
      segEdge.push(edge)
      segPos.push(k)
      segLen.push(d)
      segLon0.push(a[0])
      segLat0.push(a[1])
      segLon1.push(b[0])
      segLat1.push(b[1])
      length += d
    }
    edgeFrom.push(nodeOf(way.nodes[p0]!))
    edgeTo.push(nodeOf(way.nodes[p1]!))
    edgeWay.push(wayIdx)
    edgeP0.push(p0)
    edgeP1.push(p1)
    edgeLen.push(length)
    edgeFactor.push(rule.factor)
    edgeCost.push(length * rule.factor)
    edgeFwd.push(rule.forward ? 1 : 0)
    edgeBwd.push(rule.backward ? 1 : 0)
    edgeSeg0.push(seg0)
  }

  for (const way of ways) {
    const wayIdx = wayIds.length
    wayIds.push(way.id)
    wayIndex.set(way.id, wayIdx)
    wayRules.push(way.rule)
    for (let r = 0; r < way.runs.length; r += 2) {
      const first = way.runs[r]!
      const last = way.runs[r + 1]!
      let previous = -1
      for (let k = first; k <= last; k++) {
        const junction =
          everyNode || k === first || k === last || (uses.get(way.nodes[k]!) ?? 0) >= 2
        if (!junction) continue
        if (previous >= 0) emitEdge(wayIdx, previous, k)
        previous = k
      }
    }
  }

  // 4. Arcs, by node (a forward arc leaves the edge's first node, a backward arc its last)
  const nodeCount = nodeIds.length
  const edgeCount = edgeFrom.length
  const outStart = new Int32Array(nodeCount + 1)
  for (let e = 0; e < edgeCount; e++) {
    if (edgeFwd[e]) outStart[edgeFrom[e]! + 1] = outStart[edgeFrom[e]! + 1]! + 1
    if (edgeBwd[e]) outStart[edgeTo[e]! + 1] = outStart[edgeTo[e]! + 1]! + 1
  }
  for (let n = 1; n <= nodeCount; n++) outStart[n] = outStart[n]! + outStart[n - 1]!
  const fill = outStart.slice(0, nodeCount)
  const outArcs = new Int32Array(outStart[nodeCount]!)
  for (let e = 0; e < edgeCount; e++) {
    if (edgeFwd[e]) {
      const node = edgeFrom[e]!
      outArcs[fill[node]!] = 2 * e
      fill[node] = fill[node]! + 1
    }
    if (edgeBwd[e]) {
      const node = edgeTo[e]!
      outArcs[fill[node]!] = 2 * e + 1
      fill[node] = fill[node]! + 1
    }
  }

  const restrictions = buildRestrictions(
    relations,
    {
      node: (id) => nodeIndex.get(id),
      way: (id) => wayIndex.get(id),
    },
    profile,
  )

  const routing: RoutingGraph = {
    profile,
    nodeIds,
    nodeIndex,
    nodeLon: Float64Array.from(nodeLonList),
    nodeLat: Float64Array.from(nodeLatList),
    wayIds,
    wayIndex,
    wayRules,
    edgeFrom: Int32Array.from(edgeFrom),
    edgeTo: Int32Array.from(edgeTo),
    edgeWay: Int32Array.from(edgeWay),
    edgeP0: Int32Array.from(edgeP0),
    edgeP1: Int32Array.from(edgeP1),
    edgeLen: Float64Array.from(edgeLen),
    edgeFactor: Float64Array.from(edgeFactor),
    edgeCost: Float64Array.from(edgeCost),
    edgeFwd: Uint8Array.from(edgeFwd),
    edgeBwd: Uint8Array.from(edgeBwd),
    edgeSeg0: Int32Array.from(edgeSeg0),
    segEdge: Int32Array.from(segEdge),
    segPos: Int32Array.from(segPos),
    segLen: Float64Array.from(segLen),
    segLon0: Float64Array.from(segLon0),
    segLat0: Float64Array.from(segLat0),
    segLon1: Float64Array.from(segLon1),
    segLat1: Float64Array.from(segLat1),
    outStart,
    outArcs,
    restrictions,
    grid: buildGrid(segLon0, segLat0, segLon1, segLat1),
    stats: {
      profile: profile.name,
      everyNode,
      buildMs: 0,
      ways: wayIds.length,
      nodes: nodeCount,
      edges: edgeCount,
      segments: segEdge.length,
      arcs: outArcs.length,
      restrictions: { applied: restrictions.applied, skipped: restrictions.skipped },
    },
  }
  routing.stats.buildMs = performance.now() - started
  return routing
}

function buildGrid(lon0: number[], lat0: number[], lon1: number[], lat1: number[]): SegmentGrid {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (let s = 0; s < lon0.length; s++) {
    minLon = Math.min(minLon, lon0[s]!, lon1[s]!)
    maxLon = Math.max(maxLon, lon0[s]!, lon1[s]!)
    minLat = Math.min(minLat, lat0[s]!, lat1[s]!)
    maxLat = Math.max(maxLat, lat0[s]!, lat1[s]!)
  }
  if (lon0.length === 0)
    return {
      minLon: 0,
      minLat: 0,
      cols: 0,
      rows: 0,
      cellStart: new Int32Array(1),
      cellSegs: new Int32Array(0),
    }
  const cols = Math.floor((maxLon - minLon) / CELL_DEG) + 1
  const rows = Math.floor((maxLat - minLat) / CELL_DEG) + 1
  const cellStart = new Int32Array(cols * rows + 1)
  const cellRange = (s: number) => {
    const x0 = Math.floor((Math.min(lon0[s]!, lon1[s]!) - minLon) / CELL_DEG)
    const x1 = Math.floor((Math.max(lon0[s]!, lon1[s]!) - minLon) / CELL_DEG)
    const y0 = Math.floor((Math.min(lat0[s]!, lat1[s]!) - minLat) / CELL_DEG)
    const y1 = Math.floor((Math.max(lat0[s]!, lat1[s]!) - minLat) / CELL_DEG)
    return [x0, x1, y0, y1] as const
  }
  for (let s = 0; s < lon0.length; s++) {
    const [x0, x1, y0, y1] = cellRange(s)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) cellStart[y * cols + x + 1] = cellStart[y * cols + x + 1]! + 1
    }
  }
  for (let c = 1; c <= cols * rows; c++) cellStart[c] = cellStart[c]! + cellStart[c - 1]!
  const fill = cellStart.slice(0, cols * rows)
  const cellSegs = new Int32Array(cellStart[cols * rows]!)
  for (let s = 0; s < lon0.length; s++) {
    const [x0, x1, y0, y1] = cellRange(s)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = y * cols + x
        cellSegs[fill[c]!] = s
        fill[c] = fill[c]! + 1
      }
    }
  }
  return { minLon, minLat, cols, rows, cellStart, cellSegs }
}

/**
 * The nearest routable point to a coordinate, within `maxDistanceM` (default 200 m). Undefined when
 * no routable way is that close. Searches the grid in rings of cells, and stops once the next ring
 * cannot hold anything nearer.
 */
export function snapToGraph(
  rg: RoutingGraph,
  lon: number,
  lat: number,
  maxDistanceM = 200,
): Snap | undefined {
  const grid = rg.grid
  if (grid.cols === 0) return undefined
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const cellMinM = CELL_DEG * METRES_PER_DEG * Math.min(1, cosLat)
  const cx = Math.floor((lon - grid.minLon) / CELL_DEG)
  const cy = Math.floor((lat - grid.minLat) / CELL_DEG)
  const maxRing = Math.ceil(maxDistanceM / cellMinM) + 1

  const kx = METRES_PER_DEG * cosLat
  const ky = METRES_PER_DEG
  let best = -1
  let bestDist = Infinity
  let bestT = 0
  const consider = (seg: number) => {
    const ax = (rg.segLon0[seg]! - lon) * kx
    const ay = (rg.segLat0[seg]! - lat) * ky
    const dx = (rg.segLon1[seg]! - rg.segLon0[seg]!) * kx
    const dy = (rg.segLat1[seg]! - rg.segLat0[seg]!) * ky
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    if (d < bestDist) {
      bestDist = d
      best = seg
      bestT = t
    }
  }
  const scanCell = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return
    const c = y * grid.cols + x
    for (let i = grid.cellStart[c]!; i < grid.cellStart[c + 1]!; i++) consider(grid.cellSegs[i]!)
  }
  for (let r = 0; r <= maxRing; r++) {
    if (r === 0) scanCell(cx, cy)
    else {
      for (let x = cx - r; x <= cx + r; x++) {
        scanCell(x, cy - r)
        scanCell(x, cy + r)
      }
      for (let y = cy - r + 1; y <= cy + r - 1; y++) {
        scanCell(cx - r, y)
        scanCell(cx + r, y)
      }
    }
    if (best >= 0 && bestDist <= r * cellMinM) break
  }
  if (best < 0 || bestDist > maxDistanceM) return undefined

  // A point within NODE_SNAP_M of a way node is that node: a split a metre from it would be a sliver
  const segLen = rg.segLen[best]!
  let t = bestT
  if (t * segLen < NODE_SNAP_M) t = 0
  else if ((1 - t) * segLen < NODE_SNAP_M) t = 1

  const edge = rg.segEdge[best]!
  const wayIdx = rg.edgeWay[edge]!
  const lon0 = rg.segLon0[best]!
  const lat0 = rg.segLat0[best]!
  return {
    edge,
    seg: best,
    wayIdx,
    wayId: rg.wayIds[wayIdx]!,
    segment: rg.segPos[best]!,
    t,
    loc: [lon0 + t * (rg.segLon1[best]! - lon0), lat0 + t * (rg.segLat1[best]! - lat0)],
    distanceM: bestDist,
  }
}
