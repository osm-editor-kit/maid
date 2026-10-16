/**
 * Merge areas: the union of two closed ways as one outline. Research and decisions:
 * docs/research/drawing-tools/3-merge-areas.md (approach B, topology on the nodes both ways have).
 *
 * The outline is walked from the pieces of both outlines that lie outside the other area. Nodes that stay
 * on the outline keep their id and place. Only the points where the two outlines cross are new nodes, and
 * nothing that exists is moved. The geometry runs in local metres, so every tolerance is a real distance.
 */

import { OsmNode, OsmRelation, OsmWay, utilSurvivorID } from '@osm-editor-kit/maid-model'
import type { Action, Graph } from '@osm-editor-kit/maid-model'
import { frameAt, toLoc, toMetres, type Frame, type Loc } from '../shared/metres.ts'
import { cross, distance, dot, item, sub, type Pt } from '../shared/vector.ts'

/** Why two areas cannot be merged */
export type MergeRefusal =
  | 'not_two_areas'
  | 'multipolygon'
  | 'conflicting_tags'
  | 'conflicting_relations'
  | 'contained'
  | 'not_touching'
  | 'shared_nodes_outside'
  | 'tagged_nodes'
  | 'not_simple'
  | 'too_many_nodes'

/** The most nodes the merged outline may have */
const MAX_NODES = 2000
/** Points closer than this are one point, and a point this close to a line lies on it (about 1 cm) */
const SAME_POINT = 0.01
/** Slack on positions along a segment, as a fraction of its length */
const EPS = 1e-9
/** A node is a corner in its way when the way turns there by at least this much (degrees) */
const CORNER_DEGREES = 10
/** A node is straight on the outline when the outline turns there by less than this (degrees) */
const STRAIGHT_DEGREES = 1

/** The nodes of one way: their ids (without the closing node) and the nodes */
interface Side {
  ids: EntityID[]
  nodes: OsmNode[]
}

/** One outline in counter-clockwise order: ids and points, and whether the way was clockwise */
interface Ring {
  ids: EntityID[]
  pos: Pt[]
  cw: boolean
}

/** A ring with its points in the planar graph, and the splits on each of its edges */
interface Work extends Ring {
  vertex: number[]
  splits: Split[][]
}

/** A point of the planar graph: where it is, and the existing node there (none for a crossing) */
interface PlacedPoint {
  pos: Pt
  id?: EntityID
  /** The turn at this node in each merged way it is an existing node of (in degrees) */
  turns: number[]
}

/** A point on an edge of a ring: its index in the planar graph, and its position along the edge (0 to 1) */
interface Split {
  point: number
  t: number
}

/** A part of an outline between two points, and where it lies against the other area */
interface Piece {
  from: number
  to: number
  ring: 0 | 1
  state: 'outside' | 'inside' | 'same' | 'opposite'
}

/** A node of the merged outline: an existing node, or the location of a new one */
type OutlineNode = { id: EntityID } | { loc: Loc }

/** What the action writes, computed from the graph it is given */
interface Outline {
  survivor: EntityID
  loser: EntityID
  ring: OutlineNode[]
  /** Existing nodes that leave the outline: the action deletes them */
  dropped: EntityID[]
  tags: Record<string, string>
}

/** Where two segments meet, and the position of that point along each segment (0 to 1) */
interface Contact {
  pos: Pt
  t: number
  u: number
}

/**
 * Plans the merge of two closed ways into one area.
 * The action plans again on the graph it gets, so a plan made earlier still gives the right outline.
 *
 * @param   graph - The current graph
 * @param   ids   - The two ways to merge
 * @return  The action and the survivor's id, or the reason the merge is refused
 */
export function mergePlan(
  graph: Graph,
  ids: readonly string[],
): { action: Action; survivor: string } | { refused: MergeRefusal } {
  const outline = planOutline(graph, ids)
  if (typeof outline === 'string') return { refused: outline }

  const action: Action = (target: Graph): Graph => {
    const current = planOutline(target, ids)
    if (typeof current === 'string') throw new Error(`Merge refused: ${current}`)
    return applyOutline(target, current)
  }

  return { action, survivor: outline.survivor }
}

/**
 * Checks the two ways and computes the outline of their union.
 * @param   graph - The current graph
 * @param   ids   - The two ways to merge
 * @return  The outline, or the reason it is refused
 */
function planOutline(graph: Graph, ids: readonly string[]): Outline | MergeRefusal {
  if (ids.length !== 2 || ids[0] === ids[1]) return 'not_two_areas'

  const found = ids.map((id) => graph.hasEntity(id))
  const relations = found.filter((entity): entity is OsmRelation => entity instanceof OsmRelation)
  if (relations.length)
    return relations.some((relation) => relation.isMultipolygon())
      ? 'multipolygon'
      : 'not_two_areas'

  const [a, b] = found
  if (!(a instanceof OsmWay) || !(b instanceof OsmWay) || !a.isClosed() || !b.isClosed())
    return 'not_two_areas'

  if (!sameTags(withoutArea(a.tags), withoutArea(b.tags))) return 'conflicting_tags'
  if (!sameMemberships(graph, a, b)) return 'conflicting_relations'

  // The survivor comes first: its points win where the two outlines share a place
  const keepFirst = (utilSurvivorID([a, b]) ?? a.id) === a.id
  const [keepWay, loseWay]: [OsmWay, OsmWay] = keepFirst ? [a, b] : [b, a]
  const keep = sideOf(graph, keepWay)
  const lose = sideOf(graph, loseWay)
  if (keep.ids.length < 3 || lose.ids.length < 3) return 'not_two_areas'

  const locs = [...keep.nodes, ...lose.nodes].map((node) => node.loc)
  if (locs.some((loc) => !loc)) return 'not_simple'
  const frame = frameAt(locs as Loc[])

  const first = orientRing(keep, frame)
  const second = orientRing(lose, frame)
  if (hasRepeatedNeighbour(first.pos) || hasRepeatedNeighbour(second.pos)) return 'not_simple'

  const points: PlacedPoint[] = []
  const place = (pos: Pt, id?: EntityID, turn?: number): number => {
    const index = points.findIndex((point) => distance(point.pos, pos) <= SAME_POINT)
    if (index >= 0) {
      const point = at(points, index)
      if (id !== undefined && point.id === id && turn !== undefined) point.turns.push(turn)
      return index
    }
    points.push({ pos, id, turns: id !== undefined && turn !== undefined ? [turn] : [] })
    return points.length - 1
  }
  const one = withVertices(first, place)
  const two = withVertices(second, place)

  // Every place where the two outlines meet becomes a point, and splits the edges it lies on
  let contact = false
  for (let i = 0; i < one.pos.length; i++) {
    for (let j = 0; j < two.pos.length; j++) {
      const p0 = at(one.pos, i)
      const p1 = at(one.pos, i + 1)
      const q0 = at(two.pos, j)
      const q1 = at(two.pos, j + 1)
      if (!boxesMeet(p0, p1, q0, q1)) continue

      for (const hit of segmentContacts(p0, p1, q0, q1)) {
        contact = true
        const point = place(hit.pos)
        at(one.splits, i).push({ point, t: hit.t })
        at(two.splits, j).push({ point, t: hit.u })
      }
    }
  }

  const pieces = [...piecesOf(one, 0, two, points), ...piecesOf(two, 1, one, points)]
  const overlap = pieces.some((piece) => piece.state === 'inside' || piece.state === 'same')
  if (!overlap && !sharesEdge(keep.ids, lose.ids)) return 'not_touching'
  if (!contact) return 'contained'

  // The outline: the outside pieces, and one copy of a piece both areas share on the same side
  const kept = pieces.filter(
    (piece) => piece.state === 'outside' || (piece.state === 'same' && piece.ring === 0),
  )
  const walked = walk(kept)
  if (!walked) return 'not_simple'

  // Straight existing nodes that nothing else uses add no shape: they go too
  const mergedIDs = new Set<EntityID>([a.id, b.id])
  const ring = dropStraightExisting(dropCollinearNew(walked, points), points, graph, mergedIDs)
  if (ring.length < 3) return 'not_simple'
  if (ring.length > MAX_NODES) return 'too_many_nodes'
  if (touchesItself(ring.map((index) => at(points, index).pos))) return 'not_simple'

  // Existing nodes that are not on the outline go; a node used elsewhere, or tagged, blocks the merge
  const outlineIDs = new Set(
    ring.map((index) => at(points, index).id).filter((id): id is EntityID => id !== undefined),
  )
  const dropped = [...new Set([...keep.ids, ...lose.ids])].filter((id) => !outlineIDs.has(id))
  const droppedNodes = dropped.map((id) => graph.entity(id) as OsmNode)
  if (
    droppedNodes.some(
      (node) =>
        graph.parentWays(node).some((way) => !mergedIDs.has(way.id)) ||
        graph.parentRelations(node).length,
    )
  ) {
    return 'shared_nodes_outside'
  }
  if (droppedNodes.some((node) => node.hasInterestingTags())) return 'tagged_nodes'

  // Tags: the same on both ways, except area=yes, which stays only when the tags do not already make an area
  const rest = withoutArea(keepWay.tags)
  const areaTagged = a.tags.area === 'yes' || b.tags.area === 'yes'
  const tags = !keepWay.tagSuggestingArea(rest) && areaTagged ? { ...rest, area: 'yes' } : rest

  const outlineRing: OutlineNode[] = ring.map((index) => {
    const point = at(points, index)
    return point.id !== undefined ? { id: point.id } : { loc: toLoc(frame, point.pos) }
  })
  if (first.cw) outlineRing.reverse()

  return { survivor: keepWay.id, loser: loseWay.id, ring: outlineRing, dropped, tags }
}

/**
 * Writes the outline: new nodes, the survivor's new node list and tags, the loser removed from its
 * relations and deleted, and the nodes that left the outline deleted.
 * @param   graph   - The graph to change
 * @param   outline - The outline from `planOutline`
 * @return  The changed graph, committed
 */
function applyOutline(graph: Graph, outline: Outline): Graph {
  const survivor = graph.entity(outline.survivor) as OsmWay
  const loser = graph.entity(outline.loser) as OsmWay
  const parents = graph.parentRelations(loser)

  const nodes: EntityID[] = outline.ring.map((entry) => {
    if ('id' in entry) return entry.id
    const node = new OsmNode(graph.context, { loc: entry.loc })
    graph.replace(node)
    return node.id
  })
  nodes.push(...nodes.slice(0, 1))

  // Both ways have the same parent relations, so the survivor is a member already
  for (const parent of parents) graph.replace(parent.removeMembersWithID(loser.id))
  graph.replace(survivor.update({ nodes, tags: outline.tags }))
  graph.remove(loser)
  for (const id of outline.dropped) graph.remove(graph.entity(id))

  return graph.commit()
}

/**
 * The item at index `i`, wrapped around the list. The list is never empty here: rings have at least three
 * corners and point indices come from the planar graph.
 * @param   list - The list
 * @param   i    - The index, may run past the end
 * @return  The item
 */
function at<T>(list: readonly T[], i: number): T {
  return item(list, i % list.length)
}

/**
 * Compares the tags of two ways, leaving out area=yes (it is handled separately).
 * @param   a - Tags of the first way
 * @param   b - Tags of the second way
 * @return  `true` if the tags are the same
 */
function sameTags(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key])
}

/**
 * Returns the tags without area=yes, which the merge may add or drop.
 * @param   tags - The tags of a way
 * @return  The same tags, or a copy without `area=yes`
 */
function withoutArea(tags: Record<string, string>): Record<string, string> {
  if (tags.area !== 'yes') return tags
  const rest = { ...tags }
  delete rest.area
  return rest
}

/**
 * Whether two ways have the same parent relations, with the same roles in each.
 * @param   graph - The current graph
 * @param   a     - The first way
 * @param   b     - The second way
 * @return  `true` if the memberships match
 */
function sameMemberships(graph: Graph, a: OsmWay, b: OsmWay): boolean {
  const roles = (way: OsmWay): Map<EntityID, string> => {
    const map = new Map<EntityID, string>()
    for (const relation of graph.parentRelations(way)) {
      const own = relation.members
        .filter((member) => member.id === way.id)
        .map((member) => member.role)
      map.set(relation.id, own.sort().join(';'))
    }
    return map
  }
  const mapA = roles(a)
  const mapB = roles(b)
  return mapA.size === mapB.size && [...mapA].every(([id, value]) => mapB.get(id) === value)
}

/**
 * The nodes of a closed way, without the repeated closing node.
 * @param   graph - The current graph
 * @param   way   - A closed way
 * @return  Its ids and nodes
 */
function sideOf(graph: Graph, way: OsmWay): Side {
  const ids = way.nodes.slice(0, -1)
  return { ids, nodes: ids.map((id) => graph.entity(id) as OsmNode) }
}

/**
 * The points of a way in local metres, counter-clockwise. A clockwise way is reversed and flagged, so the
 * outline can be written in the direction the survivor had.
 * @param   side  - The nodes of the way
 * @param   frame - The frame
 * @return  The ring
 */
function orientRing(side: Side, frame: Frame): Ring {
  const pos = side.nodes.map((node) => toMetres(frame, node.loc as Loc))
  const cw = signedArea(pos) < 0
  return cw
    ? { ids: [...side.ids].reverse(), pos: [...pos].reverse(), cw }
    : { ids: side.ids, pos, cw }
}

/**
 * Gives every corner of a ring its point in the planar graph.
 * @param   ring  - The ring
 * @param   place - Finds or adds a point, returns its index
 * @return  The ring with its vertices and empty splits
 */
function withVertices(ring: Ring, place: (pos: Pt, id?: EntityID, turn?: number) => number): Work {
  const n = ring.pos.length
  return {
    ...ring,
    vertex: ring.pos.map((pos, i) =>
      place(pos, ring.ids[i], turnDegrees(at(ring.pos, i + n - 1), pos, at(ring.pos, i + 1))),
    ),
    splits: ring.pos.map((): Split[] => []),
  }
}

/**
 * The area of a ring with its sign: positive when the ring runs counter-clockwise.
 * @param   pts - The corners of a ring
 * @return  The signed area in square metres
 */
function signedArea(pts: Pt[]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = at(pts, i)
    const b = at(pts, i + 1)
    sum += cross(a, b)
  }
  return sum / 2
}

/**
 * Whether two neighbouring corners of a ring are at the same place.
 * @param   pts - The corners of a ring
 * @return  `true` if a corner repeats its neighbour
 */
function hasRepeatedNeighbour(pts: Pt[]): boolean {
  return pts.some((pt, i) => distance(pt, at(pts, i + 1)) <= SAME_POINT)
}

/**
 * Whether two rings have an edge in common, in either direction.
 * @param   a - Node ids of the first ring
 * @param   b - Node ids of the second ring
 * @return  `true` if an edge of `a` is also an edge of `b`
 */
function sharesEdge(a: EntityID[], b: EntityID[]): boolean {
  const edges = new Set<string>()
  for (let i = 0; i < b.length; i++) edges.add(edgeKey(at(b, i), at(b, i + 1)))
  return a.some((id, i) => edges.has(edgeKey(id, at(a, i + 1))))
}

/**
 * The key of an edge, the same in both directions.
 * @param   x - One node id
 * @param   y - The other node id
 * @return  A string key
 */
function edgeKey(x: EntityID, y: EntityID): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

/**
 * The distance from a point to a segment.
 * @param   p - The point
 * @param   a - The start of the segment
 * @param   b - The end of the segment
 * @return  The distance in metres
 */
function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2))
  return distance(p, { x: a.x + t * ab.x, y: a.y + t * ab.y })
}

/**
 * Whether a point lies strictly between the ends of a segment and within a centimetre of its line.
 * @param   a - The start of the segment
 * @param   p - The point
 * @param   b - The end of the segment
 * @return  `true` if `p` lies on the segment between `a` and `b`
 */
function isBetween(a: Pt, p: Pt, b: Pt): boolean {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  if (len2 === 0) return false
  const along = dot(sub(p, a), ab) / len2
  if (along <= 0 || along >= 1) return false
  return Math.abs(cross(ab, sub(p, a))) / Math.sqrt(len2) <= SAME_POINT
}

/**
 * Whether the boxes around two segments overlap, with the point tolerance as slack.
 * @param   p0 - Start of the first segment
 * @param   p1 - End of the first segment
 * @param   q0 - Start of the second segment
 * @param   q1 - End of the second segment
 * @return  `false` only when the boxes are apart
 */
function boxesMeet(p0: Pt, p1: Pt, q0: Pt, q1: Pt): boolean {
  return (
    Math.max(p0.x, p1.x) + SAME_POINT >= Math.min(q0.x, q1.x) &&
    Math.max(q0.x, q1.x) + SAME_POINT >= Math.min(p0.x, p1.x) &&
    Math.max(p0.y, p1.y) + SAME_POINT >= Math.min(q0.y, q1.y) &&
    Math.max(q0.y, q1.y) + SAME_POINT >= Math.min(p0.y, p1.y)
  )
}

/**
 * Where two segments meet: one crossing or touching point, or the ends of a shared stretch of collinear segments.
 * @param   p0 - Start of the first segment
 * @param   p1 - End of the first segment
 * @param   q0 - Start of the second segment
 * @param   q1 - End of the second segment
 * @return  The contacts, possibly none
 */
function segmentContacts(p0: Pt, p1: Pt, q0: Pt, q1: Pt): Contact[] {
  const r = sub(p1, p0)
  const s = sub(q1, q0)
  const qp = sub(q0, p0)
  const lenR = Math.hypot(r.x, r.y)
  const lenS = Math.hypot(s.x, s.y)
  const denom = cross(r, s)
  const inRange = (x: number): boolean => x >= -EPS && x <= 1 + EPS
  const clamp = (x: number): number => Math.min(1, Math.max(0, x))

  if (Math.abs(denom) > 1e-12 * lenR * lenS) {
    const t = cross(qp, s) / denom
    const u = cross(qp, r) / denom
    if (!inRange(t) || !inRange(u)) return []
    return [{ pos: { x: p0.x + t * r.x, y: p0.y + t * r.y }, t: clamp(t), u: clamp(u) }]
  }

  // Parallel: they meet only when they lie on one line, and then at the ends of the shorter stretch
  if (Math.abs(cross(qp, r)) > SAME_POINT * lenR) return []
  const contacts: Contact[] = []
  const rr = dot(r, r)
  const ss = dot(s, s)
  for (const [end, u] of [
    [q0, 0],
    [q1, 1],
  ] as const) {
    const t = dot(sub(end, p0), r) / rr
    if (inRange(t)) contacts.push({ pos: end, t: clamp(t), u })
  }
  for (const [end, t] of [
    [p0, 0],
    [p1, 1],
  ] as const) {
    const u = dot(sub(end, q0), s) / ss
    if (inRange(u)) contacts.push({ pos: end, t, u: clamp(u) })
  }
  return contacts
}

/**
 * Whether a point lies inside a ring (ray casting).
 * @param   p    - The point
 * @param   ring - The corners of the ring
 * @return  `true` if the point is inside
 */
function insideRing(p: Pt, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = at(ring, i)
    const b = at(ring, j)
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

/**
 * Whether a ring crosses or touches itself on a non-adjacent edge.
 * @param   pts - The corners of the ring, in order
 * @return  `true` if the ring is not simple
 */
function touchesItself(pts: Pt[]): boolean {
  const n = pts.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentContacts(at(pts, i), at(pts, i + 1), at(pts, j), at(pts, j + 1)).length)
        return true
    }
  }
  return false
}

/**
 * Splits each edge of a ring at its splits and classifies every part against the other ring.
 * @param   ring   - The ring
 * @param   side   - Which ring it is (0 is the survivor)
 * @param   other  - The other ring
 * @param   points - The points of the planar graph
 * @return  The parts of the ring
 */
function piecesOf(ring: Work, side: 0 | 1, other: Work, points: PlacedPoint[]): Piece[] {
  const pieces: Piece[] = []
  const n = ring.vertex.length
  for (let i = 0; i < n; i++) {
    const splits = [...at(ring.splits, i)].sort((x, y) => x.t - y.t)
    const chain = [
      at(ring.vertex, i),
      ...splits.map((split) => split.point),
      at(ring.vertex, i + 1),
    ]
    for (let k = 0; k + 1 < chain.length; k++) {
      const from = at(chain, k)
      const to = at(chain, k + 1)
      if (from === to) continue
      const state = classify(at(points, from).pos, at(points, to).pos, other.pos)
      pieces.push({ from, to, ring: side, state })
    }
  }
  return pieces
}

/**
 * Says where a part of one outline lies against the other outline: outside, inside, or on it.
 * On it, the part runs the same way as the other outline's edge (both areas on one side) or the opposite way.
 * @param   a     - Start of the part
 * @param   b     - End of the part
 * @param   other - The corners of the other ring
 * @return  The state of the part
 */
function classify(a: Pt, b: Pt, other: Pt[]): Piece['state'] {
  const mid: Pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  for (let j = 0; j < other.length; j++) {
    const p = at(other, j)
    const q = at(other, j + 1)
    if (distanceToSegment(mid, p, q) <= SAME_POINT) {
      return dot(sub(b, a), sub(q, p)) > 0 ? 'same' : 'opposite'
    }
  }
  return insideRing(mid, other) ? 'inside' : 'outside'
}

/**
 * Walks the outline from the kept parts. Returns the points in order, or `undefined` when the parts do not
 * form one ring (a pinch, a hole or a second part).
 * @param   pieces - The kept parts
 * @return  The point indices of the ring, or `undefined`
 */
function walk(pieces: Piece[]): number[] | undefined {
  if (pieces.length === 0) return undefined
  const outgoing = new Map<number, Piece[]>()
  for (const piece of pieces) {
    const list = outgoing.get(piece.from)
    if (list) list.push(piece)
    else outgoing.set(piece.from, [piece])
  }

  const start = at(pieces, 0).from
  const ring = [start]
  let current = start
  let steps = 0
  do {
    const outs = outgoing.get(current)
    const only = outs && outs.length === 1 ? outs[0] : undefined
    if (!only || ++steps > pieces.length) return undefined
    current = only.to
    if (current !== start) ring.push(current)
  } while (current !== start)

  return steps === pieces.length ? ring : undefined
}

/**
 * Removes existing nodes that were corners in their own way (turn of at least 10 degrees there) and lie straight
 * on the outline now (turn under 1 degree), and that nothing else uses: no tags, no way but the two merged ways,
 * no relation. Nodes that were already straight in their way (arcs, mid-edge nodes) always stay. Works one node
 * at a time, so each node is judged against its current neighbours.
 * @param   ring      - The point indices of the ring
 * @param   points    - The points of the planar graph
 * @param   graph     - The current graph
 * @param   mergedIDs - The ids of the two ways being merged
 * @return  The ring without those nodes
 */
function dropStraightExisting(
  ring: number[],
  points: PlacedPoint[],
  graph: Graph,
  mergedIDs: Set<EntityID>,
): number[] {
  let out = ring
  let removed = true
  while (removed && out.length > 3) {
    removed = false
    for (let i = 0; i < out.length && !removed; i++) {
      const point = at(points, at(out, i))
      if (
        point.id === undefined ||
        point.turns.length === 0 ||
        !point.turns.every((turn) => turn >= CORNER_DEGREES)
      )
        continue
      const node = graph.entity(point.id) as OsmNode
      if (Object.keys(node.tags).length > 0) continue
      if (
        graph.parentRelations(node).length ||
        graph.parentWays(node).some((way) => !mergedIDs.has(way.id))
      )
        continue
      const before = at(points, at(out, i + out.length - 1)).pos
      const after = at(points, at(out, i + 1)).pos
      if (turnDegrees(before, point.pos, after) < STRAIGHT_DEGREES) {
        out = out.filter((_, j) => j !== i)
        removed = true
      }
    }
  }
  return out
}

/**
 * The angle by which an outline turns at a corner, in degrees: 0 when it runs straight on.
 * @param   a - The corner before
 * @param   p - The corner
 * @param   b - The corner after
 * @return  The turn in degrees, from 0 to 180
 */
function turnDegrees(a: Pt, p: Pt, b: Pt): number {
  const v1 = sub(p, a)
  const v2 = sub(b, p)
  return (Math.abs(Math.atan2(cross(v1, v2), dot(v1, v2))) * 180) / Math.PI
}

/**
 * Removes the new points that lie straight between their neighbours. Existing nodes stay.
 * @param   ring   - The point indices of the ring
 * @param   points - The points of the planar graph
 * @return  The ring without those points
 */
function dropCollinearNew(ring: number[], points: PlacedPoint[]): number[] {
  let out = ring
  let removed = true
  while (removed) {
    removed = false
    for (let i = 0; i < out.length && !removed; i++) {
      const index = at(out, i)
      if (at(points, index).id !== undefined) continue
      const before = at(points, at(out, i + out.length - 1)).pos
      const after = at(points, at(out, i + 1)).pos
      if (isBetween(before, at(points, index).pos, after)) {
        out = out.filter((_, j) => j !== i)
        removed = true
      }
    }
  }
  return out
}
