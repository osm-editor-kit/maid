import { distance } from '../geo.ts'
import type { LonLat, RouteInput, RouteMember } from '../types.ts'
import { at, seededRandom, type Random } from './random.ts'

// A synthetic route for performance measurements and fuzz tests: no data is downloaded, the same seed gives the same
// relation. The geometry is a local flat approximation, which is good for the few hundred kilometres a route spans.

const EARTH_RADIUS_M = 6371008.8
const RAD = Math.PI / 180
const METRES_PER_DEG_LAT = EARTH_RADIUS_M * RAD
const START: LonLat = [13.57, 52.44]

export type RouteKind = 'hiking' | 'bicycle' | 'bus'

export type GenerateOptions = {
  seed: number
  kind: RouteKind
  /** Main ways */
  ways: number
  /** Nodes per way, both ends included, ends shared with the next way (default 8) */
  nodesPerWay?: number
  /**
   * Guideposts per kilometre along the line (default 1 for hiking and bicycle, 0 for bus). Hiking and bicycle also get
   * one guidepost beside each junction that is not one of the bare ones; 0 means no guideposts at all.
   */
  guideposts?: number
  /** Side lines: alternating excursions and alternatives (default 2 for hiking and bicycle, 0 for bus) */
  branches?: number
  /** Bus only: metres between stops (default 400) */
  stopsEvery?: number
  /** Junctions with ways that are not members, per kilometre (default 3) */
  junctionsPerKm?: number
}

export type BranchTruth = { role: string; indexes: number[] }

/** What the generator put in, as member indexes. After a mutation the indexes follow the mutated members. */
export type GeneratedTruth = {
  mainWays: number[]
  guideposts: number[]
  branches: BranchTruth[]
  stops: number[]
  junctionNodes: string[]
  /** Length of the base line in metres, before any mutation */
  lengthMetres: number
}

export type Generated = { input: RouteInput; truth: GeneratedTruth }

/** The position `east` and `north` metres away from `p` */
export function moveBy(p: LonLat, east: number, north: number): LonLat {
  return [
    p[0] + east / (METRES_PER_DEG_LAT * Math.cos(p[1] * RAD)),
    p[1] + north / METRES_PER_DEG_LAT,
  ]
}

/** Metres east and north from `a` to `b` */
export function between(a: LonLat, b: LonLat): { east: number; north: number } {
  return {
    east: (b[0] - a[0]) * METRES_PER_DEG_LAT * Math.cos(a[1] * RAD),
    north: (b[1] - a[1]) * METRES_PER_DEG_LAT,
  }
}

type Line = {
  ids: string[]
  pos: LonLat[]
  /** Direction of travel at each node, in radians from east towards north */
  heading: Float64Array
  /** Metres from the start to each node */
  cum: Float64Array
}

type Builder = {
  random: Random
  line: Line
  perWay: number
  mainCount: number
  nodes: Map<string, LonLat>
  ways: Map<string, readonly string[]>
  newNode(p: LonLat): string
  newWayId(): string
}

/** The main line: a slowly turning walk of 15 to 30 m steps, one node per position */
function buildLine(random: Random, count: number, nodes: Map<string, LonLat>): Line {
  const ids: string[] = []
  const pos: LonLat[] = []
  const heading = new Float64Array(count)
  const cum = new Float64Array(count)
  let p: LonLat = START
  let direction = random.next() * 2 * Math.PI
  let turn = 0
  let total = 0
  for (let i = 0; i < count; i++) {
    const id = `n${i + 1}`
    ids.push(id)
    pos.push(p)
    nodes.set(id, p)
    heading[i] = direction
    if (i === count - 1) break
    turn = turn * 0.9 + (random.next() - 0.5) * 0.02
    direction += turn
    const step = 15 + random.next() * 15
    const next = moveBy(p, step * Math.cos(direction), step * Math.sin(direction))
    total += distance(p, next)
    cum[i + 1] = total
    p = next
  }
  return { ids, pos, heading, cum }
}

/** Ways that run along a list of nodes, `perWay` nodes each, the ends shared */
function chainWays(b: Builder, ring: readonly string[], role: string): RouteMember[] {
  const members: RouteMember[] = []
  const step = b.perWay - 1
  for (let first = 0; first < ring.length - 1; first += step) {
    const id = b.newWayId()
    b.ways.set(id, ring.slice(first, first + b.perWay))
    members.push({ type: 'way', id, role })
  }
  return members
}

/** An excursion: a loop of 2 to 4 ways that leaves the line at one node and returns to that same node */
function excursion(b: Builder): RouteMember[] {
  const { random, line, perWay } = b
  const wayCount = random.int(2, 4)
  const steps = wayCount * (perWay - 1)
  const index = random.int(0, b.mainCount - 1)
  const origin = at(line.ids, index)
  const originPos = at(line.pos, index)
  const side = random.chance(0.5) ? 1 : -1
  const radius = 30 + random.next() * 50
  const alpha = at(line.heading, index) + (side * Math.PI) / 2
  const ring = [origin]
  for (let t = 1; t < steps; t++) {
    const theta = alpha + Math.PI + (2 * Math.PI * t) / steps
    const east = radius * (Math.cos(alpha) + Math.cos(theta))
    const north = radius * (Math.sin(alpha) + Math.sin(theta))
    ring.push(b.newNode(moveBy(originPos, east, north)))
  }
  ring.push(origin)
  return chainWays(b, ring, 'excursion')
}

/** An alternative: leaves the line at one node and rejoins about 500 m further on, bulging to one side */
function alternative(b: Builder): RouteMember[] {
  const { random, line, perWay } = b
  const wayCount = random.int(2, 4)
  const steps = wayCount * (perWay - 1)
  const from = random.int(0, Math.max(0, b.mainCount - 2))
  let to = from
  while (to < b.mainCount - 1 && at(line.cum, to) - at(line.cum, from) < 500) to++
  const a = at(line.pos, from)
  const z = at(line.pos, to)
  const chord = between(a, z)
  const chordLength = Math.hypot(chord.east, chord.north) || 1
  const normalEast = -chord.north / chordLength
  const normalNorth = chord.east / chordLength
  const bulge = (15 + random.next() * 20) * (random.chance(0.5) ? 1 : -1)
  const ring = [at(line.ids, from)]
  for (let s = 1; s < steps; s++) {
    const t = s / steps
    const f = from + t * (to - from)
    const lo = Math.floor(f)
    const u = f - lo
    const p0 = at(line.pos, lo)
    const p1 = at(line.pos, Math.min(lo + 1, to))
    const base: LonLat = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u]
    const off = bulge * Math.sin(Math.PI * t)
    ring.push(b.newNode(moveBy(base, normalEast * off, normalNorth * off)))
  }
  ring.push(at(line.ids, to))
  return chainWays(b, ring, 'alternative')
}

/**
 * A synthetic route relation. Member order: hiking and bicycle: main ways, branch ways, guideposts; bus: stop and
 * platform pairs in travel order, then the main ways (PTv2). Deterministic: the same options give the same output.
 */
export function generateRoute(options: GenerateOptions): Generated {
  const wayCount = options.ways
  if (!Number.isInteger(wayCount) || wayCount < 1)
    throw new RangeError('ways must be a whole number from 1')
  const perWay = options.nodesPerWay ?? 8
  if (!Number.isInteger(perWay) || perWay < 2)
    throw new RangeError('nodesPerWay must be a whole number from 2')
  const isBus = options.kind === 'bus'
  const random = seededRandom(options.seed)
  const nodes = new Map<string, LonLat>()
  const ways = new Map<string, readonly string[]>()
  const memberTags = new Map<string, Readonly<Record<string, string>>>()
  const outsideWays = new Map<string, number>()

  // Main nodes come first: n1 .. n<mainCount>. Ways: w1 .. w<wayCount> are the main ways.
  const mainCount = wayCount * (perWay - 1) + 1
  const line = buildLine(random, mainCount, nodes)
  const lengthMetres = at(line.cum, mainCount - 1)
  const km = lengthMetres / 1000

  let wayNo = 0
  let nodeNo = mainCount
  const b: Builder = {
    random,
    line,
    perWay,
    mainCount,
    nodes,
    ways,
    newNode(p) {
      nodeNo++
      const id = `n${nodeNo}`
      nodes.set(id, p)
      return id
    },
    newWayId() {
      wayNo++
      return `w${wayNo}`
    },
  }

  const mainMembers: RouteMember[] = []
  for (let k = 0; k < wayCount; k++) {
    const first = k * (perWay - 1)
    const list = line.ids.slice(first, first + perWay)
    if (random.chance(0.25)) list.reverse()
    const id = b.newWayId()
    ways.set(id, list)
    mainMembers.push({ type: 'way', id, role: '' })
  }

  // Junctions: ways that are not members meet the line here. About a fifth get no guidepost nearby.
  const junctionCount = Math.round((options.junctionsPerKm ?? 3) * km)
  const junctionIndexes = random
    .distinct(Math.max(0, mainCount - 2), junctionCount)
    .map((i) => i + 1)
    .sort((x, y) => x - y)
  const avoid = new Uint8Array(mainCount)
  const withPost: number[] = []
  const junctionNodes: string[] = []
  for (const j of junctionIndexes) {
    const id = at(line.ids, j)
    junctionNodes.push(id)
    outsideWays.set(id, random.int(1, 2))
    if (random.chance(0.2)) {
      for (let i = Math.max(0, j - 6); i <= Math.min(mainCount - 1, j + 6); i++) avoid[i] = 1
    } else {
      withPost.push(j)
    }
  }

  // Guideposts: 2 to 8 m beside the line. One at each junction that has one (so most guideposts are at junctions),
  // then the per-kilometre ones along the line, kept away from the bare junctions.
  const guidepostTags = { tourism: 'information', information: 'guidepost' }
  const guidepostDensity = options.guideposts ?? (isBus ? 0 : 1)
  const guidePlaces: number[] = guidepostDensity > 0 ? [...withPost] : []
  const alongCount = Math.round(guidepostDensity * km)
  for (let g = 0; g < alongCount; g++) {
    let i = random.int(0, mainCount - 1)
    for (let tries = 0; tries < 30 && avoid[i] === 1; tries++) i = random.int(0, mainCount - 1)
    guidePlaces.push(i)
  }
  const guideMembers: RouteMember[] = []
  for (const i of guidePlaces) {
    const side = random.chance(0.5) ? 1 : -1
    const d = 2 + random.next() * 6
    const h = at(line.heading, i)
    // the right-hand side of the direction of travel
    const pos = moveBy(at(line.pos, i), side * d * Math.sin(h), -side * d * Math.cos(h))
    const id = b.newNode(pos)
    memberTags.set(id, guidepostTags)
    guideMembers.push({ type: 'node', id, role: 'guidepost' })
  }

  // Bus stops on the line, each with a platform way 5 m to the right
  const stops: RouteMember[] = []
  const platforms: RouteMember[] = []
  if (isBus) {
    const every = options.stopsEvery ?? 400
    if (!(every > 0)) throw new RangeError('stopsEvery must be above 0')
    let i = 0
    let n = 0
    for (let d = 0; d <= lengthMetres; d += every, n++) {
      while (i < mainCount - 1 && at(line.cum, i) < d) i++
      const stopId = at(line.ids, i)
      const p = at(line.pos, i)
      // right = (sin h, -cos h), along = (cos h, sin h): 5 m right, 4 m back and forth along the line
      const h = at(line.heading, i)
      const sinH = Math.sin(h)
      const cosH = Math.cos(h)
      const a = moveBy(p, 5 * sinH - 4 * cosH, -5 * cosH - 4 * sinH)
      const z = moveBy(p, 5 * sinH + 4 * cosH, -5 * cosH + 4 * sinH)
      const platformId = b.newWayId()
      ways.set(platformId, [b.newNode(a), b.newNode(z)])
      memberTags.set(stopId, {
        public_transport: 'stop_position',
        bus: 'yes',
        name: `Stop ${n + 1}`,
      })
      memberTags.set(platformId, { public_transport: 'platform', name: `Stop ${n + 1}` })
      stops.push({ type: 'node', id: stopId, role: 'stop' })
      platforms.push({ type: 'way', id: platformId, role: 'platform' })
    }
  }

  // Side lines: excursions and alternatives alternate
  const branchCount = options.branches ?? (isBus ? 0 : 2)
  const branchParts: { role: string; members: RouteMember[] }[] = []
  for (let k = 0; k < branchCount; k++) {
    const role = k % 2 === 0 ? 'excursion' : 'alternative'
    const members = role === 'excursion' ? excursion(b) : alternative(b)
    branchParts.push({ role, members })
  }

  // Member list in the order the contract asks for
  const members: RouteMember[] = []
  const stopIndexes: number[] = []
  for (let k = 0; k < stops.length; k++) {
    stopIndexes.push(members.length)
    members.push(at(stops, k))
    members.push(at(platforms, k))
  }
  const mainIndexes = mainMembers.map((m) => members.push(m) - 1)
  const branches: { role: string; indexes: number[] }[] = []
  for (const part of branchParts) {
    branches.push({ role: part.role, indexes: part.members.map((m) => members.push(m) - 1) })
  }
  const guideIndexes = guideMembers.map((m) => members.push(m) - 1)

  const tags: Record<string, string> = {
    type: 'route',
    route: options.kind,
    name: `Synthetic ${options.kind} ${options.seed}`,
  }
  if (isBus) tags['public_transport:version'] = '2'

  return {
    input: { tags, members, ways, nodes, memberTags, outsideWays },
    truth: {
      mainWays: mainIndexes,
      guideposts: guideIndexes,
      branches,
      stops: stopIndexes,
      junctionNodes,
      lengthMetres,
    },
  }
}
