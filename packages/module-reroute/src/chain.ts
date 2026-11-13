/**
 * The route as one line in travel order, with its support points, as a route planner shows a route (Tobias, 2026-11-13):
 * the way members in member order, each turned to continue the one before, their nodes as points, and the points where
 * the route turns as support points (`anchors`). A press on the line between two support points reroutes only the
 * stretch between them (`editAt`); a support point dragged reroutes the stretch between its two neighbours
 * (`editOfAnchor`). Pure: no React, no editing.
 */
import { OsmRelation, OsmWay, type Graph } from '@osm-editor-kit/maid-model'
import { distanceToLineM, type Lonlat } from './geometry.ts'

/** A node of the route line. `before` and `after`: the member index of the way that reaches it and that leaves it */
export type ChainPoint = {
  loc: Lonlat
  nodeId: EntityID
  before?: number
  after?: number
  /** The line is broken before this point: a gap in the route, or a member that is not loaded */
  gapBefore?: boolean
}

export type RouteChain = {
  points: ChainPoint[]
  /** The indexes of the support points among `points`, in order */
  anchors: number[]
}

/** A point a support point is placed at, with the member way it lies on (see `ViaPoint.member`) */
export type EditPoint = { lon: number; lat: number; member?: number }

/** What a press on the route starts: the stretch between two support points, and the point that is dragged */
export type RouteEdit = { start: EditPoint; end: EditPoint; via: EditPoint; anchor: number }

/** A turn sharper than this, in degrees, is a support point */
const TURN_DEG = 40
/** The direction at a point is read over this distance on each side, in metres: a kink of one node is not a turn */
const LOOK_M = 12
/** Support points closer than this along the route are one (the first is kept), in metres */
const SPACING_M = 35

function metres(a: Lonlat, b: Lonlat): number {
  const k = Math.cos((a[1] * Math.PI) / 180)
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320
}

function bearing(a: Lonlat, b: Lonlat): number {
  const k = Math.cos((a[1] * Math.PI) / 180)
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI
}

/** The way's node ids in the direction that continues from `previousEnd`, or undefined when it does not join it */
function oriented(way: OsmWay, previousEnd: EntityID | undefined): EntityID[] | undefined {
  if (previousEnd === undefined) return undefined
  if (way.nodes[0] === previousEnd) return [...way.nodes]
  if (way.nodes.at(-1) === previousEnd) return [...way.nodes].reverse()
  return undefined
}

/** The route's line and its support points. Members that are not ways, or not loaded, break the line. */
export function routeChain(graph: Graph, relation: OsmRelation): RouteChain {
  const points: ChainPoint[] = []
  const members = relation.members
  let lastNode: EntityID | undefined
  let gap = false
  const wayAt = (index: number): OsmWay | undefined => {
    const member = members[index]
    if (member?.type !== 'way') return undefined
    const way = graph.hasEntity(member.id)
    return way instanceof OsmWay && way.nodes.every((id) => graph.hasEntity(id)) ? way : undefined
  }
  for (let index = 0; index < members.length; index++) {
    if (members[index]!.type !== 'way') continue
    const way = wayAt(index)
    if (!way) {
      gap = true
      lastNode = undefined
      continue
    }
    let nodes = oriented(way, lastNode)
    if (!nodes) {
      // a new piece: turned towards the next way when it joins one end
      let next: OsmWay | undefined
      for (let k = index + 1; k < members.length && !next; k++)
        if (members[k]!.type === 'way') next = wayAt(k) ?? undefined
      const tail = way.nodes.at(-1)!
      const joinsAtTail = next && (next.nodes[0] === tail || next.nodes.at(-1) === tail)
      const joinsAtHead =
        next && (next.nodes[0] === way.nodes[0] || next.nodes.at(-1) === way.nodes[0])
      nodes = !joinsAtTail && joinsAtHead ? [...way.nodes].reverse() : [...way.nodes]
      if (points.length > 0) gap = true
    }
    nodes.forEach((nodeId, k) => {
      const node = graph.hasEntity(nodeId) as { loc?: Lonlat } | undefined
      const loc = node?.loc
      if (!loc) return
      if (k === 0 && !gap && points.at(-1)?.nodeId === nodeId) {
        points.at(-1)!.after = index
        return
      }
      points.push({
        loc: [loc[0], loc[1]],
        nodeId,
        ...(k > 0 && { before: index }),
        ...(k < nodes!.length - 1 && { after: index }),
        ...(k === 0 && gap && { gapBefore: true }),
      })
      if (k === 0) gap = false
    })
    lastNode = nodes.at(-1)
  }
  return { points, anchors: anchorsOf(points) }
}

/** The support points: the ends of each piece and the turns, thinned to one per SPACING_M */
function anchorsOf(points: readonly ChainPoint[]): number[] {
  const turns: number[] = []
  const pieceEnd = (k: number) => k === points.length - 1 || points[k + 1]!.gapBefore === true
  const pieceStart = (k: number) => k === 0 || points[k]!.gapBefore === true
  for (let k = 0; k < points.length; k++) {
    if (pieceStart(k) || pieceEnd(k)) {
      turns.push(k)
      continue
    }
    // the direction in and out, each over LOOK_M or to the piece's end
    let a = k - 1
    while (a > 0 && !pieceStart(a) && metres(points[a]!.loc, points[k]!.loc) < LOOK_M) a--
    let b = k + 1
    while (b < points.length - 1 && !pieceEnd(b) && metres(points[k]!.loc, points[b]!.loc) < LOOK_M)
      b++
    const turn = Math.abs(
      ((bearing(points[k]!.loc, points[b]!.loc) - bearing(points[a]!.loc, points[k]!.loc) + 540) %
        360) -
        180,
    )
    if (turn >= TURN_DEG) turns.push(k)
  }
  // thin out: walk the route, keep a turn once SPACING_M lies behind the last kept one; the ends of pieces stay
  const kept: number[] = []
  let along = 0
  let lastKeptAt = -Infinity
  for (let k = 0, t = 0; k < points.length; k++) {
    if (k > 0 && !points[k]!.gapBefore) along += metres(points[k - 1]!.loc, points[k]!.loc)
    if (turns[t] !== k) continue
    t++
    const end = pieceStart(k) || pieceEnd(k)
    if (end || along - lastKeptAt >= SPACING_M) {
      if (end && kept.length > 0 && along - lastKeptAt < SPACING_M && !pieceStart(k)) {
        // a piece's end close behind a turn: the end wins, it is where the route stops
        const last = kept.at(-1)!
        if (!pieceStart(last)) kept.pop()
      }
      kept.push(k)
      lastKeptAt = along
    }
  }
  return kept
}

/** The segment of the line nearest to a place: the index of its first point, or undefined for an empty line */
function nearestSegment(chain: RouteChain, loc: Lonlat): number | undefined {
  let best: number | undefined
  let bestDistance = Infinity
  for (let k = 0; k + 1 < chain.points.length; k++) {
    if (chain.points[k + 1]!.gapBefore) continue
    const distance = distanceToLineM(loc, [chain.points[k]!.loc, chain.points[k + 1]!.loc])
    if (distance < bestDistance) {
      bestDistance = distance
      best = k
    }
  }
  return best
}

/** A support point as the start of a stretch (on the way that leaves it) or as its end (on the way that reaches it) */
function pointOf(chain: RouteChain, index: number, as: 'start' | 'end'): EditPoint {
  const point = chain.points[index]!
  const member = as === 'start' ? (point.after ?? point.before) : (point.before ?? point.after)
  return { lon: point.loc[0], lat: point.loc[1], ...(member !== undefined && { member }) }
}

/** The stretch between the support points around a place on the line, with that place as the dragged point */
export function editAt(chain: RouteChain, lon: number, lat: number): RouteEdit | undefined {
  const k = nearestSegment(chain, [lon, lat])
  if (k === undefined) return undefined
  const before = chain.anchors.filter((a) => a <= k).at(-1)
  const after = chain.anchors.find((a) => a >= k + 1)
  if (before === undefined || after === undefined) return undefined
  const member = chain.points[k]!.after ?? chain.points[k + 1]!.before
  if (member === undefined) return undefined
  return {
    start: pointOf(chain, before, 'start'),
    end: pointOf(chain, after, 'end'),
    via: { lon, lat },
    anchor: member,
  }
}

/** The stretch between the neighbours of a support point, with that point as the dragged one. Not for a piece's end. */
export function editOfAnchor(chain: RouteChain, which: number): RouteEdit | undefined {
  const position = chain.anchors[which]
  const before = chain.anchors[which - 1]
  const after = chain.anchors[which + 1]
  if (position === undefined || before === undefined || after === undefined) return undefined
  const point = chain.points[position]!
  if (point.gapBefore || chain.points[position + 1]?.gapBefore) return undefined
  const member = point.after ?? point.before
  if (member === undefined) return undefined
  return {
    start: pointOf(chain, before, 'start'),
    end: pointOf(chain, after, 'end'),
    via: { lon: point.loc[0], lat: point.loc[1] },
    anchor: member,
  }
}
