/**
 * The street drawing: every road of an area with its lanes at their widths, the roads joined at junctions.
 *
 * The approach is Lane Studio's (https://github.com/MarcelMarzec/LaneStudio, `modules/lanes/geometry/road_geometry.ts`,
 * ISC licence), cut down to the core and written for plain data:
 *
 * - **Arms.** At a node where roads meet, each way end gives one arm, a way running through gives two, sorted by angle.
 * - **Two arms (a road running on).** They are partners: each end is cut on the bisector of the bend, so the lane
 *   boundaries of both meet exactly. Where their lanes differ, the road with fewer lanes runs on out of the other's
 *   over 25 m ("run"): its lane edges start where the other road's are and ease to its own, and a lane it does not
 *   have narrows to nothing on it (a taper).
 * - **Three or more arms (a junction).** The main road (the straightest pair, by way, ref, name and class) runs
 *   through untrimmed, its two arms partners as above. Every other arm is pulled back to where its kerbs meet its
 *   neighbours' (at most 30 m), and the junction's surface joins the ends of all arms, with a kerb curve round each
 *   corner. The main road's kerb stops where a side road joins it, its lane lines stop over the junction.
 * - **Junctions of several nodes.** Junction nodes joined by a piece shorter than 25 m (a road crossing both
 *   carriageways of a dual carriageway, a staggered junction) are one junction (Lane Studio's `junctionClusters`): the
 *   short pieces between them are not drawn as roads, and one surface covers them all. Where Lane Studio fills the
 *   nodes' boxes and the short pieces as one shape, the outline here is walked round the outside of the group, from
 *   each road leaving it to the next and along the kerbs of the short pieces, so it is one ring. A short piece that is
 *   the main road at both its ends keeps its lanes, without lines.
 * - **Forks, slip roads and merges.** Where a road divides at a shallow angle and no traffic crosses (a slip road
 *   leaving, two one-way roads joining, a road parting into its two carriageways), the node is no junction (Lane
 *   Studio's `splitAt`, `alignFork`, `alignBranches` and `alignMerges`, here as one rule): the road before the fork (the
 *   stem) ends square at the node, its lanes are shared out among the roads beyond (Lane Studio's `shareOut`), and
 *   each of those starts on its share, cut along the stem's end, and runs in straight lines to its own lanes. The wedge
 *   between two of them, up to where they have drawn apart, is the fork's surface. A slip road with no lane of its own
 *   on the stem peels off the outer lane.
 * - **Pieces.** Each way is cut at its junction nodes; each piece is offset per lane with mitre joins (`vec.ts`).
 *
 * Left out for now (Lane Studio has them): forks of more than three roads, roundabout flares, turning heads, guide
 * lines through junctions, connectivity relations, carriageway areas, painted islands, hard shoulders beside slip
 * roads, and telling a merge from a road that gives way at its end (the drawing gets no node tags).
 *
 * Pure: plain data in, plain data out, no caches.
 */
import type {
  LonLat,
  StreetArrow,
  StreetGeometry,
  StreetInput,
  StreetJunction,
  StreetLane,
  StreetLanePolygon,
  StreetLine,
  StreetLineKind,
  StreetWay,
} from './types'
import {
  add,
  angleBetween,
  cornerCurve,
  cutSharpBends,
  cross,
  cumulative,
  dot,
  len,
  metricFrame,
  offsetPolyline,
  pointAlong,
  unfolded,
  convexHull,
  crossesItself,
  polylineLength,
  rightNormal,
  scale,
  signedArea2,
  slicePolyline,
  smooth,
  sub,
  unit,
  type MetricFrame,
  type Vec2,
} from './vec'

/**
 * Two roads whose directions away from the node are closer than this (degrees) meet at a sharp corner: a bend of more
 * than 100°, where a mitre would reach past twice the road's half width
 */
const SHARP_CORNER = 80
/** A bend inside a way sharper than this (degrees of turn) has its corner cut, so its offsets need no long mitre */
const SHARP_BEND = 100

/** A side road is pulled back at most this far from the node */
const MAX_CLEARANCE = 30
/** Length over which a road runs on out of the other's lanes */
const RUN_LENGTH = 25
/** A run takes at most this share of its piece */
const RUN_SHARE = 0.45
/** Edges closer than this count as the same */
const SAME_EDGE = 0.05
/** Junction nodes joined by a piece shorter than this are one junction (Lane Studio's `clusterLink`) */
const CLUSTER_LINK = 25
/** At a fork, each road beyond lies within this angle of straight on from the stem, in degrees */
const FORK_ANGLE = 35
/** A fork's roads run from the stem's lanes to their own over at least this length */
const FORK_RUN = 15
/** ...and at most this share of the shortest of them, where a junction follows and where none does */
const FORK_SHARE = 0.6
const FORK_SHARE_FREE = 0.9
/** A road shorter than this up to its next junction does not fork: it is part of that junction */
const FORK_MIN_PIECE = 20
/** How far along a fork's roads the point where they are clear of each other is looked for */
const FORK_CLEAR = 60
/** Turn arrows sit this far before the end of the lane */
const ARROW_FROM_END = 12

const HIGHWAY_RANK: Record<string, number> = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  unclassified: 4,
  residential: 3,
  motorway_link: 6,
  trunk_link: 5,
  primary_link: 5,
  secondary_link: 4,
  tertiary_link: 3,
  living_street: 2,
  service: 1,
  road: 1,
  busway: 2,
}

/** A way in metres: its points and which node each point is */
type WayLine = {
  way: StreetWay
  points: Vec2[]
  nodeIds: string[]
  at: number[]
  total: number
  /** The lanes sorted left to right */
  lanes: StreetLane[]
  left: number
  right: number
}

type Arm = {
  line: WayLine
  /** Index of the node's point in the way's points */
  index: number
  alongWay: boolean
  /** The arm's line from the node outwards */
  points: Vec2[]
  /** Unit direction from the node outwards, over the first 5 m */
  direction: Vec2
  /** Unit direction of the first segment */
  first: Vec2
  angle: number
  /** Edges in the arm's own frame (looking away from the node), right positive */
  left: number
  right: number
}

/** A lane of the road this one runs on into, narrowing to nothing on this road */
type RunTaper = { lane: StreetLane; target: [number, number]; collapse: number }

/** Where a road runs on out of another's lanes at one end: the target edges of its own lanes, and the tapers */
type Run = {
  /** Per own lane (by index in WayLine.lanes): the edges at the node, in way orientation */
  targets: ([number, number] | undefined)[]
  tapers: RunTaper[]
  /**
   * At a fork: the run's length, and where the targets are measured: along `axis` from the node (the stem's square
   * end, towards the way's right), not across this road. An edge is moved as a whole from where the road's own square
   * end has it (along `normal`, the way's right at the node) onto its target, less and less along the run: in a
   * straight line, not eased, so the edges of two roads leaving one point do not cross on their way apart.
   */
  fork?: { length: number; axis: Vec2; normal: Vec2 }
}

/** Lane lines and kerbs stop this far from the node (main road through a junction) */
type Marks = { left: number; right: number; lanes: number }

const armKey = (wayId: string, index: number, alongWay: boolean) => `${wayId}:${index}:${alongWay}`

function toWayLine(
  way: StreetWay,
  input: StreetInput,
  frame: MetricFrame,
  same: ReadonlyMap<string, string> = new Map(),
): WayLine | undefined {
  if (way.lanes.length === 0) return undefined
  const points: Vec2[] = []
  const nodeIds: string[] = []
  for (const node of way.nodes) {
    // a node in the same place as the one before it on some way stands for it, so a way ending there still meets it
    const id = same.get(node) ?? node
    const loc = input.loc(id)
    if (!loc) continue
    const p = frame.toMetres(loc)
    const previous = points[points.length - 1]
    // a repeated point (two nodes in one place) would give a segment without direction
    if (previous && len(sub(p, previous)) < 0.01) {
      continue
    }
    points.push(p)
    nodeIds.push(id)
  }
  if (points.length < 2) return undefined
  const lanes = [...way.lanes].sort((a, b) => a.left - b.left)
  const at = cumulative(points)
  return {
    way,
    points,
    nodeIds,
    at,
    total: at[at.length - 1]!,
    lanes,
    left: Math.min(...lanes.map((lane) => lane.left)),
    right: Math.max(...lanes.map((lane) => lane.right)),
  }
}

function armsAt(nodeId: string, lines: readonly WayLine[]): Arm[] {
  const arms: Arm[] = []
  for (const line of lines) {
    line.nodeIds.forEach((id, i) => {
      if (id !== nodeId) return
      const push = (alongWay: boolean) => {
        const points = alongWay ? line.points.slice(i) : line.points.slice(0, i + 1).reverse()
        const length = polylineLength(points)
        if (points.length < 2 || length === 0) return
        const direction = unit(sub(pointAlong(points, Math.min(5, length)).point, points[0]!))
        const first = unit(sub(points[1]!, points[0]!))
        arms.push({
          line,
          index: i,
          alongWay,
          points,
          direction,
          first,
          angle: Math.atan2(direction[1], direction[0]),
          left: alongWay ? line.left : -line.right,
          right: alongWay ? line.right : -line.left,
        })
      }
      if (i < line.nodeIds.length - 1) push(true)
      if (i > 0) push(false)
    })
  }
  return arms.sort((a, b) => a.angle - b.angle)
}

/** The two arms that carry the main road straight through a junction, or null (Lane Studio's `throughPair`, shortened) */
function throughPair(arms: readonly Arm[]): [number, number] | null {
  if (oneWayPair(arms)) return null
  const rank = (arm: Arm) => HIGHWAY_RANK[arm.line.way.tags.highway ?? ''] ?? 0
  let best: { pair: [number, number]; score: number } | null = null
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      const a = arms[i]!
      const b = arms[j]!
      const deviation = 180 - angleBetween(a.direction, b.direction)
      if (deviation > 35) continue
      const ta = a.line.way.tags
      const tb = b.line.way.tags
      // a third road leaving close to one of the pair as a peer (a fork): nothing runs straight through
      const peer = (c: Arm) =>
        (c.line.way.tags.name !== undefined &&
          (c.line.way.tags.name === ta.name || c.line.way.tags.name === tb.name)) ||
        rank(c) >= Math.min(rank(a), rank(b))
      if (
        arms.some(
          (c, k) =>
            k !== i &&
            k !== j &&
            peer(c) &&
            (angleBetween(c.direction, a.direction) < 40 ||
              angleBetween(c.direction, b.direction) < 40),
        )
      )
        continue
      const score =
        (a.line.way.id === b.line.way.id ? 30 : 0) +
        (ta.ref && ta.ref === tb.ref ? 20 : 0) +
        (ta.name && ta.name === tb.name ? 10 : 0) +
        (ta.highway === tb.highway ? 5 : 0) +
        rank(a) +
        rank(b) -
        deviation / 6
      if (!best || score > best.score) best = { pair: [i, j], score }
    }
  }
  return best?.pair ?? null
}

/** Lanes of an arm that travel towards the node (`approach`) or away from it */
function travels(arm: Arm, approach: boolean): boolean {
  const away = arm.alongWay ? 'forward' : 'backward'
  const towards = arm.alongWay ? 'backward' : 'forward'
  const wanted = approach ? towards : away
  return arm.line.lanes.some((lane) => lane.direction === wanted || lane.direction === 'both_ways')
}

/**
 * A two-way road splitting into a pair of one-way roads (a dual carriageway, a road round an island): the two one-way
 * arms, or null (Lane Studio's `oneWayPair`). Nothing runs straight through there.
 */
function oneWayPair(arms: readonly Arm[]): [number, number] | null {
  const inOnly = (arm: Arm) => travels(arm, true) && !travels(arm, false)
  const outOnly = (arm: Arm) => travels(arm, false) && !travels(arm, true)
  for (let i = 0; i < arms.length; i++) {
    for (let j = 0; j < arms.length; j++) {
      if (i === j || !inOnly(arms[i]!) || !outOnly(arms[j]!)) continue
      if (angleBetween(arms[i]!.direction, arms[j]!.direction) > 80) continue
      const middle = unit(add(arms[i]!.direction, arms[j]!.direction))
      const stem = arms.some(
        (arm, k) =>
          k !== i &&
          k !== j &&
          travels(arm, true) &&
          travels(arm, false) &&
          angleBetween(scale(arm.direction, -1), middle) < 60,
      )
      if (stem) return [i, j]
    }
  }
  return null
}

/** How far along arm `a` its edge at offset `offA` meets the edge of arm `b` at offset `offB` (Lane Studio's `edgeMeeting`) */
function edgeMeeting(a: Arm, offA: number, b: Arm, offB: number): number | undefined {
  const pa = scale(rightNormal(a.direction), offA)
  const pb = scale(rightNormal(b.direction), offB)
  const c = cross(a.direction, b.direction)
  if (Math.abs(c) < 0.05) return undefined
  const d = sub(pb, pa)
  const t = cross(d, b.direction) / c
  const u = cross(d, a.direction) / c
  return t > 0 && u > -1 ? t : undefined
}

/** The point on an arm's edge `t` metres from the node */
function edgeAt(arm: Arm, t: number, side: 'left' | 'right'): Vec2 {
  const at = pointAlong(arm.points, Math.min(t, polylineLength(arm.points)))
  return add(at.point, scale(rightNormal(at.direction), side === 'left' ? arm.left : arm.right))
}

const isRing = (arm: Arm) =>
  arm.line.way.tags.junction === 'roundabout' || arm.line.way.tags.junction === 'circular'

function distanceTo(points: readonly Vec2[], p: Vec2): number {
  const at = pointAlong(points, projectOnto(points, p)).point
  return len(sub(p, at))
}

/** Where the line through `a` along `da` meets the line through `b` along `db`; undefined when about parallel */
function lineMeeting(a: Vec2, da: Vec2, b: Vec2, db: Vec2): Vec2 | undefined {
  const c = cross(da, db)
  if (Math.abs(c) < 0.02) return undefined
  const t = cross(sub(b, a), db) / c
  return add(a, scale(da, t))
}

function projectOnto(points: readonly Vec2[], p: Vec2, upTo = Infinity): number {
  let best = { distance: Infinity, s: 0 }
  let s = 0
  for (let i = 1; i < points.length && s < upTo; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const ab = sub(b, a)
    const l = len(ab)
    if (l === 0) continue
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (l * l)))
    const distance = len(sub(p, add(a, scale(ab, t))))
    if (distance < best.distance) best = { distance, s: s + t * l }
    s += l
  }
  return best.s
}

/* ---------- runs: one road's lanes running on out of another's ---------- */

const flip = (direction: StreetLane['direction']): StreetLane['direction'] =>
  direction === 'forward' ? 'backward' : direction === 'backward' ? 'forward' : direction

/** A lane of the partner in this way's orientation: `k` is 1 when both ways run the same way through the node */
function converted(lane: StreetLane, k: number): StreetLane {
  return k > 0
    ? lane
    : { ...lane, left: -lane.right, right: -lane.left, direction: flip(lane.direction) }
}

const TURNS_INNER = new Set(['left', 'slight_left', 'sharp_left', 'reverse'])

/** A lane only turning left (or round): a turn lane added in the middle of the road */
function onlyTurnsLeft(lane: StreetLane | undefined): boolean {
  const tokens = (lane?.turn ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t !== '' && t !== 'none')
  return tokens.length > 0 && tokens.every((t) => TURNS_INNER.has(t))
}

/**
 * Pairs of lanes that carry on into each other, in one direction group, as indices into `own` and `other` (both in
 * way order). `innerFirst`: the group's inner side (next to the other direction) is its start. Lanes are paired from
 * the inner side, unless the group with more lanes starts with a lane only turning towards the inner side (a turn lane
 * added in the middle of the road): then from the outer side.
 */
function pairGroup(
  own: StreetLane[],
  other: StreetLane[],
  innerFirst: boolean,
  byKind: boolean,
): [number | undefined, number | undefined][] {
  const bigger = own.length >= other.length ? own : other
  const inner = innerFirst ? bigger[0] : bigger[bigger.length - 1]
  const turnLane = own.length !== other.length && onlyTurnsLeft(inner)
  const n = Math.max(own.length, other.length)
  const pairsFrom = (fromStart: boolean) => {
    const pairs: [number | undefined, number | undefined][] = []
    for (let i = 0; i < n; i++) {
      const a = fromStart ? i : own.length - 1 - i
      const b = fromStart ? i : other.length - 1 - i
      pairs.push([
        a >= 0 && a < own.length ? a : undefined,
        b >= 0 && b < other.length ? b : undefined,
      ])
    }
    return pairs
  }
  const pairs = pairsFrom(innerFirst !== turnLane)
  if (!byKind || own.length === other.length) return pairs
  // from the side that pairs more lanes of one kind: a cycle lane at the kerb carries on as the cycle lane
  const alike = (list: typeof pairs) =>
    list.filter(([a, b]) => a !== undefined && b !== undefined && own[a]!.kind === other[b]!.kind)
      .length
  const others = pairsFrom(innerFirst === turnLane)
  return alike(others) > alike(pairs) ? others : pairs
}

/**
 * The run of `own` out of `other` at one node: `other`'s lanes are already in `own`'s way orientation. Lanes are
 * grouped by direction (backward, both ways, forward, as they lie left to right on a road where traffic keeps right)
 * and paired within a group from the middle of the road outwards; `byKind` (at a fork): from the side on which more
 * lanes of one kind pair up.
 */
function runOf(
  own: readonly StreetLane[],
  other: readonly StreetLane[],
  byKind = false,
): Run | undefined {
  if (own.length === 1 || other.length === 1) return affineRun(own, other)
  const groupOf = (lanes: readonly StreetLane[]) => ({
    backward: lanes.filter((lane) => lane.direction === 'backward'),
    both: lanes.filter((lane) => lane.direction === 'both_ways'),
    forward: lanes.filter((lane) => lane.direction === 'forward'),
  })
  const a = groupOf(own)
  const b = groupOf(other)
  const targets: Run['targets'] = own.map(() => undefined)
  const tapers: RunTaper[] = []
  const indexOf = (lane: StreetLane) => own.indexOf(lane)

  const twoWay = (g: ReturnType<typeof groupOf>) => g.backward.length > 0 && g.forward.length > 0
  const groups: [StreetLane[], StreetLane[], boolean][] =
    twoWay(a) || twoWay(b) || a.both.length > 0 || b.both.length > 0
      ? [
          [a.backward, b.backward, false],
          [a.both, b.both, true],
          [a.forward, b.forward, true],
        ]
      : // one-way roads (or one-way into two-way the same way): one group in way order
        [[[...own], [...other], !(a.backward.length > 0 || b.backward.length > 0)]]

  for (const [mine, theirs, innerFirst] of groups) {
    const pairs = pairGroup(mine, theirs, innerFirst, byKind)
    // the edge a lane without partner closes onto: the side of its nearest paired neighbour towards it
    for (let p = 0; p < pairs.length; p++) {
      const [i, j] = pairs[p]!
      if (i !== undefined && j !== undefined) {
        targets[indexOf(mine[i]!)] = [theirs[j]!.left, theirs[j]!.right]
      }
    }
    for (let p = 0; p < pairs.length; p++) {
      const [i, j] = pairs[p]!
      if (i !== undefined && j !== undefined) continue
      // the nearest pair before this one in pairing order: its lanes are towards where pairing started
      let neighbour: [number, number] | undefined
      for (let q = p - 1; q >= 0 && !neighbour; q--) {
        const [ni, nj] = pairs[q]!
        if (ni !== undefined && nj !== undefined) neighbour = [ni, nj]
      }
      if (i !== undefined) {
        // a lane of ours with none on the other road: it narrows to nothing at the node
        const lane = mine[i]!
        const edge = neighbour
          ? lane.left >= mine[neighbour[0]]!.right - SAME_EDGE
            ? theirs[neighbour[1]]!.right
            : theirs[neighbour[1]]!.left
          : (lane.left + lane.right) / 2
        targets[indexOf(lane)] = [edge, edge]
      } else if (j !== undefined) {
        // a lane of the other road with none here: it narrows to nothing on our road
        const lane = theirs[j]!
        const collapse = neighbour
          ? lane.left >= theirs[neighbour[1]]!.right - SAME_EDGE
            ? mine[neighbour[0]]!.right
            : mine[neighbour[0]]!.left
          : (lane.left + lane.right) / 2
        tapers.push({ lane, target: [lane.left, lane.right], collapse })
      }
    }
  }
  const same =
    tapers.length === 0 &&
    own.every((lane, i) => {
      const target = targets[i]
      return (
        target !== undefined &&
        Math.abs(target[0] - lane.left) < SAME_EDGE &&
        Math.abs(target[1] - lane.right) < SAME_EDGE
      )
    })
  return same ? undefined : { targets, tapers }
}

/**
 * A road that is one lane (a carriageway without lane markings) and a road with several: their kerbs meet, and the
 * lane edges of the one that runs on are spread between the other's kerbs as they are between its own. No tapers.
 */
function affineRun(own: readonly StreetLane[], other: readonly StreetLane[]): Run | undefined {
  const ownLeft = Math.min(...own.map((lane) => lane.left))
  const ownRight = Math.max(...own.map((lane) => lane.right))
  const otherLeft = Math.min(...other.map((lane) => lane.left))
  const otherRight = Math.max(...other.map((lane) => lane.right))
  if (Math.abs(ownLeft - otherLeft) < SAME_EDGE && Math.abs(ownRight - otherRight) < SAME_EDGE)
    return undefined
  const k = ownRight > ownLeft ? (otherRight - otherLeft) / (ownRight - ownLeft) : 1
  const map = (x: number) => otherLeft + (x - ownLeft) * k
  return { targets: own.map((lane) => [map(lane.left), map(lane.right)]), tapers: [] }
}

/** Which of two partner arms runs on out of the other: the one with fewer lanes, then the narrower one */
function runner(a: Arm, b: Arm): Arm {
  const la = a.line.lanes.length
  const lb = b.line.lanes.length
  const wa = a.right - a.left
  const wb = b.right - b.left
  // one carriageway without lanes: the narrower road widens (or narrows) to the other's kerbs
  if ((la === 1 || lb === 1) && Math.abs(wa - wb) > SAME_EDGE) return wa < wb ? a : b
  if (la !== lb) return la < lb ? a : b
  if (Math.abs(wa - wb) > SAME_EDGE) return wa < wb ? a : b
  return a.line.way.id < b.line.way.id ? a : b
}

/* ---------- junctions ---------- */

/** Where an arm's two edges end at its junction, and the direction each kerb runs in there */
type End = { left: Vec2; right: Vec2; leftDirection: Vec2; rightDirection: Vec2 }

/** A junction node of a group of several: its arms and their ends */
type Box = { arms: Arm[]; ends: End[] }

type Junctions = {
  trims: Map<string, number>
  partners: Map<string, Vec2>
  runs: Map<string, Run>
  marks: Map<string, Marks>
  junctions: StreetJunction[]
  /** Nodes the ways are cut at */
  cuts: Set<string>
  /** The arms that are a short piece inside a junction of several nodes, by arm key (both ends of each piece) */
  inner: Set<string>
  /** The nodes of junctions of several nodes, whose surface is drawn once for the group */
  boxes: Map<string, Box>
}

function partnerUp(p: Arm, q: Arm, result: Junctions) {
  result.partners.set(armKey(p.line.way.id, p.index, p.alongWay), q.first)
  result.partners.set(armKey(q.line.way.id, q.index, q.alongWay), p.first)
  const runs = runner(p, q)
  const other = runs === p ? q : p
  // way orientation factor: offsets of the other way read in this way's orientation (see `converted`)
  const k = -(runs.alongWay ? 1 : -1) * (other.alongWay ? 1 : -1)
  const run = runOf(
    runs.line.lanes,
    other.line.lanes.map((lane) => converted(lane, k)),
  )
  if (run) result.runs.set(armKey(runs.line.way.id, runs.index, runs.alongWay), run)
}

const keyOf = (arm: Arm) => armKey(arm.line.way.id, arm.index, arm.alongWay)

/** The junction outline's points without the repeats that corners meeting in one point leave */
function cleaned(points: readonly Vec2[]): Vec2[] {
  return points.filter((p, i) => len(sub(p, points[(i + 1) % points.length]!)) > 0.05)
}

/**
 * Where the segments a–b and c–d cross, or undefined (touching ends do not count, unless `touching`: then an end lying
 * on the other segment, to a micrometre, counts too)
 */
function crossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2, touching = false): Vec2 | undefined {
  const ab = sub(b, a)
  const cd = sub(d, c)
  const k = cross(ab, cd)
  if (Math.abs(k) < 1e-9) return undefined
  const t = cross(sub(c, a), cd) / k
  const u = cross(sub(c, a), ab) / k
  const e = touching ? -1e-6 : 1e-6
  return t > e && t < 1 - e && u > e && u < 1 - e ? add(a, scale(ab, t)) : undefined
}

/** A loop of an outline is cut off where it has at most this many points */
const LOOP_POINTS = 12

/**
 * An outline without its small loops: where an edge crosses one a few points on (two kerb curves running into each
 * other, a road's end lying a little over its neighbour's), the points between are replaced by the crossing.
 * (Lane Studio fills its boxes as overlapping shapes and has no need of this.)
 */
function unlooped(ring: readonly Vec2[]): Vec2[] {
  let points = [...ring]
  for (let pass = 0; pass < 32; pass++) {
    let changed = false
    for (let i = 0; i < points.length && points.length > 4; i++) {
      const n = points.length
      const a = points[i]!
      const b = points[(i + 1) % n]!
      for (let step = 2; step <= LOOP_POINTS && step < n / 2; step++) {
        const j = (i + step) % n
        const meet = crossing(a, b, points[j]!, points[(j + 1) % n]!, true)
        if (!meet) continue
        // points i+1 … j go, the crossing takes their place
        const kept: Vec2[] = []
        for (let k = (j + 1) % n; k !== (i + 1) % n; k = (k + 1) % n) kept.push(points[k]!)
        kept.push(meet)
        // a cut that takes much of the surface is no small loop: that crossing stays
        if (Math.abs(signedArea2(kept)) <= Math.abs(signedArea2(points)) * 0.7) continue
        points = kept
        changed = true
        break
      }
    }
    if (!changed) break
  }
  return points
}

/**
 * The junction at one node: how far its arms are pulled back, which run through, and its surface. `grouped`: the node
 * is one of several of a junction, whose surface `groupJunction` draws from what is kept in `result.boxes`.
 */
function junctionAt(
  nodeId: string,
  arms: Arm[],
  frame: MetricFrame,
  result: Junctions,
  grouped = false,
) {
  // two roads meeting at a sharp angle (a hairpin between two ways) are not cut on the bisector: their mitre would throw
  // a spike far past the node. They end where their inner kerbs meet, and a small junction joins them round the outside
  const sharp =
    arms.length === 2 && angleBetween(arms[0]!.direction, arms[1]!.direction) < SHARP_CORNER
  if (arms.length === 2 && !sharp) {
    partnerUp(arms[0]!, arms[1]!, result)
    return
  }
  if (arms.length < 2) return
  result.cuts.add(nodeId)
  const through = throughPair(arms)
  const onMain = (i: number) => through !== null && (through[0] === i || through[1] === i)

  arms.forEach((arm, i) => {
    if (onMain(i)) return
    const leftNeighbour = arms[(i + 1) % arms.length]!
    const rightNeighbour = arms[(i - 1 + arms.length) % arms.length]!
    const l = edgeMeeting(arm, arm.left, leftNeighbour, leftNeighbour.right)
    const r = edgeMeeting(arm, arm.right, rightNeighbour, rightNeighbour.left)
    result.trims.set(
      armKey(arm.line.way.id, arm.index, arm.alongWay),
      Math.min(MAX_CLEARANCE, Math.max(l ?? 0, r ?? 0)),
    )
  })
  if (through) partnerUp(arms[through[0]]!, arms[through[1]]!, result)

  // a road joining a roundabout stops where both its kerbs are clear of the ring's curved outer edge, plus room for
  // its kerbs to flare into the ring (Lane Studio's ring joins; the straight lines from the node that other junctions
  // use miss the ring's curve)
  if (through && through.every((k) => isRing(arms[k]!))) {
    const ringArms = through.map((k) => arms[k]!)
    const ringLine = [...[...ringArms[0]!.points].reverse(), ...ringArms[1]!.points.slice(1)]
    const halfWidth = Math.max(
      ...ringArms.map((arm) => Math.max(Math.abs(arm.left), Math.abs(arm.right))),
    )
    arms.forEach((arm, i) => {
      if (onMain(i)) return
      const length = polylineLength(arm.points)
      const clear = (t: number) =>
        (['left', 'right'] as const).every(
          (side) => distanceTo(ringLine, edgeAt(arm, t, side)) > halfWidth + 0.3,
        )
      let t = 0
      while (t < Math.min(MAX_CLEARANCE, length * 0.45) && !clear(t)) t += 0.5
      const flare = Math.min(6, Math.max(2, (arm.right - arm.left) * 0.3))
      result.trims.set(
        armKey(arm.line.way.id, arm.index, arm.alongWay),
        Math.min(t + flare, MAX_CLEARANCE, length * 0.45),
      )
    })
  }

  const trimOf = (arm: Arm) =>
    result.trims.get(armKey(arm.line.way.id, arm.index, arm.alongWay)) ?? 0
  const directionAt = (arm: Arm, t: number) =>
    pointAlong(arm.points, Math.min(t, polylineLength(arm.points))).direction
  const ends: End[] = arms.map((arm) => {
    const t = trimOf(arm)
    const direction = directionAt(arm, t)
    return {
      left: edgeAt(arm, t, 'left'),
      right: edgeAt(arm, t, 'right'),
      leftDirection: direction,
      rightDirection: direction,
    }
  })
  /** The main road's arms whose surface is only the mouth of a side road */
  const mouths = new Set<number>()
  // the main road's end of the box reaches along it to the corners of the side roads next to it
  if (through) {
    for (const i of through) {
      const arm = arms[i]!
      const length = polylineLength(arm.points)
      const next = (i + 1) % arms.length
      const previous = (i - 1 + arms.length) % arms.length
      const reach = { left: 0, right: 0 }
      if (!onMain(next)) {
        reach.left = Math.min(
          MAX_CLEARANCE,
          length,
          projectOnto(arm.points, ends[next]!.right, MAX_CLEARANCE),
        )
        ends[i]!.left = edgeAt(arm, reach.left, 'left')
        ends[i]!.leftDirection = directionAt(arm, reach.left)
      }
      if (!onMain(previous)) {
        reach.right = Math.min(
          MAX_CLEARANCE,
          length,
          projectOnto(arm.points, ends[previous]!.left, MAX_CLEARANCE),
        )
        ends[i]!.right = edgeAt(arm, reach.right, 'right')
        ends[i]!.rightDirection = directionAt(arm, reach.right)
      }
      // in a junction of several nodes the surface starts square across the main road, not from the node on the side
      // without a side road: the other half of the road may be a short piece inside the junction, which has no lines
      if (grouped) {
        const square = Math.max(reach.left, reach.right)
        for (const side of ['left', 'right'] as const) {
          if (reach[side] === square) continue
          reach[side] = square
          ends[i]![side] = edgeAt(arm, square, side)
          ends[i]![`${side}Direction`] = directionAt(arm, square)
        }
      }
      // roads joining on one side only (a T-junction): the surface is only the mouth outside the main road's kerb on that
      // side, not a wedge across the main road's lanes (Lane Studio's `mouthOnly`, here for two-way roads too)
      if (!grouped && onMain(next) !== onMain(previous)) {
        mouths.add(i)
        const facing = onMain(next) ? 'right' : 'left'
        const other = facing === 'left' ? 'right' : 'left'
        ends[i]![other] = ends[i]![facing]
        ends[i]![`${other}Direction`] = ends[i]![`${facing}Direction`]
      }
      const lanes = Math.max(reach.left, reach.right)
      // in the way's frame an arm against the way has its sides swapped
      result.marks.set(
        armKey(arm.line.way.id, arm.index, arm.alongWay),
        arm.alongWay
          ? { left: reach.left, right: reach.right, lanes }
          : { left: reach.right, right: reach.left, lanes },
      )
    }
  }

  // between the two halves of the main road, where their edges are still at the node, the two edges meet where they
  // cross (on the bisector of the bend, as the lanes are cut), not each at its own normal (Lane Studio's `cutCorner`)
  if (through) {
    arms.forEach((arm, i) => {
      const j = (i + 1) % arms.length
      // (not on the side of a T-junction without a side road: its surface there is the mouth's kerb, not the bend)
      if (!onMain(i) || !onMain(j) || i === j || mouths.has(i) || mouths.has(j)) return
      const end = ends[i]!
      const next = ends[j]!
      const node = arm.points[0]!
      const atNode = (p: Vec2) =>
        len(sub(p, node)) < Math.max(Math.abs(arm.left), Math.abs(arm.right)) * 2 + 1
      if (!atNode(end.left) || !atNode(next.right)) return
      const meet = lineMeeting(end.left, arm.first, next.right, arms[j]!.first)
      // (the edges of two halves about in line but of different widths meet far off: they keep their own ends)
      if (meet && atNode(meet)) {
        end.left = meet
        next.right = meet
      }
    })
  }

  if (grouped) {
    result.boxes.set(nodeId, { arms, ends })
    return
  }

  // arms are counter-clockwise and each arm's right edge comes before its left, so the outline does not cross itself
  const points: Vec2[] = []
  const kerbs: Vec2[][] = []
  ends.forEach((end, i) => {
    const j = (i + 1) % ends.length
    const next = ends[j]!
    const corner = cornerCurve(end.left, end.leftDirection, next.right, next.rightDirection)
    points.push(end.right, end.left, ...corner.slice(1, -1))
    if (!(onMain(i) && onMain(j)) && len(sub(next.right, end.left)) > 0.5) kerbs.push(corner)
  })
  const guides = guidesAt(arms, result, through)
  let outline = unlooped(cleaned(points))
  // still crossing itself: a side road whose end lies askew over the main road's kerb, so its corners and their places
  // on the kerb come in the wrong order. The surface of the few points of one node is then their hull
  if (crossesItself(outline)) outline = convexHull(outline)
  result.junctions.push({
    nodeId,
    // a mouth with no width (a side road ending right at the main road's kerb) has no surface, only its kerbs
    ring: Math.abs(signedArea2(outline)) / 2 < 0.5 ? [] : outline.map((p) => frame.toLoc(p)),
    kerbs: kerbs.map((kerb) => kerb.map((p) => frame.toLoc(p))),
    ...(guides.length ? { guides: guides.map((line) => line.map((p) => frame.toLoc(p))) } : {}),
  })
}

/* ---------- guide lines: where each lane leads through a junction ---------- */

/** The ranges of turn tokens, in degrees from straight on, left positive (Lane Studio's `turnMatches`, simplified) */
const TURN_RANGES: Record<string, [number, number]> = {
  through: [-35, 35],
  slight_left: [10, 70],
  left: [45, 140],
  sharp_left: [100, 175],
  slight_right: [-70, -10],
  right: [-140, -45],
  sharp_right: [-175, -100],
}
const TURN_TARGET: Record<string, number> = {
  through: 0,
  slight_left: 40,
  left: 90,
  sharp_left: 135,
  slight_right: -40,
  right: -90,
  sharp_right: -135,
}

/** A curve from `a` along `ta` to `b` along `tb` (both unit), as Lane Studio's `curve` */
function guideCurve(a: Vec2, ta: Vec2, b: Vec2, tb: Vec2): Vec2[] {
  const k = len(sub(b, a)) / 3
  const c1 = add(a, scale(ta, k))
  const c2 = sub(b, scale(tb, k))
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12
    const u = 1 - t
    return [
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
    ] as Vec2
  })
}

/**
 * Dashed lines through a junction from the end of each lane coming in to the start of the lane it leads to, after Lane
 * Studio's guide lines (`junctionConnections`): by the lane's turn arrows (no arrows: straight on), to the road whose
 * angle fits the arrow, onto its leftmost lane for a left turn, its rightmost for a right turn, the same lane counted
 * from the left straight on. Cycle lanes lead to cycle lanes. The main road's lanes running straight through need none.
 * Traffic keeps right.
 */
function guidesAt(
  arms: readonly Arm[],
  result: Junctions,
  through: [number, number] | null,
): Vec2[][] {
  const onMain = (i: number) => through !== null && (through[0] === i || through[1] === i)
  /** Where an arm's lanes end at the junction: its trim, or on the main road where its lane lines stop */
  const endOf = (arm: Arm) => {
    const key = armKey(arm.line.way.id, arm.index, arm.alongWay)
    const t = Math.max(result.trims.get(key) ?? 0, result.marks.get(key)?.lanes ?? 0)
    return Math.min(t, polylineLength(arm.points))
  }
  /** The lanes of an arm in its own frame (right of looking away from the node positive), coming in or going out */
  const lanesOf = (arm: Arm, coming: boolean) => {
    const wanted = coming === arm.alongWay ? 'backward' : 'forward'
    return (
      arm.line.lanes
        // a lane used both ways (a street without lane markings) is both coming in and going out
        .filter((lane) => lane.direction === wanted || lane.direction === 'both_ways')
        .map((lane) => ({
          lane,
          x: arm.alongWay ? (lane.left + lane.right) / 2 : -(lane.left + lane.right) / 2,
        }))
    )
  }
  const placeOn = (arm: Arm, x: number) => {
    const at = pointAlong(arm.points, endOf(arm))
    return { point: add(at.point, scale(rightNormal(at.direction), x)), direction: at.direction }
  }
  const lines: Vec2[][] = []
  arms.forEach((from, i) => {
    // coming in, in the driver's order from the left: looking towards the node, the arm frame's right is the driver's left
    const coming = lanesOf(from, true).sort((p, q) => q.x - p.x)
    if (!coming.length) return
    const heading = scale(from.direction, -1)
    const angleTo = (arm: Arm) =>
      (Math.atan2(cross(heading, arm.direction), dot(heading, arm.direction)) * 180) / Math.PI
    coming.forEach(({ lane, x }, order) => {
      const tokens = (lane.turn ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter((t) => t in TURN_RANGES)
      for (const token of tokens.length ? tokens : ['through']) {
        const [lo, hi] = TURN_RANGES[token]!
        let best: { j: number; off: number } | undefined
        arms.forEach((to, j) => {
          if (j === i) return
          const angle = angleTo(to)
          if (angle < lo || angle > hi) return
          const off = Math.abs(angle - TURN_TARGET[token]!)
          if (!best || off < best.off) best = { j, off }
        })
        if (!best) continue
        const to = arms[best.j]!
        // the main road straight through is drawn through the junction; in a group of nodes, a road that carries on in
        // its own line needs no guide either (a side road across, offset, does: a staggered junction)
        if (token === 'through' && onMain(i) && onMain(best.j)) continue
        if (
          token === 'through' &&
          !through &&
          Math.abs(angleTo(to)) < 15 &&
          Math.abs(cross(heading, sub(to.points[0]!, from.points[0]!))) < 2
        )
          continue
        const cycle = lane.kind === 'bicycle'
        // going out, in the driver's order from the left: the arm frame's left is the driver's left
        const going = lanesOf(to, false)
          .filter((g) => (g.lane.kind === 'bicycle') === cycle)
          .sort((p, q) => p.x - q.x)
        if (!going.length) continue
        const throughOrder = coming
          .filter((c) => (c.lane.kind === 'bicycle') === cycle)
          .indexOf(coming[order]!)
        const target =
          TURN_TARGET[token]! > 20
            ? going[0]!
            : TURN_TARGET[token]! < -20
              ? going[going.length - 1]!
              : going[Math.min(Math.max(throughOrder, 0), going.length - 1)]!
        const start = placeOn(from, x)
        const end = placeOn(to, target.x)
        if (len(sub(end.point, start.point)) < 1) continue
        lines.push(guideCurve(start.point, scale(start.direction, -1), end.point, end.direction))
      }
    })
  })
  return lines
}

/* ---------- forks: slip roads, merges, a road parting into its carriageways ---------- */

/** A road beyond a fork */
type ForkBranch = {
  arm: Arm
  /**
   * Its share of the stem's end: from and to, in metres across the stem at the node, to the right of someone looking
   * from the stem on over the fork
   */
  span: [number, number]
  /** The stem's lanes of its share, as lanes of this road: offsets along the stem's end, to the way's right */
  lanes: StreetLane[]
  /** The length of its piece, up to its next junction or its end */
  piece: number
  /** How much of that the fork may take: less where a junction follows, which pulls the road back */
  room: number
}

/** A fork: the road before it and the two roads beyond, the left one first (as seen from the stem) */
type Fork = { stem: Arm; right: Vec2; branches: [ForkBranch, ForkBranch] }

/**
 * Shares `n` lanes (left to right) out among roads of `counts` lanes each (left to right), in proportion: each road
 * takes the lanes nearest its side, at least one; a lane between two shares goes to both (Lane Studio's `shareOut`)
 */
function shareOut(n: number, counts: readonly number[]): [number, number][] {
  const total = counts.reduce((a, b) => a + b, 0)
  let start = 0
  return counts.map((count) => {
    const from = Math.min(n - 1, Math.floor((start * n) / total))
    start += count
    const to = Math.min(n, Math.max(from + 1, Math.ceil((start * n) / total)))
    return [from, to]
  })
}

/**
 * The fork at a node of three arms, or null: one arm (the stem) with the two others carrying on from it at shallow
 * angles, and lanes such that no traffic crosses: what arrives on the stem leaves on the roads beyond, what arrives on
 * those leaves on the stem, and the shares of the stem's lanes lie side by side as the roads do. That is a slip road
 * leaving or joining a road that runs on, two one-way roads joining, a road parting into two carriageways (Lane
 * Studio's `splitAt`, and what its `alignBranches` and `alignMerges` take as a slip road). `cutNodes`: where the ways
 * are cut, for the length of each road beyond the fork.
 */
function forkAt(arms: readonly Arm[], cutNodes: ReadonlySet<string>): Fork | null {
  if (arms.length !== 3 || arms.some(isRing)) return null
  // (a lane used both ways has no side of the road to share out)
  if (arms.some((arm) => arm.line.lanes.some((lane) => lane.direction === 'both_ways'))) return null
  let best: { fork: Fork; deviation: number } | null = null
  for (const stem of arms) {
    const others = arms.filter((arm) => arm !== stem)
    const ahead = scale(stem.direction, -1)
    const deviation = Math.max(...others.map((arm) => angleBetween(arm.direction, ahead)))
    if (deviation > FORK_ANGLE || (best && best.deviation <= deviation)) continue
    if (others[0]!.line === others[1]!.line) continue
    // the stem ends square across itself: `right` is along its end
    const right = rightNormal(scale(stem.first, -1))
    if (others.some((arm) => dot(right, rightNormal(arm.first)) < 0.7)) continue
    const [a, b] = [...others].sort((p, q) => dot(p.direction, right) - dot(q.direction, right))
    const pieces = [a!, b!].map((arm) => {
      const far = nextCut(arm.line, arm.index, arm.alongWay ? 1 : -1, cutNodes)
      const end = far < 0 ? (arm.alongWay ? arm.line.total : 0) : arm.line.at[far]!
      const piece = Math.abs(end - arm.line.at[arm.index]!)
      return { piece, room: piece * (far < 0 ? FORK_SHARE_FREE : FORK_SHARE) }
    })
    if (Math.min(...pieces.map((p) => p.piece)) < FORK_MIN_PIECE) continue

    const spans: [number, number][] = [
      [Infinity, -Infinity],
      [Infinity, -Infinity],
    ]
    const shared: StreetLane[][] = [[], []]
    let fits = true
    // traffic arriving on the stem and leaving on the roads beyond, then the other way round
    for (const arriving of [true, false]) {
      // the stem's lanes that way, across its end from left to right
      const wanted = arriving === stem.alongWay ? 'backward' : 'forward'
      const stemLanes = stem.line.lanes
        // a lane used both ways (a street without lane markings) is both coming in and going out
        .filter((lane) => lane.direction === wanted || lane.direction === 'both_ways')
        .map((lane) => ({
          lane,
          across: (stem.alongWay ? [-lane.right, -lane.left] : [lane.left, lane.right]) as [
            number,
            number,
          ],
        }))
        .sort((p, q) => p.across[0] - q.across[0])
      const counts = [a!, b!].map((arm) => {
        const away = arriving === arm.alongWay ? 'forward' : 'backward'
        return arm.line.lanes.filter((lane) => lane.direction === away).length
      })
      const takers = counts.flatMap((count, k) => (count > 0 ? [k] : []))
      if (stemLanes.length === 0 && takers.length === 0) continue
      if (stemLanes.length === 0 || takers.length === 0) {
        fits = false
        break
      }
      const shares = shareOut(
        stemLanes.length,
        takers.map((k) => counts[k]!),
      )
      takers.forEach((k, t) => {
        const [from, to] = shares[t]!
        spans[k] = [
          Math.min(spans[k]![0], stemLanes[from]!.across[0]),
          Math.max(spans[k]![1], stemLanes[to - 1]!.across[1]),
        ]
        // as lanes of the road beyond: what arrives on the stem carries on away from the node
        const arm = k === 0 ? a! : b!
        for (const { lane, across } of stemLanes.slice(from, to)) {
          shared[k]!.push({
            id: lane.id,
            kind: lane.kind,
            left: arm.alongWay ? across[0] : -across[1],
            right: arm.alongWay ? across[1] : -across[0],
            direction: arriving === arm.alongWay ? 'forward' : 'backward',
          })
        }
      })
    }
    // the shares lie as the roads do: otherwise one road's traffic would cross the other's
    if (
      !fits ||
      spans.some((span) => !(span[1] > span[0])) ||
      spans[0]![0] > spans[1]![0] + SAME_EDGE ||
      spans[0]![1] > spans[1]![1] + SAME_EDGE
    )
      continue
    best = {
      deviation,
      fork: {
        stem,
        right,
        branches: [
          { arm: a!, span: spans[0]!, lanes: shared[0]!, ...pieces[0]! },
          { arm: b!, span: spans[1]!, lanes: shared[1]!, ...pieces[1]! },
        ],
      },
    }
  }
  return best?.fork ?? null
}

/**
 * An edge of a road beyond a fork over the first `length` metres, from the node outwards, as `drawWay` draws it: the
 * road's own edge (`own`, in the arm's frame), moved by `shift` at the node and less and less up to `length`. `at`: how
 * far along the road each point is.
 */
function forkEdge(arm: Arm, own: number, shift: Vec2, length: number) {
  const points = slicePolyline(arm.points, 0, Math.min(length, polylineLength(arm.points)))
  const at = cumulative(points)
  const edge = offsetPolyline(
    points,
    points.map(() => own),
  ).map((p, i) => add(p, scale(shift, Math.max(0, 1 - at[i]! / length))))
  return { edge, at }
}

/** Where two lines first cross: the segment of each and how far along it, 0 to 1 */
function linesCross(a: readonly Vec2[], b: readonly Vec2[]) {
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      const meet = crossing(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)
      if (!meet) continue
      const share = (p: Vec2, q: Vec2) => len(sub(meet, p)) / len(sub(q, p))
      return { i, ti: share(a[i]!, a[i + 1]!), j, tj: share(b[j]!, b[j + 1]!) }
    }
  }
  return undefined
}

/**
 * A fork is no junction (Lane Studio's `alignFork` and `splitJunction`): the stem runs up to the node and ends square,
 * and each road beyond starts there on its share of the stem's lanes and runs in straight lines to its own lanes.
 * (Lane Studio cuts the road's end along the stem's and moves its lane edges sideways; here each edge is moved as a
 * whole from the road's own square end onto the stem's, which leaves no kink at a vertex close to the node.) The
 * length of that is the same for both roads, so their edges do not cross: to where the two are clear of each other
 * and a little on. The wedge between them up to there is the fork's surface, with a kerb across its tip. Where the
 * two start on the same lane (a slip road peeling off a lane that runs on), their kerbs start where they part.
 */
function forkJunction(nodeId: string, fork: Fork, frame: MetricFrame, result: Junctions) {
  result.cuts.add(nodeId)
  const [a, b] = fork.branches
  const ends = fork.branches.map(({ arm, lanes }) => {
    const { line } = arm
    const normal = scale(rightNormal(arm.first), arm.alongWay ? 1 : -1)
    const axis = scale(fork.right, arm.alongWay ? 1 : -1)
    // its lanes carry on from the stem's lanes of its share, as the lanes of a road running on do (`runOf`)
    const run = runOf(
      line.lanes,
      [...lanes].sort((p, q) => p.left - q.left),
      true,
    )
    const targets = line.lanes.map(
      (lane, i): [number, number] => run?.targets[i] ?? [lane.left, lane.right],
    )
    const tapers = run?.tapers ?? []
    /** How far an edge is moved at the node: from `own` across this road to `target` along the stem's end */
    const shift = (own: number, target: number): Vec2 =>
      sub(scale(axis, target), scale(normal, own))
    // the outer edges of all that starts at the node, lanes of the stem narrowing to nothing on this road too
    const from = Math.min(...targets.map((t) => t[0]), ...tapers.map((t) => t.target[0]))
    const to = Math.max(...targets.map((t) => t[1]), ...tapers.map((t) => t.target[1]))
    return {
      arm,
      axis,
      normal,
      targets,
      tapers,
      outer: [shift(line.left, from), shift(line.right, to)],
    }
  })
  const moved = Math.max(...ends.flatMap(({ outer }) => outer.map(len)))
  // where the two roads' own edges are clear of each other
  let clear = 0
  const reach = Math.min(FORK_CLEAR, a.piece, b.piece)
  while (
    clear < reach &&
    (distanceTo(b.arm.points, edgeAt(a.arm, clear, 'right')) < -b.arm.left + 0.2 ||
      distanceTo(a.arm.points, edgeAt(b.arm, clear, 'left')) < a.arm.right + 0.2)
  )
    clear += 1
  const length = Math.min(Math.max(FORK_RUN, moved * 4, clear + 3), a.room, b.room)
  for (const { arm, axis, normal, targets, tapers } of ends)
    result.runs.set(keyOf(arm), { targets, tapers, fork: { length, axis, normal } })

  // the edges of the two roads that face each other: the left road's right one, the right road's left one
  const inner = (k: 0 | 1) => {
    const { arm, outer } = ends[k]!
    const side = k === 0 ? 'right' : 'left'
    // in the way's frame an arm against the way has its sides swapped
    const waySide = arm.alongWay ? side : side === 'left' ? 'right' : 'left'
    return { arm, waySide, ...forkEdge(arm, arm[side], outer[waySide === 'left' ? 0 : 1]!, length) }
  }
  const edgeA = inner(0)
  const edgeB = inner(1)
  const marksFrom = (side: ReturnType<typeof inner>, from: number) =>
    result.marks.set(keyOf(side.arm), { left: 0, right: 0, lanes: 0, [side.waySide]: from })
  const cross = linesCross(edgeA.edge, edgeB.edge)
  if (a.span[1] > b.span[0] + SAME_EDGE || length < clear) {
    // both start on one lane, or the run is cut short before the roads are clear of each other: no kerb between
    // them up to where their edges cross
    const station = (side: ReturnType<typeof inner>, i: number, t: number) =>
      side.at[i]! + (side.at[i + 1]! - side.at[i]!) * t
    marksFrom(edgeA, cross ? station(edgeA, cross.i, cross.ti) : length)
    marksFrom(edgeB, cross ? station(edgeB, cross.j, cross.tj) : length)
    return
  }
  const tipA = edgeA.edge[edgeA.edge.length - 1]!
  const tipB = edgeB.edge[edgeB.edge.length - 1]!
  const outline = cleaned([...edgeB.edge, ...[...edgeA.edge].reverse()])
  // only where the roads have drawn apart by the end of the wedge; cut short, they lie over each other
  if (
    cross ||
    outline.length < 3 ||
    signedArea2(outline) < 1 ||
    dot(sub(tipB, tipA), fork.right) < 0
  )
    return
  marksFrom(edgeA, length)
  marksFrom(edgeB, length)
  result.junctions.push({
    nodeId,
    ring: outline.map((p) => frame.toLoc(p)),
    kerbs: len(sub(tipB, tipA)) > 0.3 ? [[tipA, tipB].map((p) => frame.toLoc(p))] : [],
  })
}

/* ---------- junctions of several nodes ---------- */

/** The index of the next junction node along a way from `index`, or -1 */
function nextCut(line: WayLine, index: number, step: 1 | -1, junctionNodes: ReadonlySet<string>) {
  for (let i = index + step; i >= 0 && i < line.nodeIds.length; i += step)
    if (junctionNodes.has(line.nodeIds[i]!)) return i
  return -1
}

/**
 * Junction nodes joined by a piece of a way shorter than `CLUSTER_LINK`, as groups of node ids; only groups of two or
 * more (Lane Studio's `junctionClusters`). The short pieces' arms go to `inner`. A roundabout's ring carries on between
 * its junctions: they are never joined along it.
 */
function junctionGroups(
  lines: readonly WayLine[],
  junctionNodes: ReadonlySet<string>,
  inner: Set<string>,
  forkNodes: ReadonlySet<string>,
): string[][] {
  const parent = new Map<string, string>()
  const linked = new Set<string>()
  const find = (id: string): string => {
    let root = id
    for (let up = parent.get(root); up !== undefined; up = parent.get(root)) root = up
    if (root !== id) parent.set(id, root)
    return root
  }
  for (const line of lines) {
    const tags = line.way.tags
    if (tags.junction === 'roundabout' || tags.junction === 'circular') continue
    let last = -1
    line.nodeIds.forEach((id, i) => {
      // the ways are cut at a fork too: no short piece runs across one
      if (forkNodes.has(id)) last = -1
      if (!junctionNodes.has(id)) return
      const from = last
      last = i
      if (from < 0 || line.nodeIds[from] === id || line.at[i]! - line.at[from]! >= CLUSTER_LINK)
        return
      inner.add(armKey(line.way.id, from, true))
      inner.add(armKey(line.way.id, i, false))
      linked.add(line.nodeIds[from]!).add(id)
      const a = find(line.nodeIds[from]!)
      const b = find(id)
      if (a !== b) parent.set(a, b)
    })
  }
  const groups = new Map<string, string[]>()
  for (const id of linked) {
    const root = find(id)
    const list = groups.get(root)
    if (list) list.push(id)
    else groups.set(root, [id])
  }
  return [...groups.values()].map((ids) => ids.sort())
}

/** Short pieces smaller than this between them leave no hole in a junction's surface, in square metres */
const MIN_HOLE = 4

/**
 * The surface of a junction of several nodes: one ring round the outside of the group, and a hole for each gap that
 * its short pieces enclose (an island, a block). Each is a walk, counter-clockwise as `junctionAt`'s round one node:
 * at a road leaving the group it takes the road's end (right edge, then left) and a kerb curve to the next arm of that
 * node; at a short piece inside the group it follows the piece's kerb to the node at its other end and carries on
 * with the arm after it there. Every arm of every node starts one walk or lies on an earlier one; the walk round the
 * outside encloses the most.
 */
function groupJunction(
  nodeIds: readonly string[],
  junctionNodes: ReadonlySet<string>,
  frame: MetricFrame,
  result: Junctions,
) {
  type At = { box: Box; i: number }
  type Road = { end: End }
  const boxes = nodeIds.flatMap((id) => result.boxes.get(id) ?? [])
  const place = new Map<string, At>()
  for (const box of boxes) box.arms.forEach((arm, i) => place.set(keyOf(arm), { box, i }))
  /** The arm at the other end of a short piece, or undefined for a road leaving the group */
  const across = (arm: Arm) => {
    if (!result.inner.has(keyOf(arm))) return undefined
    const far = nextCut(arm.line, arm.index, arm.alongWay ? 1 : -1, junctionNodes)
    const other = far < 0 ? undefined : place.get(armKey(arm.line.way.id, far, !arm.alongWay))
    return other ? { ...other, far } : undefined
  }
  /** Where the kerb the walk came in along (the left of `incoming`) meets the kerb it leaves along, at their node */
  const turn = (incoming: Arm, outgoing: Arm): Vec2[] => {
    const node = incoming.points[0]!
    const a = add(node, scale(rightNormal(incoming.first), incoming.left))
    const b = add(node, scale(rightNormal(outgoing.first), outgoing.right))
    const meet = lineMeeting(a, incoming.first, b, outgoing.first)
    const reach = Math.max(Math.abs(incoming.left), Math.abs(outgoing.right)) * 3 + 1
    return meet && len(sub(meet, node)) < reach ? [meet] : [a, b]
  }

  /**
   * Two roads side by side whose ends lie over each other (the carriageways of a dual carriageway drawn wider than
   * the gap between their lines): going from the first one's left edge to the second one's right edge would go back
   * on the first one's end, so both points are left out
   */
  const overlap = (a: End, b: End) => {
    const across = sub(a.left, a.right)
    const along = unit(across)
    return (
      Math.abs(cross(along, unit(sub(b.left, b.right)))) < 0.35 &&
      Math.abs(cross(along, sub(b.right, a.right))) < 3 &&
      dot(sub(b.right, a.left), along) < 0 &&
      dot(sub(b.left, a.left), along) > 0 &&
      dot(sub(b.right, a.right), along) > 0
    )
  }

  const walked = new Set<string>()
  const faces: { points: Vec2[]; kerbs: Vec2[][]; area: number }[] = []
  for (const startBox of boxes) {
    for (let startI = 0; startI < startBox.arms.length; startI++) {
      if (walked.has(keyOf(startBox.arms[startI]!))) continue
      const points: Vec2[] = []
      const kerbs: Vec2[][] = []
      /** The kerbs of the short pieces walked since the last road, and those walked before the first one */
      let pending: Vec2[] = []
      let lead: Vec2[] | undefined
      let leadHops = 0
      let from: Road | undefined
      let opening: Road | undefined
      let incoming: Arm | undefined
      /** Short pieces walked since the last road */
      let hops = 0
      const join = (to: Road): boolean => {
        if (!from) return false
        if (pending.length === 0 && overlap(from.end, to.end)) {
          points.pop()
          return true
        }
        // a kerb curve only between two roads of one node: past a short piece the kerbs of the two roads meet
        // somewhere else than at the corner of the surface, which runs along the piece's kerb
        const corner =
          hops > 0
            ? [from.end.left, ...pending, to.end.right]
            : cornerCurve(
                from.end.left,
                from.end.leftDirection,
                to.end.right,
                to.end.rightDirection,
              )
        points.push(...corner.slice(1, -1))
        // (also between the two halves of a main road: their own kerbs stop where the surface starts)
        if (len(sub(to.end.right, from.end.left)) > 0.5) kerbs.push(corner)
        return false
      }
      let at: At = { box: startBox, i: startI }
      do {
        const arm = at.box.arms[at.i]!
        walked.add(keyOf(arm))
        const other = across(arm)
        if (other) {
          if (incoming) pending.push(...turn(incoming, arm))
          const piece = arm.alongWay
            ? arm.line.points.slice(arm.index, other.far + 1)
            : arm.line.points.slice(other.far, arm.index + 1).reverse()
          pending.push(
            ...offsetPolyline(
              piece,
              piece.map(() => arm.right),
            ).slice(1, -1),
          )
          incoming = other.box.arms[other.i]!
          hops++
          at = { box: other.box, i: (other.i + 1) % other.box.arms.length }
        } else {
          const road: Road = { end: at.box.ends[at.i]! }
          const over = join(road)
          if (!from) {
            lead = pending
            leadHops = hops
          }
          opening ??= road
          if (!over) points.push(road.end.right)
          points.push(road.end.left)
          from = road
          pending = []
          hops = 0
          incoming = undefined
          at = { box: at.box, i: (at.i + 1) % at.box.arms.length }
        }
      } while (!(at.box === startBox && at.i === startI) && points.length < 10_000)
      // back at the start: the corner there, then on to the first road past the short pieces walked before it
      const startArm = startBox.arms[startI]!
      if (incoming && across(startArm)) pending.push(...turn(incoming, startArm))
      if (opening) {
        pending.push(...(lead ?? []))
        hops += leadHops
        if (from !== opening && join(opening)) points.shift()
      } else {
        // no road leaves on this side: the short pieces' kerbs are the whole ring
        points.push(...pending)
        if (pending.length > 2) kerbs.push([...pending, pending[0]!])
      }
      const outline = unlooped(cleaned(points))
      if (outline.length >= 3)
        faces.push({ points: outline, kerbs, area: signedArea2(outline) / 2 })
    }
  }
  faces.sort((a, b) => Math.abs(b.area) - Math.abs(a.area))
  const outside = faces[0]
  if (!outside) return
  // a gap is walked the other way round than the outside; anything else is short pieces lying over each other
  const holes = faces.slice(1).filter((face) => Math.sign(face.area) !== Math.sign(outside.area))
  const kept = holes.filter((face) => Math.abs(face.area) > MIN_HOLE)
  const toLocs = (line: Vec2[]) => line.map((p) => frame.toLoc(p))
  // guide lines between the roads that leave the group, as at a junction of one node; no road runs through it drawn
  const leaving = boxes.flatMap((box) => box.arms.filter((arm) => !across(arm)))
  const guides = guidesAt(leaving, result, null)
  result.junctions.push({
    nodeId: nodeIds[0]!,
    nodeIds: [...nodeIds],
    ring: toLocs(outside.points),
    ...(kept.length > 0 ? { holes: kept.map((face) => toLocs(face.points)) } : {}),
    kerbs: [outside, ...kept].flatMap((face) => face.kerbs.map(toLocs)),
    ...(guides.length ? { guides: guides.map(toLocs) } : {}),
  })
}

/* ---------- pieces ---------- */

type Out = {
  lanes: StreetLanePolygon[]
  lines: StreetLine[]
  arrows: StreetArrow[]
}

function bearingOf(direction: Vec2): number {
  return ((Math.atan2(direction[0], direction[1]) * 180) / Math.PI + 360) % 360
}

function ring(left: Vec2[], right: Vec2[], frame: MetricFrame): LonLat[] {
  return [...left, ...[...right].reverse()].map((p) => frame.toLoc(p))
}

function drawWay(line: WayLine, junctions: Junctions, frame: MetricFrame, out: Out) {
  const { way, points, nodeIds, at } = line
  const cuts = [0]
  for (let i = 1; i < nodeIds.length - 1; i++) if (junctions.cuts.has(nodeIds[i]!)) cuts.push(i)
  cuts.push(nodeIds.length - 1)

  for (let p = 0; p < cuts.length - 1; p++) {
    const a = cuts[p]!
    const b = cuts[p + 1]!
    const length = at[b]! - at[a]!
    if (length <= 0) continue
    const startKey = armKey(way.id, a, true)
    const endKey = armKey(way.id, b, false)
    // a short piece inside a junction of several nodes is part of the junction's surface. Only where it is the main
    // road at both its ends are its lanes drawn, so the road's lanes run through the junction, without lines
    const inside = junctions.inner.has(startKey)
    if (inside && !(junctions.partners.has(startKey) && junctions.partners.has(endKey))) continue
    let trimStart = junctions.trims.get(startKey) ?? 0
    let trimEnd = junctions.trims.get(endKey) ?? 0
    if (trimStart + trimEnd > length * 0.9) {
      const k = (length * 0.9) / (trimStart + trimEnd)
      trimStart *= k
      trimEnd *= k
    }
    const runStart = trimStart < 0.01 ? junctions.runs.get(startKey) : undefined
    const runEnd = trimEnd < 0.01 ? junctions.runs.get(endKey) : undefined
    // (a fork's run has its own length, but ends before a junction's trim at the piece's other end)
    const runLengthOf = (run: Run | undefined, otherTrim: number) =>
      run?.fork === undefined
        ? Math.min(RUN_LENGTH, length * RUN_SHARE)
        : Math.max(1, Math.min(run.fork.length, length - otherTrim - 1))
    const runLengthStart = runLengthOf(runStart, trimEnd)
    const runLengthEnd = runLengthOf(runEnd, trimStart)
    const markStart = trimStart < 0.01 ? junctions.marks.get(startKey) : undefined
    const markEnd = trimEnd < 0.01 ? junctions.marks.get(endKey) : undefined
    const centre = points.slice(a, b + 1)
    // vertices every 2 m along a run, so its edges ease smoothly; a fork's run is straight and needs only its end
    const breaks: number[] = []
    for (const [run, from, runLength] of [
      [runStart, 0, runLengthStart],
      [runEnd, length - runLengthEnd, runLengthEnd],
    ] as const) {
      if (!run) continue
      if (run.fork) breaks.push(from, from + runLength)
      else for (let s = 0; s <= runLength; s += 2) breaks.push(from + s)
    }
    const sliced = cutSharpBends(
      slicePolyline(centre, trimStart, length - trimEnd, breaks),
      Math.max(Math.abs(line.left), Math.abs(line.right)),
      SHARP_BEND,
    )
    const local = cumulative(sliced).map((s) => s + trimStart)
    const pieceStart = trimStart
    const pieceEnd = length - trimEnd
    const partnerIn = trimStart < 0.01 ? junctions.partners.get(startKey) : undefined
    const partnerOut = trimEnd < 0.01 ? junctions.partners.get(endKey) : undefined
    const ends = { into: partnerIn ? scale(partnerIn, -1) : undefined, outOf: partnerOut }
    const offset = (distances: number[]) => offsetPolyline(sliced, distances, ends)

    // run weights at each vertex: 1 at the node, 0 a run's length on
    const weight = (run: Run | undefined, x: number) =>
      !run ? 0 : run.fork === undefined ? smooth(x) : Math.max(0, Math.min(1, x))
    const wStart = local.map((s) => weight(runStart, 1 - s / runLengthStart))
    const wEnd = local.map((s) => weight(runEnd, 1 - (length - s) / runLengthEnd))
    const edgeOf = (laneIndex: number, side: 0 | 1, i: number) => {
      const lane = line.lanes[laneIndex]!
      const own = side === 0 ? lane.left : lane.right
      let value = own
      // (a fork's targets are not across this road: its edges are moved afterwards)
      const ts = runStart?.fork ? undefined : runStart?.targets[laneIndex]
      const te = runEnd?.fork ? undefined : runEnd?.targets[laneIndex]
      if (ts) value += (ts[side] - own) * wStart[i]!
      if (te) value += (te[side] - own) * wEnd[i]!
      return value
    }

    const boundaries = line.lanes.map((_, laneIndex) => ({
      left: offset(local.map((_, i) => edgeOf(laneIndex, 0, i))),
      right: offset(local.map((_, i) => edgeOf(laneIndex, 1, i))),
    }))
    // beyond a fork the edges start on the stem's end and run to their own places
    const forkShift = (run: Run, own: number, target: number): Vec2 =>
      sub(scale(run.fork!.axis, target), scale(run.fork!.normal, own))
    const moved = (edge: Vec2[], by: Vec2, weights: number[]) =>
      edge.map((p, i) => add(p, scale(by, weights[i]!)))
    for (const [run, weights] of [
      [runStart, wStart],
      [runEnd, wEnd],
    ] as const) {
      if (!run?.fork) continue
      boundaries.forEach((boundary, laneIndex) => {
        const lane = line.lanes[laneIndex]!
        const target = run.targets[laneIndex] ?? [lane.left, lane.right]
        boundary.left = moved(boundary.left, forkShift(run, lane.left, target[0]), weights)
        boundary.right = moved(boundary.right, forkShift(run, lane.right, target[1]), weights)
      })
    }
    for (const boundary of boundaries) {
      boundary.left = unfolded(boundary.left, sliced)
      boundary.right = unfolded(boundary.right, sliced)
    }
    line.lanes.forEach((lane, laneIndex) => {
      const { left, right } = boundaries[laneIndex]!
      out.lanes.push({
        wayId: way.id,
        laneId: lane.id,
        kind: lane.kind,
        direction: lane.direction,
        ...(lane.turn === undefined ? {} : { turn: lane.turn }),
        ring: ring(left, right, frame),
      })
    })

    // tapers: lanes of the road this one runs on into, narrowing to nothing over the run
    for (const [run, weights, atStart] of [
      [runStart, wStart, true],
      [runEnd, wEnd, false],
    ] as const) {
      if (!run) continue
      const inRun = local.map((_, i) => weights[i]! > 0)
      const from = atStart ? 0 : Math.max(0, inRun.indexOf(true) - 1)
      const to = atStart ? Math.min(local.length, inRun.lastIndexOf(true) + 2) : local.length
      if (to - from < 2) continue
      for (const taper of run.tapers) {
        const edge = (target: number) =>
          unfolded(
            run.fork
              ? moved(
                  offset(local.map(() => taper.collapse)),
                  forkShift(run, taper.collapse, target),
                  [...weights],
                )
              : offset(
                  local.map((_, i) => taper.collapse + (target - taper.collapse) * weights[i]!),
                ),
            sliced,
          )
        out.lanes.push({
          wayId: way.id,
          laneId: `${taper.lane.id}#taper`,
          kind: taper.lane.kind,
          direction: taper.lane.direction,
          ring: ring(
            edge(taper.target[0]).slice(from, to),
            edge(taper.target[1]).slice(from, to),
            frame,
          ),
          taper: true,
        })
      }
    }

    // lane lines and kerbs, stopped where a junction's marks say (the main road through a junction)
    if (inside) continue
    /** The part of an edge from `from` metres after the piece's start to `to` metres before its end */
    const part = (edge: Vec2[], from: number, to: number): Vec2[] => {
      const lo = pieceStart + from
      const hi = pieceEnd - to
      const kept: Vec2[] = []
      if (hi - lo < 0.01) return kept
      local.forEach((s, i) => {
        if (s >= lo - 1e-6 && s <= hi + 1e-6) kept.push(edge[i]!)
        const next = local[i + 1]
        if (next === undefined) return
        // (an end between two vertices: the point on the edge there)
        for (const x of [lo, hi])
          if (x > s + 1e-6 && x < next - 1e-6)
            kept.push(add(edge[i]!, scale(sub(edge[i + 1]!, edge[i]!), (x - s) / (next - s))))
      })
      return kept
    }
    const push = (kind: StreetLineKind, edge: Vec2[], from: number, to: number) => {
      const kept = part(edge, from, to)
      if (kept.length >= 2)
        out.lines.push({ wayId: way.id, kind, line: kept.map((q) => frame.toLoc(q)) })
    }
    const first = boundaries[0]
    const last = boundaries[boundaries.length - 1]
    if (first) push('kerb', first.left, markStart?.left ?? 0, markEnd?.left ?? 0)
    if (last) push('kerb', last.right, markStart?.right ?? 0, markEnd?.right ?? 0)
    for (let i = 0; i + 1 < line.lanes.length; i++) {
      const lane = line.lanes[i]!
      const next = line.lanes[i + 1]!
      if (Math.abs(lane.right - next.left) > SAME_EDGE) continue
      const kind: StreetLineKind =
        (lane.direction === 'forward') !== (next.direction === 'forward') ? 'centre' : 'lane'
      push(kind, boundaries[i]!.right, markStart?.lanes ?? 0, markEnd?.lanes ?? 0)
    }

    // turn arrows, near the end each lane runs to
    const pieceLength = pieceEnd - pieceStart
    if (pieceLength > ARROW_FROM_END * 2) {
      line.lanes.forEach((lane) => {
        if (!lane.turn || lane.direction === 'both_ways') return
        const forward = lane.direction === 'forward'
        const s = forward ? pieceLength - ARROW_FROM_END : ARROW_FROM_END
        const { point, direction } = pointAlong(sliced, s)
        const middle = (lane.left + lane.right) / 2
        const travel = forward ? direction : scale(direction, -1)
        out.arrows.push({
          wayId: way.id,
          laneId: lane.id,
          loc: frame.toLoc(add(point, scale(rightNormal(direction), middle))),
          bearing: bearingOf(travel),
          turn: lane.turn,
        })
      })
    }
  }
}

/** The street drawing of the given ways: lanes, junctions, lane lines and kerbs, turn arrows */
export function streetGeometry(input: StreetInput): StreetGeometry {
  const out: Out = { lanes: [], lines: [], arrows: [] }
  const junctions: Junctions = {
    trims: new Map(),
    partners: new Map(),
    runs: new Map(),
    marks: new Map(),
    junctions: [],
    cuts: new Set(),
    inner: new Set(),
    boxes: new Map(),
  }
  // one frame for the area, at its first node
  let origin: readonly [number, number] | undefined = input.origin
  if (!origin)
    for (const way of input.ways) {
      for (const id of way.nodes) {
        origin = input.loc(id)
        if (origin) break
      }
      if (origin) break
    }
  if (!origin) return { ...out, junctions: [] }
  const frame = metricFrame(origin)

  // nodes within a centimetre of the node before them on a way are one node: the way drops the second point (a
  // segment without direction), and every other way at it then meets the first
  const same = new Map<string, string>()
  for (const way of input.ways) {
    let previous: { id: string; loc: readonly [number, number] } | undefined
    for (const node of way.nodes) {
      const id = same.get(node) ?? node
      const loc = input.loc(id)
      if (!loc) continue
      if (
        previous &&
        previous.id !== id &&
        len(sub(frame.toMetres(loc), frame.toMetres(previous.loc))) < 0.01
      ) {
        same.set(id, previous.id)
        continue
      }
      previous = { id, loc }
    }
  }
  const lines: WayLine[] = []
  for (const way of input.ways) {
    const line = toWayLine(way, input, frame, same)
    if (line) lines.push(line)
  }
  // the nodes used more than once (by two ways, or twice by one): where roads meet
  const uses = new Map<string, WayLine[]>()
  for (const line of lines) {
    for (const id of line.nodeIds) {
      const list = uses.get(id)
      if (list) list.push(line)
      else uses.set(id, [line])
    }
  }
  const armsOf = new Map<string, Arm[]>()
  /** The nodes the ways are cut at: junctions and forks */
  const cutNodes = new Set<string>()
  for (const [nodeId, users] of uses) {
    if (users.length < 2) continue
    const arms = armsAt(nodeId, [...new Set(users)])
    armsOf.set(nodeId, arms)
    if (arms.length >= 3) cutNodes.add(nodeId)
  }
  const forks = new Map<string, Fork>()
  for (const nodeId of cutNodes) {
    const fork = forkAt(armsOf.get(nodeId)!, cutNodes)
    if (fork) forks.set(nodeId, fork)
  }
  const junctionNodes = new Set([...cutNodes].filter((id) => !forks.has(id)))
  const groups = junctionGroups(lines, junctionNodes, junctions.inner, new Set(forks.keys()))
  const grouped = new Set(groups.flat())
  for (const [nodeId, arms] of armsOf) {
    const fork = forks.get(nodeId)
    if (fork) forkJunction(nodeId, fork, frame, junctions)
    else junctionAt(nodeId, arms, frame, junctions, grouped.has(nodeId))
  }
  for (const group of groups) groupJunction(group, junctionNodes, frame, junctions)
  for (const line of lines) drawWay(line, junctions, frame, out)
  return { ...out, junctions: junctions.junctions }
}
