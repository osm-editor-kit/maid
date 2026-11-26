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
 * - **Pieces.** Each way is cut at its junction nodes; each piece is offset per lane with mitre joins (`vec.ts`).
 *
 * Left out for now (Lane Studio has them): forks and dual carriageways splitting, roundabout flares, turning heads,
 * guide lines through junctions, connectivity relations, carriageway areas, painted islands.
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
  cross,
  cumulative,
  dot,
  len,
  metricFrame,
  offsetPolyline,
  pointAlong,
  polylineLength,
  rightNormal,
  scale,
  slicePolyline,
  smooth,
  sub,
  unit,
  type MetricFrame,
  type Vec2,
} from './vec'

/** A side road is pulled back at most this far from the node */
const MAX_CLEARANCE = 30
/** Length over which a road runs on out of the other's lanes */
const RUN_LENGTH = 25
/** A run takes at most this share of its piece */
const RUN_SHARE = 0.45
/** Edges closer than this count as the same */
const SAME_EDGE = 0.05
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
}

/** Lane lines and kerbs stop this far from the node (main road through a junction) */
type Marks = { left: number; right: number; lanes: number }

const armKey = (wayId: string, index: number, alongWay: boolean) => `${wayId}:${index}:${alongWay}`

function toWayLine(way: StreetWay, input: StreetInput, frame: MetricFrame): WayLine | undefined {
  if (way.lanes.length === 0) return undefined
  const points: Vec2[] = []
  const nodeIds: string[] = []
  for (const id of way.nodes) {
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

function projectOnto(points: readonly Vec2[], p: Vec2): number {
  let best = { distance: Infinity, s: 0 }
  let s = 0
  for (let i = 1; i < points.length; i++) {
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
): [number | undefined, number | undefined][] {
  const bigger = own.length >= other.length ? own : other
  const inner = innerFirst ? bigger[0] : bigger[bigger.length - 1]
  const turnLane = own.length !== other.length && onlyTurnsLeft(inner)
  const fromStart = innerFirst !== turnLane
  const n = Math.max(own.length, other.length)
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

/**
 * The run of `own` out of `other` at one node: `other`'s lanes are already in `own`'s way orientation. Lanes are
 * grouped by direction (backward, both ways, forward, as they lie left to right on a road where traffic keeps right)
 * and paired within a group from the middle of the road outwards.
 */
function runOf(own: readonly StreetLane[], other: readonly StreetLane[]): Run | undefined {
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
    const pairs = pairGroup(mine, theirs, innerFirst)
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

type Junctions = {
  trims: Map<string, number>
  partners: Map<string, Vec2>
  runs: Map<string, Run>
  marks: Map<string, Marks>
  junctions: StreetJunction[]
  /** Nodes the ways are cut at */
  cuts: Set<string>
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

function junctionAt(nodeId: string, arms: Arm[], frame: MetricFrame, result: Junctions) {
  if (arms.length === 2) {
    partnerUp(arms[0]!, arms[1]!, result)
    return
  }
  if (arms.length < 3) return
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

  type End = { left: Vec2; right: Vec2; leftDirection: Vec2; rightDirection: Vec2 }
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
  // the main road's end of the box reaches along it to the corners of the side roads next to it
  if (through) {
    for (const i of through) {
      const arm = arms[i]!
      const length = polylineLength(arm.points)
      const next = (i + 1) % arms.length
      const previous = (i - 1 + arms.length) % arms.length
      const reach = { left: 0, right: 0 }
      if (!onMain(next)) {
        reach.left = Math.min(MAX_CLEARANCE, length, projectOnto(arm.points, ends[next]!.right))
        ends[i]!.left = edgeAt(arm, reach.left, 'left')
        ends[i]!.leftDirection = directionAt(arm, reach.left)
      }
      if (!onMain(previous)) {
        reach.right = Math.min(MAX_CLEARANCE, length, projectOnto(arm.points, ends[previous]!.left))
        ends[i]!.right = edgeAt(arm, reach.right, 'right')
        ends[i]!.rightDirection = directionAt(arm, reach.right)
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
      if (!onMain(i) || !onMain(j) || i === j) return
      const end = ends[i]!
      const next = ends[j]!
      const node = arm.points[0]!
      const atNode = (p: Vec2) =>
        len(sub(p, node)) < Math.max(Math.abs(arm.left), Math.abs(arm.right)) * 2 + 1
      if (!atNode(end.left) || !atNode(next.right)) return
      const meet = lineMeeting(end.left, arm.first, next.right, arms[j]!.first)
      if (meet && len(sub(meet, node)) < 50) {
        end.left = meet
        next.right = meet
      }
    })
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
  // (corners that meet in one point leave repeated points)
  const outline = points.filter((p, i) => len(sub(p, points[(i + 1) % points.length]!)) > 0.05)
  result.junctions.push({
    nodeId,
    ring: outline.map((p) => frame.toLoc(p)),
    kerbs: kerbs.map((kerb) => kerb.map((p) => frame.toLoc(p))),
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
    let trimStart = junctions.trims.get(startKey) ?? 0
    let trimEnd = junctions.trims.get(endKey) ?? 0
    if (trimStart + trimEnd > length * 0.9) {
      const k = (length * 0.9) / (trimStart + trimEnd)
      trimStart *= k
      trimEnd *= k
    }
    const runStart = trimStart < 0.01 ? junctions.runs.get(startKey) : undefined
    const runEnd = trimEnd < 0.01 ? junctions.runs.get(endKey) : undefined
    const runLength = Math.min(RUN_LENGTH, length * RUN_SHARE)
    const centre = points.slice(a, b + 1)
    // vertices every 2 m along a run, so its edges ease smoothly
    const breaks: number[] = []
    for (const [run, from] of [
      [runStart, 0],
      [runEnd, length - runLength],
    ] as const) {
      if (!run) continue
      for (let s = 0; s <= runLength; s += 2) breaks.push(from + s)
    }
    const sliced = slicePolyline(centre, trimStart, length - trimEnd, breaks)
    const local = cumulative(sliced).map((s) => s + trimStart)
    const pieceStart = trimStart
    const pieceEnd = length - trimEnd
    const partnerIn = trimStart < 0.01 ? junctions.partners.get(startKey) : undefined
    const partnerOut = trimEnd < 0.01 ? junctions.partners.get(endKey) : undefined
    const ends = { into: partnerIn ? scale(partnerIn, -1) : undefined, outOf: partnerOut }
    const offset = (distances: number[]) => offsetPolyline(sliced, distances, ends)

    // run weights at each vertex: 1 at the node, 0 a run's length on
    const wStart = local.map((s) => (runStart ? smooth(1 - s / runLength) : 0))
    const wEnd = local.map((s) => (runEnd ? smooth(1 - (length - s) / runLength) : 0))
    const edgeOf = (laneIndex: number, side: 0 | 1, i: number) => {
      const lane = line.lanes[laneIndex]!
      const own = side === 0 ? lane.left : lane.right
      let value = own
      const ts = runStart?.targets[laneIndex]
      const te = runEnd?.targets[laneIndex]
      if (ts) value += (ts[side] - own) * wStart[i]!
      if (te) value += (te[side] - own) * wEnd[i]!
      return value
    }

    const boundaries = line.lanes.map((_, laneIndex) => ({
      left: offset(local.map((_, i) => edgeOf(laneIndex, 0, i))),
      right: offset(local.map((_, i) => edgeOf(laneIndex, 1, i))),
    }))
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
        const leftD = local.map(
          (_, i) => taper.collapse + (taper.target[0] - taper.collapse) * weights[i]!,
        )
        const rightD = local.map(
          (_, i) => taper.collapse + (taper.target[1] - taper.collapse) * weights[i]!,
        )
        out.lanes.push({
          wayId: way.id,
          laneId: `${taper.lane.id}#taper`,
          kind: taper.lane.kind,
          direction: taper.lane.direction,
          ring: ring(offset(leftD).slice(from, to), offset(rightD).slice(from, to), frame),
          taper: true,
        })
      }
    }

    // lane lines and kerbs, stopped where a junction's marks say (the main road through a junction)
    const markStart = trimStart < 0.01 ? junctions.marks.get(startKey) : undefined
    const markEnd = trimEnd < 0.01 ? junctions.marks.get(endKey) : undefined
    const keep = (from: number, to: number) =>
      local.map((s) => s >= pieceStart + from - 1e-6 && s <= pieceEnd - to + 1e-6)
    const push = (kind: StreetLineKind, edge: Vec2[], keepMask: boolean[]) => {
      // split into runs of kept vertices
      let current: Vec2[] = []
      edge.forEach((point, i) => {
        if (keepMask[i]) current.push(point)
        else {
          if (current.length >= 2)
            out.lines.push({ wayId: way.id, kind, line: current.map((q) => frame.toLoc(q)) })
          current = []
        }
      })
      if (current.length >= 2)
        out.lines.push({ wayId: way.id, kind, line: current.map((q) => frame.toLoc(q)) })
    }
    const first = boundaries[0]
    const last = boundaries[boundaries.length - 1]
    if (first) push('kerb', first.left, keep(markStart?.left ?? 0, markEnd?.left ?? 0))
    if (last) push('kerb', last.right, keep(markStart?.right ?? 0, markEnd?.right ?? 0))
    for (let i = 0; i + 1 < line.lanes.length; i++) {
      const lane = line.lanes[i]!
      const next = line.lanes[i + 1]!
      if (Math.abs(lane.right - next.left) > SAME_EDGE) continue
      const kind: StreetLineKind =
        (lane.direction === 'forward') !== (next.direction === 'forward') ? 'centre' : 'lane'
      push(kind, boundaries[i]!.right, keep(markStart?.lanes ?? 0, markEnd?.lanes ?? 0))
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

  const lines: WayLine[] = []
  for (const way of input.ways) {
    const line = toWayLine(way, input, frame)
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
  for (const [nodeId, users] of uses) {
    if (users.length < 2) continue
    const distinct = [...new Set(users)]
    junctionAt(nodeId, armsAt(nodeId, distinct), frame, junctions)
  }
  for (const line of lines) drawWay(line, junctions, frame, out)
  return { ...out, junctions: junctions.junctions }
}
