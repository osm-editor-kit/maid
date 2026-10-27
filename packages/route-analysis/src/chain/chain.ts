import { distance } from '../geo.ts'
import type { Chain, ChainStep, Gap, LonLat, MemberInfo, Piece, RouteInput } from '../types.ts'

// Joins the main ways of a route into pieces (runs of ways that meet end to end), then tries to put all pieces into
// one line. Reads node ids from the ways and positions from `input.nodes`; a missing position counts as zero metres.

/** A main way, ready for the walk */
type Way = {
  /** Member index in the relation */
  index: number
  id: string
  role: string
  /** The node ids, without the repeated last node of a closed way */
  ring: readonly string[]
  closed: boolean
  /** The first and last node as drawn (the same node for a closed way) */
  first: string
  last: string
  /** Closed ways only: the ring nodes, for joins at any node */
  set: ReadonlySet<string> | undefined
  /** Metres of the segment from `ring[i]` to the next node; the last one closes the ring */
  segs: Float64Array
  /** Metres of the whole way */
  total: number
}

/** A step before its `at` is known */
type Draft = Omit<ChainStep, 'at'>

/** A run of steps that join end to end, under construction */
type Run = {
  steps: Draft[]
  parallel: number[]
  /** The `from` and `to` nodes of every step, built when a one-way strand first needs them */
  nodes: Set<string> | undefined
  start: string
  end: string
}

/** A run put in travel order: `flip` is true when the run is traversed against its steps */
type Oriented = { run: Run; flip: boolean }

/** Metres between two positions; 0 when either has no position */
function metres(a: LonLat | undefined, b: LonLat | undefined): number {
  return a && b ? distance(a, b) : 0
}

/** Metres between two nodes; 0 when either has no position */
function between(positions: ReadonlyMap<string, LonLat>, a: string, b: string): number {
  return metres(positions.get(a), positions.get(b))
}

/** The way ready for the walk, or undefined when it has no nodes */
function makeWay(input: RouteInput, index: number, id: string, role: string): Way | undefined {
  const nodes = input.ways.get(id)
  const first = nodes?.[0]
  const last = nodes?.at(-1)
  if (!nodes || first === undefined || last === undefined) return undefined
  const closed = nodes.length >= 2 && first === last
  const ring = closed ? nodes.slice(0, -1) : nodes
  const m = ring.length
  // one position lookup per node: each node is in two segments
  const points = ring.map((node) => input.nodes.get(node))
  const segs = new Float64Array(closed ? m : Math.max(0, m - 1))
  let total = 0
  for (let i = 0; i < segs.length; i++) {
    const d = metres(points[i], points[(i + 1) % m])
    segs[i] = d
    total += d
  }
  return {
    index,
    id,
    role,
    ring,
    closed,
    first,
    last,
    set: closed ? new Set(ring) : undefined,
    segs,
    total,
  }
}

/** The main ways of the relation in relation order, without a way listed twice in a row */
function mainWays(input: RouteInput, members: readonly MemberInfo[]): Way[] {
  const ways: Way[] = []
  for (const info of members) {
    if (info.kind !== 'main' || info.member.type !== 'way') continue
    // the same way as the member before: another part of the analysis reports it
    const before = input.members[info.index - 1]
    if (before?.type === 'way' && before.id === info.member.id) continue
    const way = makeWay(input, info.index, info.member.id, info.member.role.trim())
    if (way) ways.push(way)
  }
  return ways
}

/** True when the way can be entered at `node`: any node of a closed way, an end of an open one */
function canEnter(way: Way, node: string): boolean {
  return way.set ? way.set.has(node) : node === way.first || node === way.last
}

/** The node where the exit of `a` meets `b`, or undefined when they do not touch */
function joinNode(a: Way, b: Way): string | undefined {
  if (!a.closed) {
    if (canEnter(b, a.last)) return a.last
    return canEnter(b, a.first) ? a.first : undefined
  }
  if (!b.closed) {
    if (canEnter(a, b.first)) return b.first
    return canEnter(a, b.last) ? b.last : undefined
  }
  return a.ring.find((node) => canEnter(b, node))
}

/** Metres of a closed way from ring index `from` forward to `to`; the same index is the whole way */
function forwardMetres(way: Way, from: number, to: number): number {
  if (from === to) return way.total
  const m = way.ring.length
  let sum = 0
  for (let k = from; k !== to; k = (k + 1) % m) sum += way.segs[k] ?? 0
  return sum
}

/** The step of a closed way: it runs in drawing direction from its entry to its exit, a whole loop when both are the same node */
function closedStep(way: Way, entry: string | undefined, next: Way | undefined): Draft {
  const exit = next ? joinNode(way, next) : undefined
  const from = entry ?? exit ?? way.first
  const to = exit ?? from
  // a closed way alone keeps its drawing direction unless its role is backward
  const reversed = entry === undefined && exit === undefined && way.role === 'backward'
  const i = way.ring.indexOf(from)
  const j = way.ring.indexOf(to)
  let length = way.total
  if (i >= 0 && j >= 0) length = reversed ? forwardMetres(way, j, i) : forwardMetres(way, i, j)
  return { index: way.index, wayId: way.id, reversed, from, to, length }
}

/** Where an open way that starts a run is entered: at the end not shared with the next way; by role when none is shared */
function openStart(way: Way, next: Way | undefined): string {
  const shared = next ? joinNode(way, next) : undefined
  if (shared !== undefined) return shared === way.first ? way.last : way.first
  return way.role === 'backward' ? way.last : way.first
}

/** The step of a way in travel order. `entry` is the node it is entered at (undefined when it starts a run), `next` the way after it */
function stepOf(way: Way, entry: string | undefined, next: Way | undefined): Draft {
  if (way.closed) return closedStep(way, entry, next)
  const from = entry ?? openStart(way, next)
  const to = from === way.first ? way.last : way.first
  return {
    index: way.index,
    wayId: way.id,
    reversed: from !== way.first,
    from,
    to,
    length: way.total,
  }
}

function isOneWay(way: Way): boolean {
  return way.role === 'forward' || way.role === 'backward'
}

/** True when a one-way way shares a node with the run */
function touches(run: Run, way: Way): boolean {
  if (!run.nodes) {
    run.nodes = new Set()
    for (const step of run.steps) {
      run.nodes.add(step.from)
      run.nodes.add(step.to)
    }
  }
  const nodes = run.nodes
  if (way.closed) return way.ring.some((node) => nodes.has(node))
  return nodes.has(way.first) || nodes.has(way.last)
}

function startRun(step: Draft): Run {
  return { steps: [step], parallel: [], nodes: undefined, start: step.from, end: step.to }
}

function extendRun(run: Run, step: Draft): void {
  run.steps.push(step)
  run.nodes?.add(step.from)
  run.nodes?.add(step.to)
  run.end = step.to
}

/**
 * The runs of the walk in relation order. A way that continues the run joins it; a one-way way that does not, but
 * touches the run, is the other strand of the run; anything else starts a new run.
 */
function buildRuns(ways: readonly Way[]): Run[] {
  const runs: Run[] = []
  let current: Run | undefined
  for (let k = 0; k < ways.length; k++) {
    const way = ways[k]
    if (!way) continue
    const next = ways[k + 1]
    if (current && canEnter(way, current.end)) {
      extendRun(current, stepOf(way, current.end, next))
    } else if (current && isOneWay(way) && touches(current, way)) {
      current.parallel.push(way.index)
    } else {
      current = startRun(stepOf(way, undefined, next))
      runs.push(current)
    }
  }
  return runs
}

/** Runs by end node (ascending run index) and the number of nodes where an odd number of run ends meet */
function endIndex(runs: readonly Run[]): { adj: Map<string, number[]>; odd: number } {
  const adj = new Map<string, number[]>()
  const degree = new Map<string, number>()
  runs.forEach((run, i) => {
    for (const node of [run.start, run.end]) {
      const list = adj.get(node)
      if (list) list.push(i)
      else adj.set(node, [i])
      degree.set(node, (degree.get(node) ?? 0) + 1)
    }
  })
  let odd = 0
  for (const count of degree.values()) if (count % 2 === 1) odd++
  return { adj, odd }
}

/** True when every run is reachable from the first one through shared end nodes */
function isConnected(runs: readonly Run[], adj: ReadonlyMap<string, readonly number[]>): boolean {
  const seen = new Uint8Array(runs.length)
  const stack = [0]
  seen[0] = 1
  let count = 1
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const run = runs[i]
    if (!run) continue
    for (const node of [run.start, run.end]) {
      for (const j of adj.get(node) ?? []) {
        if (seen[j] === 0) {
          seen[j] = 1
          count++
          stack.push(j)
        }
      }
    }
  }
  return count === runs.length
}

/**
 * One order of the runs that joins them end to end, starting with run `first` (reversed when `reverse`). Each next run
 * is the lowest unused one that starts or ends at the current end. Undefined when the walk gets stuck.
 */
function chainFrom(
  runs: readonly Run[],
  adj: ReadonlyMap<string, readonly number[]>,
  first: number,
  reverse: boolean,
): Oriented[] | undefined {
  const start = runs[first]
  if (!start) return undefined
  const used = new Uint8Array(runs.length)
  const cursor = new Map<string, number>()
  const order: Oriented[] = [{ run: start, flip: reverse }]
  used[first] = 1
  let end = reverse ? start.start : start.end
  while (order.length < runs.length) {
    const list = adj.get(end)
    if (!list) return undefined
    // the cursor skips runs that are already used; it only moves forward
    let c = cursor.get(end) ?? 0
    let j = list[c]
    while (j !== undefined && used[j] === 1) {
      c++
      j = list[c]
    }
    cursor.set(end, c)
    if (j === undefined) return undefined
    const run = runs[j]
    if (!run) return undefined
    used[j] = 1
    const forward = run.start === end
    order.push({ run, flip: !forward })
    end = forward ? run.end : run.start
  }
  return order
}

/** A run traversed the other way: steps reversed in order, each step from and to swapped */
function reverseRun(run: Run): Run {
  return {
    ...run,
    steps: run.steps
      .map((step) => ({ ...step, from: step.to, to: step.from, reversed: !step.reversed }))
      .reverse(),
    start: run.end,
    end: run.start,
  }
}

/** The runs in one line in some order, or undefined. Runs that cannot form a line are refused before the walk. */
function joinAll(runs: readonly Run[]): Run[] | undefined {
  const { adj, odd } = endIndex(runs)
  // a line through all runs has at most two nodes where an odd number of run ends meet
  if (odd > 2 || !isConnected(runs, adj)) return undefined
  for (let s = 0; s < runs.length; s++) {
    for (const reverse of [false, true]) {
      const order = chainFrom(runs, adj, s, reverse)
      if (order) {
        return order.map(({ run, flip }) => (flip ? reverseRun(run) : run))
      }
    }
  }
  return undefined
}

/** Adds the metres from the start of the line to each step and each piece. Gaps add nothing. */
function toPieces(runs: readonly Pick<Run, 'steps' | 'parallel'>[]): Piece[] {
  let at = 0
  return runs.map((run) => {
    const steps: ChainStep[] = []
    let length = 0
    for (const step of run.steps) {
      steps.push({ ...step, at: at + length })
      length += step.length
    }
    const piece: Piece = { steps, at, length, parallel: [...run.parallel] }
    at += length
    return piece
  })
}

/** The breaks between consecutive pieces, in relation order */
function gapsOf(input: RouteInput, pieces: readonly Piece[]): Gap[] {
  const gaps: Gap[] = []
  for (let i = 0; i + 1 < pieces.length; i++) {
    const before = pieces[i]
    const after = pieces[i + 1]
    const last = before?.steps.at(-1)
    const first = after?.steps[0]
    if (!before || !after || !last || !first) continue
    gaps.push({
      after: i,
      from: last.to,
      to: first.from,
      distance: between(input.nodes, last.to, first.from),
      at: before.at + before.length,
    })
  }
  return gaps
}

/**
 * The line the main ways make. `members` comes from `classifyMembers(input)`. `linear` is `yes` when the main ways
 * join in relation order, `sorted` when they join in another order (the pieces are then one piece in that order),
 * `no` when gaps remain (pieces in relation order, with `gaps`), `empty` when no main way is loaded.
 */
export function buildChain(input: RouteInput, members: readonly MemberInfo[]): Chain {
  const runs = buildRuns(mainWays(input, members))
  if (runs.length === 0)
    return { pieces: [], linear: 'empty', gaps: [], length: 0, sortedOrder: [] }
  if (runs.length === 1) {
    const pieces = toPieces(runs)
    return { pieces, linear: 'yes', gaps: [], length: sumLength(pieces), sortedOrder: [] }
  }
  const ordered = joinAll(runs)
  if (ordered) {
    const merged = {
      steps: ordered.flatMap((run) => run.steps),
      parallel: ordered.flatMap((run) => run.parallel),
    }
    const pieces = toPieces([merged])
    return {
      pieces,
      linear: 'sorted',
      gaps: [],
      length: sumLength(pieces),
      sortedOrder: merged.steps.map((step) => step.index),
    }
  }
  const pieces = toPieces(runs)
  return {
    pieces,
    linear: 'no',
    gaps: gapsOf(input, pieces),
    length: sumLength(pieces),
    sortedOrder: [],
  }
}

function sumLength(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, piece) => sum + piece.length, 0)
}
