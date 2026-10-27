import { distance } from '../geo.ts'
import type { IssueCode, LonLat, RouteInput, RouteMember } from '../types.ts'
import { between, moveBy, type Generated, type GeneratedTruth } from './generate.ts'
import { at, type Random } from './random.ts'

// Mutations break a generated route on purpose. Each one returns a new route (the input is never changed) and the
// issue codes the analysis must report for it. Member indexes in the truth follow the mutated members.

export type MutationResult = {
  generated: Generated
  /** Issue codes the analysis must report on the mutated route */
  expect: IssueCode[]
}

export type Mutation = (generated: Generated, random: Random) => MutationResult

type Entry = { member: RouteMember; from: number }

/** Every member with the index it has in the input (`from`) */
function entriesOf(gen: Generated): Entry[] {
  return gen.input.members.map((member, from) => ({ member, from }))
}

/** The main way member indexes, in relation order, when there are at least `min` */
function mainWaysOf(gen: Generated, min: number): number[] {
  if (gen.truth.mainWays.length < min) throw new RangeError(`needs at least ${min} main ways`)
  return gen.truth.mainWays
}

/**
 * A new route from entries. Members come from the entries; truth indexes follow the entries that came from the input
 * (`from` >= 0), so a removed member drops out of the truth and a duplicated one counts twice.
 */
function fromEntries(
  gen: Generated,
  entries: Entry[],
  changes: Partial<RouteInput>,
  expect: IssueCode[],
): MutationResult {
  const newIndexes = new Map<number, number[]>()
  entries.forEach((entry, index) => {
    if (entry.from < 0) return
    const list = newIndexes.get(entry.from)
    if (list) list.push(index)
    else newIndexes.set(entry.from, [index])
  })
  const remap = (indexes: readonly number[]): number[] =>
    indexes.flatMap((i) => newIndexes.get(i) ?? []).sort((a, b) => a - b)
  const truth: GeneratedTruth = {
    mainWays: remap(gen.truth.mainWays),
    guideposts: remap(gen.truth.guideposts),
    stops: remap(gen.truth.stops),
    branches: gen.truth.branches.map((branch) => ({
      role: branch.role,
      indexes: remap(branch.indexes),
    })),
    junctionNodes: gen.truth.junctionNodes,
    lengthMetres: gen.truth.lengthMetres,
  }
  return {
    generated: {
      input: { ...gen.input, ...changes, members: entries.map((entry) => entry.member) },
      truth,
    },
    expect,
  }
}

/** A new route with other ways or nodes, and the members as they are */
function withInput(
  gen: Generated,
  changes: Partial<RouteInput>,
  expect: IssueCode[],
): MutationResult {
  return fromEntries(gen, entriesOf(gen), changes, expect)
}

/** An id with the prefix that neither map holds yet. `counter` is where the search starts and moves on. */
function freshId(
  taken: ReadonlyMap<string, unknown>,
  prefix: string,
  counter: { n: number },
): string {
  while (taken.has(`${prefix}${counter.n}`)) counter.n++
  const id = `${prefix}${counter.n}`
  counter.n++
  return id
}

/** The loaded main node nearest to `p` (a scan of the main line) */
function nearestMainNode(gen: Generated, p: LonLat): LonLat {
  let best = p
  let bestDistance = Number.POSITIVE_INFINITY
  for (const index of gen.truth.mainWays) {
    const member = at(gen.input.members, index)
    for (const id of gen.input.ways.get(member.id) ?? []) {
      const q = gen.input.nodes.get(id)
      if (!q) continue
      const d = distance(p, q)
      if (d < bestDistance) {
        bestDistance = d
        best = q
      }
    }
  }
  return best
}

/** Up to `count` different main way member indexes, picked at random */
function pickMainWays(gen: Generated, random: Random, count: number): number[] {
  const main = mainWaysOf(gen, 1)
  return random.distinct(main.length, Math.min(count, main.length)).map((i) => at(main, i))
}

/**
 * Deletes `k` main way members from the middle of the line: the ways on either side no longer meet. Their ways stay
 * loaded. Expects `gap`.
 */
export function removeWays(k: number): Mutation {
  return (gen, random) => {
    const main = mainWaysOf(gen, k + 2)
    const drop = new Set(random.distinct(main.length - 2, k).map((i) => at(main, i + 1)))
    const entries = entriesOf(gen).filter((entry) => !drop.has(entry.from))
    return fromEntries(gen, entries, {}, ['gap'])
  }
}

/**
 * Moves a block of main way members to another place in the member list. The ways still join into one line, but not
 * in the order the relation lists them. Expects `order`.
 */
export const shuffleBlock: Mutation = (gen, random) => {
  const main = mainWaysOf(gen, 4)
  const size = random.int(1, Math.floor(main.length / 4))
  const start = random.int(0, main.length - size)
  const block = new Set(main.slice(start, start + size))
  const entries = entriesOf(gen)
  const moved = entries.filter((entry) => block.has(entry.from))
  const rest = entries.filter((entry) => !block.has(entry.from))
  const mainSet = new Set(main)
  // positions in `rest` of the main ways that stay; the block goes before one of them, or at the end
  const slots: number[] = []
  rest.forEach((entry, i) => {
    if (mainSet.has(entry.from)) slots.push(i)
  })
  // any slot but the block's own (slot `start` is where it was)
  let slot = random.int(0, slots.length - 1)
  if (slot >= start) slot++
  const insertAt = slot < slots.length ? at(slots, slot) : rest.length
  const reordered = [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)]
  return fromEntries(gen, reordered, {}, ['order'])
}

/** Reverses the node lists of `k` main ways: the drawing direction only. Expects nothing. */
export function reverseWays(k: number): Mutation {
  return (gen, random) => {
    const ways = new Map(gen.input.ways)
    for (const index of pickMainWays(gen, random, k)) {
      const id = at(gen.input.members, index).id
      ways.set(id, [...(ways.get(id) ?? [])].reverse())
    }
    return withInput(gen, { ways }, [])
  }
}

/** Inserts a copy of a main way member right after it. Expects `duplicate`. */
export const duplicateMember: Mutation = (gen, random) => {
  const index = random.pick(mainWaysOf(gen, 1))
  const entries = entriesOf(gen)
  entries.splice(index + 1, 0, { member: { ...at(gen.input.members, index) }, from: index })
  return fromEntries(gen, entries, {}, ['duplicate'])
}

/** Removes `k` main ways from `ways` while their members stay. Expects `not-loaded`. */
export function unload(k: number): Mutation {
  return (gen, random) => {
    const ways = new Map(gen.input.ways)
    for (const index of pickMainWays(gen, random, k)) ways.delete(at(gen.input.members, index).id)
    return withInput(gen, { ways }, ['not-loaded'])
  }
}

/** Gives a main way the role `foo`. Expects `unknown-role`. */
export const unknownRole: Mutation = (gen, random) => {
  const index = random.pick(mainWaysOf(gen, 1))
  const entries = entriesOf(gen).map((entry) =>
    entry.from === index ? { member: { ...entry.member, role: 'foo' }, from: index } : entry,
  )
  return fromEntries(gen, entries, {}, ['unknown-role'])
}

/** Moves one guidepost 200 m away from the line, straight out. Expects `point-far`. */
export const moveGuidepostFar: Mutation = (gen, random) => {
  if (gen.truth.guideposts.length === 0) throw new RangeError('no guidepost to move')
  const member = at(gen.input.members, random.pick(gen.truth.guideposts))
  const pos = gen.input.nodes.get(member.id)
  if (!pos) throw new RangeError(`guidepost ${member.id} is not loaded`)
  const from = between(nearestMainNode(gen, pos), pos)
  const length = Math.hypot(from.east, from.north)
  const east = length > 0 ? from.east / length : 1
  const north = length > 0 ? from.north / length : 0
  const nodes = new Map(gen.input.nodes)
  nodes.set(member.id, moveBy(pos, east * 200, north * 200))
  return withInput(gen, { nodes }, ['point-far'])
}

/** Swaps two stop members in the member list (not their platforms). Bus only. Expects `out-of-sequence`. */
export const swapStops: Mutation = (gen, random) => {
  const stops = gen.truth.stops
  if (stops.length < 2) throw new RangeError('needs at least two stops (a bus route)')
  const a = random.int(0, stops.length - 2)
  const b = random.int(a + 1, stops.length - 1)
  const members = gen.input.members.slice()
  const first = at(members, at(stops, a))
  members[at(stops, a)] = at(members, at(stops, b))
  members[at(stops, b)] = first
  return {
    generated: { input: { ...gen.input, members }, truth: gen.truth },
    expect: ['out-of-sequence'],
  }
}

/**
 * Removes every guidepost member. Expects `no-guideposts` when the route has junctions (a route without junctions has
 * no junction hints to switch off).
 */
export const dropGuideposts: Mutation = (gen) => {
  if (gen.truth.guideposts.length === 0) throw new RangeError('no guidepost to drop')
  const drop = new Set(gen.truth.guideposts)
  const entries = entriesOf(gen).filter((entry) => !drop.has(entry.from))
  return fromEntries(gen, entries, {}, gen.truth.junctionNodes.length > 0 ? ['no-guideposts'] : [])
}

/**
 * Moves one side line 300 m north. Its ways get their own copies of the nodes, so the main line stays where it is.
 * Expects `branch-detached`.
 */
export const detachBranch: Mutation = (gen, random) => {
  if (gen.truth.branches.length === 0) throw new RangeError('no branch to detach')
  const branch = random.pick(gen.truth.branches)
  const ways = new Map(gen.input.ways)
  const nodes = new Map(gen.input.nodes)
  const renamed = new Map<string, string>()
  const counter = { n: nodes.size + 1 }
  for (const index of branch.indexes) {
    const id = at(gen.input.members, index).id
    const list = ways.get(id) ?? []
    ways.set(
      id,
      list.map((old) => {
        const known = renamed.get(old)
        if (known !== undefined) return known
        const pos = nodes.get(old)
        if (!pos) throw new RangeError(`node ${old} is not loaded`)
        const fresh = freshId(nodes, 'n', counter)
        nodes.set(fresh, moveBy(pos, 0, 300))
        renamed.set(old, fresh)
        return fresh
      }),
    )
  }
  return withInput(gen, { ways, nodes }, ['branch-detached'])
}

/** Adds a sub-route (a relation member with the role empty). Expects nothing. */
export const addSubroute: Mutation = (gen) => {
  const entries = entriesOf(gen)
  entries.push({
    member: { type: 'relation', id: `r${gen.input.members.length + 1}`, role: '' },
    from: -1,
  })
  return fromEntries(gen, entries, {}, [])
}

/**
 * Adds a closed way with the role `outer`, 40 m from a main way: an area in the route. Expects `unknown-role`.
 */
export const addAreaMember: Mutation = (gen, random) => {
  const index = random.pick(mainWaysOf(gen, 1))
  const first = gen.input.ways.get(at(gen.input.members, index).id)?.[0]
  const origin = first === undefined ? undefined : gen.input.nodes.get(first)
  if (!origin) throw new RangeError('no position for the area')
  const centre = moveBy(origin, 40, 40)
  const nodes = new Map(gen.input.nodes)
  const ways = new Map(gen.input.ways)
  const counter = { n: nodes.size + 1 }
  const corners: string[] = []
  for (const [east, north] of [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ] as const) {
    const id = freshId(nodes, 'n', counter)
    nodes.set(id, moveBy(centre, east, north))
    corners.push(id)
  }
  const wayId = freshId(ways, 'w', { n: ways.size + 1 })
  ways.set(wayId, [...corners, at(corners, 0)])
  const entries = entriesOf(gen)
  entries.push({ member: { type: 'way', id: wayId, role: 'outer' }, from: -1 })
  return fromEntries(gen, entries, { ways, nodes }, ['unknown-role'])
}

type Candidate = {
  name: string
  applies(gen: Generated): boolean
  make(random: Random): Mutation
}

const CANDIDATES: Candidate[] = [
  {
    name: 'removeWays',
    applies: (g) => g.truth.mainWays.length >= 4,
    make: (r) => removeWays(r.int(1, 2)),
  },
  { name: 'shuffleBlock', applies: (g) => g.truth.mainWays.length >= 4, make: () => shuffleBlock },
  {
    name: 'reverseWays',
    applies: (g) => g.truth.mainWays.length >= 1,
    make: (r) => reverseWays(r.int(1, 3)),
  },
  {
    name: 'duplicateMember',
    applies: (g) => g.truth.mainWays.length >= 1,
    make: () => duplicateMember,
  },
  {
    name: 'unload',
    applies: (g) => g.truth.mainWays.length >= 1,
    make: (r) => unload(r.int(1, 2)),
  },
  { name: 'unknownRole', applies: (g) => g.truth.mainWays.length >= 1, make: () => unknownRole },
  {
    name: 'moveGuidepostFar',
    applies: (g) => g.truth.guideposts.length >= 1,
    make: () => moveGuidepostFar,
  },
  { name: 'swapStops', applies: (g) => g.truth.stops.length >= 2, make: () => swapStops },
  {
    name: 'dropGuideposts',
    applies: (g) => g.truth.guideposts.length >= 1,
    make: () => dropGuideposts,
  },
  { name: 'detachBranch', applies: (g) => g.truth.branches.length >= 1, make: () => detachBranch },
  { name: 'addSubroute', applies: () => true, make: () => addSubroute },
  {
    name: 'addAreaMember',
    applies: (g) => g.truth.mainWays.length >= 1,
    make: () => addAreaMember,
  },
]

/** The result of `randomMutations`: the route, the union of the expected codes, and the names applied in order */
export type RandomMutations = { generated: Generated; expect: IssueCode[]; applied: string[] }

/**
 * Applies `count` random mutations, one after another, each to the result of the one before. Only mutations that
 * apply to the current route are picked. Returns the union of their expected issue codes.
 */
export function randomMutations(
  generated: Generated,
  random: Random,
  count: number,
): RandomMutations {
  let current = generated
  const expect = new Set<IssueCode>()
  const applied: string[] = []
  for (let i = 0; i < count; i++) {
    const candidate = random.pick(CANDIDATES.filter((c) => c.applies(current)))
    const result = candidate.make(random)(current, random)
    current = result.generated
    for (const code of result.expect) expect.add(code)
    applied.push(candidate.name)
  }
  return { generated: current, expect: [...expect], applied }
}
