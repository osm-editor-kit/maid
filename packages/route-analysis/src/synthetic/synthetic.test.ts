import { describe, expect, it } from 'bun:test'
import { distance } from '../geo.ts'
import type { IssueCode, LonLat, RouteMember } from '../types.ts'
import { generateRoute, type Generated, type RouteKind } from './generate.ts'
import {
  addAreaMember,
  addSubroute,
  detachBranch,
  dropGuideposts,
  duplicateMember,
  moveGuidepostFar,
  randomMutations,
  removeWays,
  reverseWays,
  shuffleBlock,
  swapStops,
  unknownRole,
  unload,
  type Mutation,
} from './mutate.ts'
import { at, seededRandom } from './random.ts'

const ISSUE_CODES: IssueCode[] = [
  'gap',
  'order',
  'not-loaded',
  'point-far',
  'out-of-sequence',
  'junction-without-guidepost',
  'no-guideposts',
  'unknown-role',
  'branch-detached',
  'duplicate',
  'empty',
]

/** The whole route as text, to compare two routes or to see that an input was not changed */
function serialise(gen: Generated): string {
  return JSON.stringify({
    members: gen.input.members,
    ways: [...gen.input.ways],
    nodes: [...gen.input.nodes],
    memberTags: [...(gen.input.memberTags ?? [])],
    outsideWays: [...(gen.input.outsideWays ?? [])],
    truth: gen.truth,
  })
}

function memberAt(gen: Generated, index: number): RouteMember {
  return at(gen.input.members, index)
}

function nodesOf(gen: Generated, index: number): readonly string[] {
  return gen.input.ways.get(memberAt(gen, index).id) ?? []
}

function endOf(list: readonly string[]): string {
  return at(list, list.length - 1)
}

function posOf(gen: Generated, id: string): LonLat {
  const p = gen.input.nodes.get(id)
  if (!p) throw new Error(`node ${id} is not loaded`)
  return p
}

/** Length in metres of the ways at these member indexes, each one walked node by node */
function lengthOf(gen: Generated, indexes: readonly number[]): number {
  let total = 0
  for (const index of indexes) {
    const list = nodesOf(gen, index)
    for (let k = 1; k < list.length; k++)
      total += distance(posOf(gen, at(list, k - 1)), posOf(gen, at(list, k)))
  }
  return total
}

/** Every node id of the main line */
function mainNodeIds(gen: Generated): Set<string> {
  const ids = new Set<string>()
  for (const index of gen.truth.mainWays) for (const id of nodesOf(gen, index)) ids.add(id)
  return ids
}

/** The distance in metres from `p` to the nearest node of the main line */
function nearestMainDistance(gen: Generated, p: LonLat): number {
  let best = Number.POSITIVE_INFINITY
  for (const id of mainNodeIds(gen)) best = Math.min(best, distance(p, posOf(gen, id)))
  return best
}

/** Applies a mutation and checks that the input stays as it was and the output differs */
function apply(base: Generated, mutation: Mutation, seed = 5) {
  const before = serialise(base)
  const result = mutation(base, seededRandom(seed))
  expect(serialise(base)).toBe(before)
  expect(serialise(result.generated)).not.toBe(before)
  return result
}

const bicycle = generateRoute({ seed: 11, kind: 'bicycle', ways: 60 })
const bus = generateRoute({ seed: 12, kind: 'bus', ways: 60, stopsEvery: 200 })

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, different ones for another seed', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const c = seededRandom(43)
    const first = Array.from({ length: 100 }, () => a.next())
    expect(Array.from({ length: 100 }, () => b.next())).toEqual(first)
    expect(Array.from({ length: 100 }, () => c.next())).not.toEqual(first)
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('draws whole numbers in range, distinct picks, and chances near their probability', () => {
    const r = seededRandom(7)
    const ints = Array.from({ length: 1000 }, () => r.int(3, 7))
    expect(Math.min(...ints)).toBe(3)
    expect(Math.max(...ints)).toBe(7)
    const picks = r.distinct(10, 4)
    expect(new Set(picks).size).toBe(4)
    expect(picks.every((i) => i >= 0 && i < 10)).toBe(true)
    let hits = 0
    for (let i = 0; i < 20000; i++) if (r.chance(0.3)) hits++
    expect(Math.abs(hits / 20000 - 0.3)).toBeLessThan(0.02)
  })
})

describe('generateRoute', () => {
  const kinds: RouteKind[] = ['hiking', 'bicycle', 'bus']

  it('gives the same route for the same seed and another one for another seed', () => {
    for (const kind of kinds) {
      const options = { seed: 21, kind, ways: 30, stopsEvery: 300 }
      expect(serialise(generateRoute(options))).toBe(serialise(generateRoute(options)))
      expect(serialise(generateRoute({ ...options, seed: 22 }))).not.toBe(
        serialise(generateRoute(options)),
      )
    }
  })

  it('references only loaded ways and nodes', () => {
    for (const kind of kinds) {
      const gen = generateRoute({ seed: 4, kind, ways: 40, stopsEvery: 300 })
      for (const member of gen.input.members) {
        if (member.type === 'way') expect(gen.input.ways.has(member.id)).toBe(true)
        if (member.type === 'node') expect(gen.input.nodes.has(member.id)).toBe(true)
      }
      for (const list of gen.input.ways.values()) {
        for (const id of list) expect(gen.input.nodes.has(id)).toBe(true)
      }
    }
  })

  it('chains the main ways: consecutive ways share an end node, and the ways are a line of the asked size', () => {
    const gen = generateRoute({ seed: 5, kind: 'hiking', ways: 50 })
    expect(gen.truth.mainWays).toHaveLength(50)
    for (let k = 1; k < gen.truth.mainWays.length; k++) {
      const a = nodesOf(gen, at(gen.truth.mainWays, k - 1))
      const b = nodesOf(gen, at(gen.truth.mainWays, k))
      const ends = [at(a, 0), at(a, a.length - 1)]
      const other = [at(b, 0), at(b, b.length - 1)]
      expect(ends.some((id) => other.includes(id))).toBe(true)
    }
    // some ways are drawn backwards: main node ids n<k> run along the line, so a way drawn backwards runs down
    const number = (id: string) => Number(id.slice(1))
    const backwards = gen.truth.mainWays.filter((index) => {
      const list = nodesOf(gen, index)
      return number(at(list, 0)) > number(endOf(list))
    })
    expect(backwards.length).toBeGreaterThan(0)
    expect(backwards.length).toBeLessThan(50)
  })

  it('has a length within 1% of the sum of its segments', () => {
    for (const kind of kinds) {
      const gen = generateRoute({ seed: 6, kind, ways: 80, stopsEvery: 300 })
      const sum = lengthOf(gen, gen.truth.mainWays)
      expect(Math.abs(gen.truth.lengthMetres - sum) / sum).toBeLessThan(0.01)
    }
  })

  it('places guideposts 2 to 8 m beside the line, with the guidepost tags', () => {
    expect(bicycle.truth.guideposts.length).toBeGreaterThan(0)
    for (const index of bicycle.truth.guideposts) {
      const member = memberAt(bicycle, index)
      expect(member.role).toBe('guidepost')
      expect(bicycle.input.memberTags?.get(member.id)).toEqual({
        tourism: 'information',
        information: 'guidepost',
      })
      const offset = nearestMainDistance(bicycle, posOf(bicycle, member.id))
      expect(offset).toBeGreaterThan(1.9)
      expect(offset).toBeLessThan(8.1)
    }
  })

  it('gives junctions 1 or 2 outside ways, and leaves about a fifth of them without a guidepost nearby', () => {
    const gen = generateRoute({ seed: 8, kind: 'hiking', ways: 200 })
    const junctions = gen.truth.junctionNodes
    expect(junctions.length).toBeGreaterThan(40)
    expect(gen.input.outsideWays?.size).toBe(junctions.length)
    for (const id of junctions) expect([1, 2]).toContain(gen.input.outsideWays?.get(id) ?? 0)
    const posts = gen.truth.guideposts.map((index) => posOf(gen, memberAt(gen, index).id))
    const withPost = junctions.filter((id) =>
      posts.some((p) => distance(p, posOf(gen, id)) < 50),
    ).length
    const share = withPost / junctions.length
    expect(share).toBeGreaterThan(0.6)
    expect(share).toBeLessThan(0.95)
  })

  it('lists the side lines: an excursion back to its own node, an alternative about 500 m on', () => {
    const gen = generateRoute({ seed: 9, kind: 'bicycle', ways: 120 })
    const onLine = mainNodeIds(gen)
    expect(gen.truth.branches.map((b) => b.role)).toEqual(['excursion', 'alternative'])
    const [excursion, alternative] = gen.truth.branches
    if (!excursion || !alternative) throw new Error('two branches expected')
    const exFirst = at(nodesOf(gen, at(excursion.indexes, 0)), 0)
    const exLast = endOf(nodesOf(gen, at(excursion.indexes, excursion.indexes.length - 1)))
    expect(excursion.indexes.length).toBeGreaterThanOrEqual(2)
    expect(excursion.indexes.length).toBeLessThanOrEqual(4)
    expect(onLine.has(exFirst)).toBe(true)
    expect(exLast).toBe(exFirst)
    const alFirst = at(nodesOf(gen, at(alternative.indexes, 0)), 0)
    const alLast = endOf(nodesOf(gen, at(alternative.indexes, alternative.indexes.length - 1)))
    expect(alFirst).not.toBe(alLast)
    const chord = distance(posOf(gen, alFirst), posOf(gen, alLast))
    expect(chord).toBeGreaterThan(350)
    expect(chord).toBeLessThan(700)
  })

  it('lists no side lines or guideposts for a bus route, and puts stops and platforms first in PTv2 order', () => {
    expect(bus.truth.branches).toEqual([])
    expect(bus.truth.guideposts).toEqual([])
    expect(bus.input.tags).toMatchObject({
      type: 'route',
      route: 'bus',
      'public_transport:version': '2',
    })
    const onLine = mainNodeIds(bus)
    const stopCount = bus.truth.stops.length
    expect(stopCount).toBeGreaterThan(3)
    expect(bus.truth.mainWays[0]).toBe(stopCount * 2)
    let last = 0
    for (let k = 0; k < stopCount; k++) {
      const stop = memberAt(bus, k * 2)
      const platform = memberAt(bus, k * 2 + 1)
      expect(stop).toMatchObject({ type: 'node', role: 'stop' })
      expect(platform).toMatchObject({ type: 'way', role: 'platform' })
      expect(onLine.has(stop.id)).toBe(true)
      expect(nodesOf(bus, k * 2 + 1)).toHaveLength(2)
      // stop ids are main line nodes (n<number>), numbered in travel order
      const number = Number(stop.id.slice(1))
      expect(number).toBeGreaterThan(last)
      last = number
    }
  })

  it('has stops about every stopsEvery metres on a bus route', () => {
    const gen = generateRoute({ seed: 13, kind: 'bus', ways: 100, stopsEvery: 400 })
    expect(gen.truth.stops.length).toBe(Math.floor(gen.truth.lengthMetres / 400) + 1)
  })

  it('generates a 20,000-way route in under a second', () => {
    const start = performance.now()
    const gen = generateRoute({ seed: 1, kind: 'hiking', ways: 20000 })
    const ms = performance.now() - start
    console.log(
      `generateRoute 20000 ways: ${ms.toFixed(0)} ms, ${gen.input.nodes.size} nodes, ${gen.truth.guideposts.length} guideposts`,
    )
    expect(gen.truth.mainWays).toHaveLength(20000)
    expect(ms).toBeLessThan(1000)
  })
})

describe('mutations', () => {
  it('removeWays drops members in the middle and gaps the line', () => {
    const res = apply(bicycle, removeWays(2))
    expect(res.expect).toEqual(['gap'])
    expect(res.generated.input.members.length).toBe(bicycle.input.members.length - 2)
    expect(res.generated.truth.mainWays).toHaveLength(bicycle.truth.mainWays.length - 2)
    const mainIds = (gen: Generated) => gen.truth.mainWays.map((i) => memberAt(gen, i).id)
    expect(mainIds(res.generated)[0]).toBe(mainIds(bicycle)[0])
    expect(endOf(mainIds(res.generated))).toBe(endOf(mainIds(bicycle)))
    const short = generateRoute({ seed: 1, kind: 'hiking', ways: 3 })
    expect(() => removeWays(2)(short, seededRandom(1))).toThrow('needs at least 4 main ways')
  })

  it('shuffleBlock moves main ways to another place, keeping the same set', () => {
    const res = apply(bicycle, shuffleBlock)
    expect(res.expect).toEqual(['order'])
    const ids = (gen: Generated) => gen.truth.mainWays.map((i) => memberAt(gen, i).id)
    expect(ids(res.generated)).not.toEqual(ids(bicycle))
    expect([...ids(res.generated)].sort()).toEqual([...ids(bicycle)].sort())
    expect(res.generated.input.members.length).toBe(bicycle.input.members.length)
  })

  it('reverseWays reverses the drawing direction of k ways and expects no issue', () => {
    const res = apply(bicycle, reverseWays(3))
    expect(res.expect).toEqual([])
    expect(JSON.stringify(res.generated.input.members)).toBe(JSON.stringify(bicycle.input.members))
    let changed = 0
    for (const [id, list] of bicycle.input.ways) {
      if (JSON.stringify(res.generated.input.ways.get(id)) !== JSON.stringify(list)) changed++
    }
    expect(changed).toBe(3)
  })

  it('duplicateMember puts a copy of a main way right after it', () => {
    const res = apply(bicycle, duplicateMember)
    expect(res.expect).toEqual(['duplicate'])
    const members = res.generated.input.members
    expect(members.length).toBe(bicycle.input.members.length + 1)
    const twin = members.findIndex((m, i) => i > 0 && m.id === members[i - 1]?.id && m.role === '')
    expect(twin).toBeGreaterThan(0)
  })

  it('unload removes ways from the map and keeps their members', () => {
    const res = apply(bicycle, unload(2))
    expect(res.expect).toEqual(['not-loaded'])
    expect(res.generated.input.members.length).toBe(bicycle.input.members.length)
    expect(res.generated.input.ways.size).toBe(bicycle.input.ways.size - 2)
    const missing = res.generated.input.members.filter(
      (m) => m.type === 'way' && !res.generated.input.ways.has(m.id),
    )
    expect(missing).toHaveLength(2)
  })

  it('unknownRole gives one main way the role foo', () => {
    const res = apply(bicycle, unknownRole)
    expect(res.expect).toEqual(['unknown-role'])
    const foo = res.generated.input.members.filter((m) => m.role === 'foo')
    expect(foo).toHaveLength(1)
    expect(foo[0]?.type).toBe('way')
  })

  it('moveGuidepostFar moves one guidepost about 200 m from where it was', () => {
    const res = apply(bicycle, moveGuidepostFar)
    expect(res.expect).toEqual(['point-far'])
    const moved: string[] = []
    for (const [id, p] of bicycle.input.nodes) {
      const q = res.generated.input.nodes.get(id)
      if (q && (q[0] !== p[0] || q[1] !== p[1])) moved.push(id)
    }
    expect(moved).toHaveLength(1)
    const id = at(moved, 0)
    const metres = distance(posOf(bicycle, id), posOf(res.generated, id))
    expect(metres).toBeGreaterThan(195)
    expect(metres).toBeLessThan(205)
    expect(nearestMainDistance(res.generated, posOf(res.generated, id))).toBeGreaterThan(150)
  })

  it('swapStops swaps two stops in the member list of a bus route', () => {
    const res = apply(bus, swapStops)
    expect(res.expect).toEqual(['out-of-sequence'])
    const sig = (gen: Generated) => gen.input.members.map((m) => `${m.type}:${m.id}:${m.role}`)
    expect(sig(res.generated)).not.toEqual(sig(bus))
    expect([...sig(res.generated)].sort()).toEqual([...sig(bus)].sort())
  })

  it('dropGuideposts removes every guidepost member and expects no-guideposts (the route has junctions)', () => {
    expect(bicycle.truth.junctionNodes.length).toBeGreaterThan(0)
    const res = apply(bicycle, dropGuideposts)
    expect(res.expect).toEqual(['no-guideposts'])
    expect(res.generated.input.members.some((m) => m.role === 'guidepost')).toBe(false)
    expect(res.generated.truth.guideposts).toEqual([])
    expect(res.generated.input.members.length).toBe(
      bicycle.input.members.length - bicycle.truth.guideposts.length,
    )
  })

  it('detachBranch moves a side line 300 m away, on its own nodes, leaving the main line alone', () => {
    const res = apply(bicycle, detachBranch)
    expect(res.expect).toEqual(['branch-detached'])
    const onLine = mainNodeIds(bicycle)
    const touching = (gen: Generated) =>
      gen.truth.branches.map((b) =>
        b.indexes.some((i) => nodesOf(gen, i).some((id) => onLine.has(id))),
      )
    const before = touching(bicycle)
    const after = touching(res.generated)
    expect(before.every(Boolean)).toBe(true)
    expect(after.filter((t) => !t).length).toBe(1)
    expect(res.generated.input.nodes.size).toBeGreaterThan(bicycle.input.nodes.size)
    // the main line's nodes did not move
    for (const id of onLine)
      expect(res.generated.input.nodes.get(id)).toEqual(bicycle.input.nodes.get(id))
    const detached = at(
      res.generated.truth.branches.filter((_, k) => !after[k]),
      0,
    )
    const far = nearestMainDistance(
      res.generated,
      posOf(res.generated, at(nodesOf(res.generated, at(detached.indexes, 0)), 0)),
    )
    expect(far).toBeGreaterThan(250)
  })

  it('addSubroute adds a relation member with the empty role and expects no issue', () => {
    const res = apply(bicycle, addSubroute)
    expect(res.expect).toEqual([])
    const last = at(res.generated.input.members, res.generated.input.members.length - 1)
    expect(last).toMatchObject({ type: 'relation', role: '' })
  })

  it('addAreaMember adds a closed way with the role outer and expects unknown-role', () => {
    const res = apply(bicycle, addAreaMember)
    expect(res.expect).toEqual(['unknown-role'])
    const last = at(res.generated.input.members, res.generated.input.members.length - 1)
    expect(last).toMatchObject({ type: 'way', role: 'outer' })
    const ring = res.generated.input.ways.get(last.id) ?? []
    expect(ring.length).toBe(5)
    expect(at(ring, 0)).toBe(at(ring, 4))
  })

  it('randomMutations applies the count, returns known codes, and is repeatable', () => {
    const first = randomMutations(bicycle, seededRandom(9), 6)
    const second = randomMutations(bicycle, seededRandom(9), 6)
    expect(first.applied).toHaveLength(6)
    expect(serialise(first.generated)).toBe(serialise(second.generated))
    expect(first.expect).toEqual(second.expect)
    for (const code of first.expect) expect(ISSUE_CODES).toContain(code)
    expect(serialise(bicycle)).toBe(
      serialise(generateRoute({ seed: 11, kind: 'bicycle', ways: 60 })),
    )
  })
})
