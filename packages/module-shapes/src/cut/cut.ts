import { Graph, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action } from '@osm-editor-kit/maid-model'

/** A position as [lon, lat] */
export type Loc = [number, number]

/** Why a cut is refused. The data is not changed when one of these is returned. */
export type CutRefusal =
  | 'not_area'
  | 'crossings'
  | 'tangent'
  | 'along_edge'
  | 'shared_edge'
  | 'relation_member'
  | 'roundabout'
  | 'multi_way_outline'
  | 'several_outlines'
  | 'through_hole'
  | 'self_intersecting'
  | 'degenerate'

/** WGS84 equatorial radius in metres, for the local projection */
const EARTH_RADIUS = 6378137

/** Tolerance for positions along the drawn line and for near-zero lengths, in metres */
const EPS = 1e-6

/** A point in local metres: x east, y north */
interface Pt {
  x: number
  y: number
}

/**
 * A node of a ring or of the chord. An existing node has an `id`; a new node has only its position
 * and gets its id when the plan is made.
 */
interface Slot {
  id?: string
  loc: Loc
  p: Pt
}

/** A place where the drawn line meets the outline, after snapping to a vertex when one is near */
interface Anchor {
  /** Distance along the drawn line, in metres */
  s: number
  /** Position in local metres */
  p: Pt
  /** Index of the outline vertex it snaps to, if any */
  vertex?: number
  /** Edge of the outline it lies on, and its fraction along that edge (used when no vertex is near) */
  edge: number
  u: number
}

/** The result of the analysis, shared by the plan and the preview. No entity is created here. */
interface Analysis {
  /** Relation that holds the outline as an outer member, if the way is one */
  relation?: OsmRelation
  /** First ring: the arc from the first crossing to the second, then the chord back */
  ringA: Slot[]
  /** Second ring: the other arc, then the chord */
  ringB: Slot[]
  /** The chord from the first crossing to the second, both ends included */
  chord: Slot[]
  /** The new nodes: the crossings that are not vertices, and the chord's intermediate points */
  created: Slot[]
}

/** Local equirectangular frame around a set of positions, so that one unit is one metre */
interface Frame {
  lon: number
  lat: number
  kx: number
  ky: number
}

/**
 * Plans the cut of a closed way along a drawn line. The line must cross the outline exactly twice;
 * the part between the crossings is the chord. The way becomes two closed ways, both with its tags,
 * or, when it is the outer member of a multipolygon, two outer members of that relation.
 * Returns the action (pure: it copies the graph it is given) and the ids of the two pieces in the
 * graph the action returns. Returns a reason when the cut is not clearly safe.
 * @param   graph      - The graph that holds the way
 * @param   wayId      - The closed way to cut
 * @param   line       - The drawn line as [lon, lat] points
 * @param   snapMetres - Distance in metres at which a crossing reuses a vertex of the outline
 * @return  The action and the piece ids, or the refusal
 */
export function cutPlan(
  graph: Graph,
  wayId: string,
  line: Loc[],
  snapMetres = 0.3,
): { action: Action; pieces: (after: Graph) => string[] } | { refused: CutRefusal } {
  const found = analyse(graph, wayId, line, snapMetres)
  if ('refused' in found) return found

  const context = graph.context
  const nodeIds = new Map<Slot, string>()
  const newNodes: { id: string; loc: Loc }[] = []
  for (const slot of found.created) {
    const id = 'n-' + context.next('node')
    nodeIds.set(slot, id)
    newNodes.push({ id, loc: slot.loc })
  }
  const idOf = (slot: Slot): string => slot.id ?? nodeIds.get(slot)!
  const idsA = found.ringA.map(idOf)
  const idsB = found.ringB.map(idOf)

  // The longer ring keeps the id of the way (and its history); the other one is new
  const keepA = perimeter(found.ringA) >= perimeter(found.ringB)
  const newWayId = 'w-' + context.next('way')
  const keptIds = keepA ? idsA : idsB
  const addedIds = keepA ? idsB : idsA
  const pieces = (after: Graph): string[] =>
    [keepA ? wayId : newWayId, keepA ? newWayId : wayId].filter(
      (id) => after.hasEntity(id) !== undefined,
    )

  const relationId = found.relation?.id

  const action: Action = (input: Graph): Graph => {
    const g = new Graph(input)
    g.replace(newNodes.map((n) => new OsmNode(g.context, { id: n.id, loc: n.loc })))

    const way = g.entity(wayId) as OsmWay
    const kept = way.update({ nodes: closed(keptIds) })
    const added = new OsmWay(g.context, {
      id: newWayId,
      nodes: closed(addedIds),
      tags: { ...way.tags },
    })
    g.replace([kept, added])

    if (relationId) {
      const rel = g.entity(relationId) as OsmRelation
      const member = rel.memberById(wayId)
      if (member)
        g.replace(rel.addMember({ id: newWayId, type: 'way', role: 'outer' }, member.index + 1))
    }
    return g.commit()
  }

  return { action, pieces }
}

/**
 * The item at an index the code has already checked is in range; throws if it is not.
 * @param   list - The array
 * @param   i    - The index
 * @return  The item
 */
function item<T>(list: readonly T[], i: number): T {
  const value = list[i]
  if (value === undefined) throw new Error(`index ${i} is out of range`)
  return value
}

/**
 * A ring as a way: the first node repeated at the end.
 * @param   ids - Node ids of the ring, without the closing repeat
 * @return  The node ids of a closed way
 */
function closed(ids: string[]): string[] {
  return [...ids, item(ids, 0)]
}

/**
 * The chord that a cut along this line would make, for the preview while the line is drawn.
 * Cheap enough for each pointer move: it creates no entities.
 * @param   graph      - The graph that holds the way
 * @param   wayId      - The closed way to cut
 * @param   line       - The drawn line as [lon, lat] points
 * @param   snapMetres - Distance in metres at which a crossing reuses a vertex of the outline
 * @return  The chord from the first crossing to the second, or the refusal
 */
export function cutPreview(
  graph: Graph,
  wayId: string,
  line: Loc[],
  snapMetres = 0.3,
): { chord: Loc[] } | { refused: CutRefusal } {
  const found = analyse(graph, wayId, line, snapMetres)
  if ('refused' in found) return found
  return { chord: found.chord.map((slot) => slot.loc) }
}

/** The outline of a way that can be cut, before any line: its nodes, their positions and their metres */
interface Outline {
  /** The multipolygon the way is the outer member of, if it is one */
  multi?: OsmRelation
  /** Node ids of the way, without the closing repeat */
  ids: string[]
  locs: Loc[]
  frame: Frame
  /** The positions in local metres */
  outline: Pt[]
}

/**
 * Whether a way can be cut at all, before any line is drawn: the menu asks this to offer or refuse "Cut".
 * The checks are the ones the plan makes first, so a way refused here is refused by the plan too.
 * @param   graph      - The graph that holds the way
 * @param   wayId      - The way to cut (for a multipolygon, its outer way)
 * @param   snapMetres - Snapping distance in metres
 * @return  The refusal, or `undefined` when a line could be drawn across the way
 */
export function cutCheck(
  graph: Graph,
  wayId: string,
  snapMetres = 0.3,
): { refused: CutRefusal } | undefined {
  const found = outlineOf(graph, wayId, snapMetres)
  return 'refused' in found ? found : undefined
}

/**
 * The checks that do not depend on the drawn line: the way is an area, is not a route member or a roundabout, and its
 * outline is simple. Creates no entities and does not change the graph.
 * @param   graph - The graph that holds the way
 * @param   wayId - The closed way to cut
 * @param   snap  - Snapping distance in metres
 * @return  The outline, or the refusal
 */
function outlineOf(graph: Graph, wayId: string, snap: number): Outline | { refused: CutRefusal } {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return refuse('not_area')

  // Relations first: an outline of several ways is refused even when the way itself is open
  const parents = graph.parentRelations(way)
  const multi =
    parents.length === 1 && item(parents, 0).isMultipolygon() ? item(parents, 0) : undefined
  const role = multi?.memberById(wayId)?.role
  if (multi && role === 'outer') {
    const outers = multi.membersByRole('outer')
    if (outers.length > 1) {
      const allClosed = outers.every(
        (m) => m.type === 'way' && closedWay(graph, m.id) !== undefined,
      )
      return refuse(allClosed ? 'several_outlines' : 'multi_way_outline')
    }
  }

  if (!way.isClosed()) return refuse('not_area')
  if (way.tags.junction === 'roundabout' || way.tags.junction === 'circular')
    return refuse('roundabout')
  if (parents.length > 1 || (parents.length === 1 && !multi)) return refuse('relation_member')
  if (multi) {
    if (role === 'inner') return refuse('not_area')
    if (role !== 'outer') return refuse('relation_member')
  } else if (!way.isArea()) {
    return refuse('not_area')
  }

  // The outline
  const ids = way.nodes.slice(0, -1)
  if (new Set(ids).size !== ids.length) return refuse('self_intersecting')
  if (ids.length < 3) return refuse('degenerate')
  const locs = locsOf(graph, ids)
  if (!locs) return refuse('degenerate')
  const frame = frameAt(locs)
  const outline = locs.map((loc) => project(frame, loc))
  const n = outline.length
  for (let i = 0; i < n; i++) {
    if (dist(item(outline, i), item(outline, (i + 1) % n)) <= EPS) return refuse('degenerate')
  }
  if (outlineCrosses(outline)) return refuse('self_intersecting')
  if (Math.abs(signedArea(outline)) <= snap * snap) return refuse('degenerate')
  return { multi, ids, locs, frame, outline }
}

/**
 * The whole geometric and relation check. Returns the two rings and the chord, or the first reason
 * the cut is refused. Creates no entities and does not change the graph.
 * @param   graph - The graph that holds the way
 * @param   wayId - The closed way to cut
 * @param   line  - The drawn line as [lon, lat] points
 * @param   snap  - Snapping distance in metres
 * @return  The analysis, or the refusal
 */
function analyse(
  graph: Graph,
  wayId: string,
  line: Loc[],
  snap: number,
): Analysis | { refused: CutRefusal } {
  const found = outlineOf(graph, wayId, snap)
  if ('refused' in found) return found
  const { multi, ids, locs, frame, outline } = found
  const n = outline.length

  // The drawn line, without repeated points
  const pts: Pt[] = []
  const lonLat: Loc[] = []
  for (const loc of line) {
    const p = project(frame, loc)
    if (pts.length === 0 || dist(item(pts, pts.length - 1), p) > EPS) {
      pts.push(p)
      lonLat.push(loc)
    }
  }
  if (pts.length < 2) return refuse('crossings')
  const cum = [0]
  for (let j = 0; j + 1 < pts.length; j++)
    cum.push(item(cum, j) + dist(item(pts, j), item(pts, j + 1)))
  const total = item(cum, cum.length - 1)

  // Where the line meets the outline
  const hits: { s: number; p: Pt; edge: number; u: number }[] = []
  for (let j = 0; j + 1 < pts.length; j++) {
    for (let i = 0; i < n; i++) {
      const a = item(pts, j)
      const b = item(pts, j + 1)
      const c = item(outline, i)
      const d = item(outline, (i + 1) % n)
      if (alongEdge(a, b, c, d, snap)) return refuse('along_edge')
      const m = meet(a, b, c, d)
      if (m) {
        hits.push({
          s: item(cum, j) + m.t * (item(cum, j + 1) - item(cum, j)),
          p: { x: a.x + (b.x - a.x) * m.t, y: a.y + (b.y - a.y) * m.t },
          edge: i,
          u: m.u,
        })
      }
    }
  }
  hits.sort((x, y) => x.s - y.s)

  // Hits within snapMetres of each other are one place: a corner gives two hits
  const groups: { s: number; p: Pt; hits: typeof hits }[] = []
  for (const hit of hits) {
    const last = groups[groups.length - 1]
    if (last && dist(last.p, hit.p) <= snap) last.hits.push(hit)
    else groups.push({ s: hit.s, p: hit.p, hits: [hit] })
  }
  const anchors: Anchor[] = groups.map((group) => {
    let vertex: number | undefined
    let best = Infinity
    for (const hit of group.hits) {
      for (let i = 0; i < n; i++) {
        const d = dist(hit.p, item(outline, i))
        if (d <= snap && d < best) {
          best = d
          vertex = i
        }
      }
    }
    const first = item(group.hits, 0)
    return {
      s: group.s,
      p: vertex === undefined ? first.p : item(outline, vertex),
      vertex,
      edge: first.edge,
      u: first.u,
    }
  })

  // Is the piece before, between and after the anchors inside the outline?
  const K = anchors.length
  const inside: boolean[] = []
  for (let k = 0; k <= K; k++) {
    const from = k === 0 ? 0 : item(anchors, k - 1).s
    const to = k === K ? total : item(anchors, k).s
    inside.push(to - from > EPS && inPolygon(pointAt(pts, cum, (from + to) / 2), outline))
  }
  // The end of the line on the outline counts as a crossing only when the line goes in or out there
  const isEnd = (k: number): boolean => {
    const startsOnOutline = k === 0 && item(anchors, 0).s <= EPS
    const endsOnOutline = k === K - 1 && item(anchors, K - 1).s >= total - EPS
    return startsOnOutline || endsOnOutline
  }

  const crossings: number[] = []
  for (let k = 0; k < K; k++) {
    if (item(inside, k) !== item(inside, k + 1)) crossings.push(k)
    else if (!isEnd(k)) return refuse('tangent')
  }
  if (crossings.length !== 2) return refuse('crossings')
  const first = item(anchors, item(crossings, 0))
  const second = item(anchors, item(crossings, 1))
  // The chord between the crossings must lie inside the outline
  if (!item(inside, item(crossings, 0) + 1)) return refuse('crossings')

  // The chord: both crossings, and the drawn points between them
  const mids: number[] = []
  for (let j = 1; j + 1 < pts.length; j++) {
    if (item(cum, j) > first.s + EPS && item(cum, j) < second.s - EPS) mids.push(j)
  }
  const chordPts = [first.p, ...mids.map((j) => item(pts, j)), second.p]
  if (selfCrosses(chordPts)) return refuse('self_intersecting')

  // Crossings on an edge of another way cannot be split: the other way would need the new node too
  for (const anchor of [first, second]) {
    if (anchor.vertex === undefined) {
      const a = item(ids, anchor.edge)
      const b = item(ids, (anchor.edge + 1) % n)
      if (sharesEdge(graph, wayId, a, b)) return refuse('shared_edge')
    }
  }

  // The outline with the crossings in place, in order around the way
  const vertexSlots: Slot[] = ids.map((id, i) => ({ id, loc: item(locs, i), p: item(outline, i) }))
  const edgeSlots: { slot: Slot; edge: number; u: number }[] = []
  const slotOf = (anchor: Anchor): Slot => {
    if (anchor.vertex !== undefined) return item(vertexSlots, anchor.vertex)
    const slot: Slot = { loc: unproject(frame, anchor.p), p: anchor.p }
    edgeSlots.push({ slot, edge: anchor.edge, u: anchor.u })
    return slot
  }
  const slotA = slotOf(first)
  const slotB = slotOf(second)
  const seq: Slot[] = []
  for (let i = 0; i < n; i++) {
    seq.push(item(vertexSlots, i))
    const onEdge = edgeSlots.filter((e) => e.edge === i).sort((x, y) => x.u - y.u)
    for (const e of onEdge) seq.push(e.slot)
  }
  const iA = seq.indexOf(slotA)
  const iB = seq.indexOf(slotB)
  if (iA < 0 || iB < 0 || iA === iB) return refuse('degenerate')

  const mid: Slot[] = mids.map((j) => ({ loc: item(lonLat, j), p: item(pts, j) }))
  const ringA = [...arc(seq, iA, iB), ...mid.slice().reverse()]
  const ringB = [...arc(seq, iB, iA), ...mid]
  for (const ring of [ringA, ringB]) {
    if (new Set(ring).size < 3) return refuse('degenerate')
    if (Math.abs(signedArea(ring.map((slot) => slot.p))) <= snap * snap) return refuse('degenerate')
  }

  // Holes: each one must lie fully inside one of the two pieces
  if (multi) {
    for (const member of multi.membersByRole('inner')) {
      const hole = member.type === 'way' ? closedWay(graph, member.id) : undefined
      const holeLocs = hole ? locsOf(graph, hole.nodes.slice(0, -1)) : undefined
      if (!holeLocs) return refuse('relation_member')
      const holePts = holeLocs.map((loc) => project(frame, loc))
      for (let k = 0; k + 1 < chordPts.length; k++) {
        for (let i = 0; i < holePts.length; i++) {
          const hole0 = item(holePts, i)
          const hole1 = item(holePts, (i + 1) % holePts.length)
          if (segmentGap(item(chordPts, k), item(chordPts, k + 1), hole0, hole1) <= EPS) {
            return refuse('through_hole')
          }
        }
      }
      const probe = item(holePts, 0)
      const insideHalf =
        inPolygon(
          probe,
          ringA.map((slot) => slot.p),
        ) ||
        inPolygon(
          probe,
          ringB.map((slot) => slot.p),
        )
      if (!insideHalf) return refuse('through_hole')
    }
  }

  return {
    relation: multi,
    ringA,
    ringB,
    chord: [slotA, ...mid, slotB],
    created: [...edgeSlots.map((e) => e.slot), ...mid],
  }
}

/**
 * A refusal with its reason.
 * @param   reason - Why the cut is refused
 * @return  The refusal
 */
function refuse(reason: CutRefusal): { refused: CutRefusal } {
  return { refused: reason }
}

/**
 * The way with this id if it is a closed way in the graph.
 * @param   graph - The graph to look in
 * @param   id    - Entity id
 * @return  The way, or `undefined` if it is missing, open or not a way
 */
function closedWay(graph: Graph, id: string): OsmWay | undefined {
  const entity = graph.hasEntity(id)
  return entity instanceof OsmWay && entity.isClosed() ? entity : undefined
}

/**
 * The positions of nodes, or `undefined` if one is missing or has no position.
 * @param   graph - The graph to look in
 * @param   ids   - Node ids
 * @return  The positions in order, or `undefined`
 */
function locsOf(graph: Graph, ids: string[]): Loc[] | undefined {
  const locs: Loc[] = []
  for (const id of ids) {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    locs.push([node.loc[0], node.loc[1]])
  }
  return locs
}

/**
 * Whether another way has the two nodes next to each other, so that the edge between them is shared.
 * @param   graph  - The graph to look in
 * @param   wayId  - The way being cut, which does not count
 * @param   a      - One node of the edge
 * @param   b      - The other node of the edge
 * @return  `true` if another way uses this edge
 */
function sharesEdge(graph: Graph, wayId: string, a: string, b: string): boolean {
  const node = graph.hasEntity(a)
  if (!node) return false
  return graph.parentWays(node).some((way) => way.id !== wayId && adjacentIn(way.nodes, a, b))
}

/**
 * Whether two nodes follow each other in a list, in either direction.
 * @param   nodes - Node ids of a way
 * @param   a     - One node id
 * @param   b     - The other node id
 * @return  `true` if they are next to each other
 */
function adjacentIn(nodes: string[], a: string, b: string): boolean {
  for (let k = 0; k + 1 < nodes.length; k++) {
    if (
      (item(nodes, k) === a && item(nodes, k + 1) === b) ||
      (item(nodes, k) === b && item(nodes, k + 1) === a)
    )
      return true
  }
  return false
}

/**
 * The arc of a ring from one index forward to another, both included.
 * @param   seq  - The outline nodes in order
 * @param   from - Start index
 * @param   to   - End index
 * @return  The nodes from `from` to `to`
 */
function arc(seq: Slot[], from: number, to: number): Slot[] {
  const out: Slot[] = []
  for (let k = from; ; k = (k + 1) % seq.length) {
    out.push(item(seq, k))
    if (k === to) break
  }
  return out
}

/**
 * The frame around a set of positions: its origin and the metres per degree.
 * @param   locs - Positions in [lon, lat]
 * @return  The frame
 */
function frameAt(locs: Loc[]): Frame {
  const lon = locs.reduce((sum, loc) => sum + item(loc, 0), 0) / locs.length
  const lat = locs.reduce((sum, loc) => sum + item(loc, 1), 0) / locs.length
  const degree = (Math.PI * EARTH_RADIUS) / 180
  return { lon, lat, kx: degree * Math.cos((lat * Math.PI) / 180), ky: degree }
}

/**
 * A position in local metres.
 * @param   frame - The frame
 * @param   loc   - Position in [lon, lat]
 * @return  The position in metres
 */
function project(frame: Frame, loc: Loc): Pt {
  return { x: (item(loc, 0) - frame.lon) * frame.kx, y: (item(loc, 1) - frame.lat) * frame.ky }
}

/**
 * A position in [lon, lat] from local metres.
 * @param   frame - The frame
 * @param   p     - Position in metres
 * @return  The position in [lon, lat]
 */
function unproject(frame: Frame, p: Pt): Loc {
  return [frame.lon + p.x / frame.kx, frame.lat + p.y / frame.ky]
}

/**
 * Vector difference a - b.
 * @param   a - First point
 * @param   b - Second point
 * @return  The difference
 */
function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y }
}

/**
 * Two-dimensional cross product.
 * @param   a - First vector
 * @param   b - Second vector
 * @return  The z component of a x b
 */
function cross(a: Pt, b: Pt): number {
  return a.x * b.y - a.y * b.x
}

/**
 * Dot product.
 * @param   a - First vector
 * @param   b - Second vector
 * @return  The dot product
 */
function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y
}

/**
 * Distance between two points.
 * @param   a - First point
 * @param   b - Second point
 * @return  The distance in metres
 */
function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Distance from a point to a segment.
 * @param   p - The point
 * @param   a - One end of the segment
 * @param   b - The other end
 * @return  The distance in metres
 */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2))
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t })
}

/**
 * Distance from a point to the infinite line through two points.
 * @param   p - The point
 * @param   a - A point on the line
 * @param   b - Another point on the line (not the same as a)
 * @return  The distance in metres
 */
function distToLine(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  return Math.abs(cross(ab, sub(p, a))) / Math.hypot(ab.x, ab.y)
}

/**
 * Where segment ab crosses segment cd. Parallel segments give no crossing.
 * @param   a - Start of the first segment
 * @param   b - End of the first segment
 * @param   c - Start of the second segment
 * @param   d - End of the second segment
 * @return  The fractions along each segment, or `undefined` when they do not meet
 */
function meet(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number } | undefined {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) <= 1e-12 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return undefined
  const qp = sub(c, a)
  const t = cross(qp, s) / denom
  const u = cross(qp, r) / denom
  const tol = 1e-9
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return undefined
  return { t: Math.min(1, Math.max(0, t)), u: Math.min(1, Math.max(0, u)) }
}

/**
 * The smallest distance between two segments; 0 when they cross or touch.
 * @param   a - Start of the first segment
 * @param   b - End of the first segment
 * @param   c - Start of the second segment
 * @param   d - End of the second segment
 * @return  The distance in metres
 */
function segmentGap(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (meet(a, b, c, d)) return 0
  return Math.min(
    distToSegment(a, c, d),
    distToSegment(b, c, d),
    distToSegment(c, a, b),
    distToSegment(d, a, b),
  )
}

/**
 * Whether segment ab runs along segment cd: both ends of cd are within snap of the line ab, both ends
 * of ab are within snap of the line cd, and they overlap by more than snap.
 * @param   a    - Start of the drawn segment
 * @param   b    - End of the drawn segment
 * @param   c    - Start of the outline edge
 * @param   d    - End of the outline edge
 * @param   snap - Distance in metres
 * @return  `true` if the drawn segment runs along the edge
 */
function alongEdge(a: Pt, b: Pt, c: Pt, d: Pt, snap: number): boolean {
  const l = dist(a, b)
  if (l === 0) return false
  if (distToLine(c, a, b) > snap || distToLine(d, a, b) > snap) return false
  if (distToLine(a, c, d) > snap || distToLine(b, c, d) > snap) return false
  const dir = sub(b, a)
  const along = (p: Pt): number => dot(sub(p, a), dir) / l
  const lo = Math.min(along(c), along(d))
  const hi = Math.max(along(c), along(d))
  const overlap = Math.min(l, hi) - Math.max(0, lo)
  return overlap > snap
}

/**
 * The point at a distance along a polyline.
 * @param   pts - The points
 * @param   cum - The distance from the start to each point
 * @param   s   - Distance along the line, in metres
 * @return  The point
 */
function pointAt(pts: Pt[], cum: number[], s: number): Pt {
  for (let j = 0; j + 1 < pts.length; j++) {
    if (s <= item(cum, j + 1) || j + 2 === pts.length) {
      const l = item(cum, j + 1) - item(cum, j)
      const t = l === 0 ? 0 : (s - item(cum, j)) / l
      const a = item(pts, j)
      const b = item(pts, j + 1)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  return item(pts, pts.length - 1)
}

/**
 * Whether a point lies inside a closed ring (ray casting).
 * @param   p    - The point
 * @param   ring - The ring's points, without a repeated closing point
 * @return  `true` if the point is inside
 */
function inPolygon(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = item(ring, i)
    const b = item(ring, j)
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

/**
 * Signed area of a ring (shoelace formula).
 * @param   ring - The ring's points, without a repeated closing point
 * @return  The area in square metres, positive for counter-clockwise rings
 */
function signedArea(ring: Pt[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    sum += cross(item(ring, i), item(ring, (i + 1) % ring.length))
  }
  return sum / 2
}

/**
 * Length of a closed ring.
 * @param   ring - The nodes of the ring, without a repeated closing node
 * @return  The perimeter in metres
 */
function perimeter(ring: Slot[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    sum += dist(item(ring, i).p, item(ring, (i + 1) % ring.length).p)
  }
  return sum
}

/**
 * Whether the outline crosses or touches itself, or folds back on an edge next to it.
 * @param   p - The outline's points, without a repeated closing point
 * @return  `true` if it is not a simple ring
 */
function outlineCrosses(p: Pt[]): boolean {
  const n = p.length
  for (let i = 0; i < n; i++) {
    const a = item(p, i)
    const b = item(p, (i + 1) % n)
    for (let j = i + 1; j < n; j++) {
      const c = item(p, j)
      const d = item(p, (j + 1) % n)
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) {
        // Two neighbouring edges that point back along one line
        const e1 = sub(b, a)
        const e2 = sub(d, c)
        const turn =
          Math.abs(cross(e1, e2)) <= 1e-9 * Math.hypot(e1.x, e1.y) * Math.hypot(e2.x, e2.y)
        if (turn && dot(e1, e2) < 0) return true
      } else if (segmentGap(a, b, c, d) <= EPS) {
        return true
      }
    }
  }
  return false
}

/**
 * Whether a polyline crosses itself (non-neighbouring segments touch or cross).
 * @param   pts - The polyline's points
 * @return  `true` if it crosses itself
 */
function selfCrosses(pts: Pt[]): boolean {
  const segments = pts.length - 1
  for (let i = 0; i < segments; i++) {
    for (let j = i + 2; j < segments; j++) {
      if (segmentGap(item(pts, i), item(pts, i + 1), item(pts, j), item(pts, j + 1)) <= EPS)
        return true
    }
  }
  return false
}
