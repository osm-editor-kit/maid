import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  analyzeRoute,
  layoutOverview,
  type LonLat,
  type RouteInput,
} from '../../packages/route-analysis/src/index.ts'
import {
  generateRoute,
  type RouteKind,
} from '../../packages/route-analysis/src/synthetic/generate.ts'
/**
 * Route analysis benchmark: the analysis and the overview layout (packages/route-analysis) on generated routes of
 * 100 to 20,000 ways, and on every route relation of the fixtures (members outside a fixture count as not loaded).
 *
 *   bun run bench-route-analysis [--runs 5]
 *
 * Generated routes need no download (core rule 1). Prints one line per case and writes
 * reports/route-analysis-bench.json with the median and the slowest run in milliseconds.
 */

const ROOT = resolve(import.meta.dir, '../..')
const runsArg = process.argv.indexOf('--runs')
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 5
const SIZES = [100, 1000, 5000, 20000]
const KINDS: RouteKind[] = ['hiking', 'bicycle', 'bus']
const FIXTURES = ['relations', 'dense', 'medium', 'small']

type Case = {
  name: string
  ways: number
  members: number
  analyseMs: { median: number; max: number }
  layoutMs: { median: number; max: number }
  issues: number
  linear: string
}

function time(fn: () => void) {
  const times: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return { median: round(times[Math.floor(times.length / 2)] ?? 0), max: round(times.at(-1) ?? 0) }
}

function round(ms: number) {
  return Math.round(ms * 100) / 100
}

function measure(name: string, input: RouteInput): Case {
  // one warm-up run, so that the first case does not carry the JIT
  analyzeRoute(input)
  const analysis = analyzeRoute(input)
  const analyseMs = time(() => analyzeRoute(input))
  const layoutMs = time(() => {
    layoutOverview(analysis, 'schematic')
    layoutOverview(analysis, 'scaled')
  })
  return {
    name,
    ways: input.ways.size,
    members: input.members.length,
    analyseMs,
    layoutMs,
    issues: analysis.issues.length,
    linear: analysis.chain.linear,
  }
}

type Element = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
  members?: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[]
}

function fixtureRoutes(fixture: string): { name: string; input: RouteInput }[] {
  const raw = JSON.parse(
    gunzipSync(readFileSync(join(ROOT, 'fixtures', `${fixture}.json.gz`))).toString(),
  )
  const elements: Element[] = raw.elements ?? raw
  const nodes = new Map<string, LonLat>()
  const ways = new Map<string, readonly string[]>()
  const tags = new Map<string, Readonly<Record<string, string>>>()
  const parents = new Map<string, number>()
  for (const e of elements) {
    if (e.type === 'node' && e.lon !== undefined && e.lat !== undefined)
      nodes.set(`n${e.id}`, [e.lon, e.lat])
    if (e.type === 'way' && e.nodes) {
      ways.set(
        `w${e.id}`,
        e.nodes.map((id) => `n${id}`),
      )
      for (const id of e.nodes) parents.set(`n${id}`, (parents.get(`n${id}`) ?? 0) + 1)
    }
    if (e.tags) tags.set(`${e.type[0]}${e.id}`, e.tags)
  }
  return elements
    .filter((e) => e.type === 'relation' && e.tags?.type === 'route')
    .map((relation) => {
      const members = (relation.members ?? []).map((m) => ({
        type: m.type,
        id: `${m.type[0]}${m.ref}`,
        role: m.role,
      }))
      const memberIds = new Set(members.map((m) => m.id))
      const own = new Map<string, readonly string[]>()
      const outsideWays = new Map<string, number>()
      for (const m of members) {
        const list = ways.get(m.id)
        if (m.type !== 'way' || !list) continue
        own.set(m.id, list)
      }
      // ways of the relation that use each node; the rest of the node's ways are outside
      const inside = new Map<string, number>()
      for (const list of own.values())
        for (const id of new Set(list)) inside.set(id, (inside.get(id) ?? 0) + 1)
      for (const [id, count] of inside)
        outsideWays.set(id, Math.max(0, (parents.get(id) ?? 0) - count))
      const memberTags = new Map(
        [...memberIds].flatMap((id) => (tags.has(id) ? [[id, tags.get(id)!] as const] : [])),
      )
      return {
        name: `${fixture} r${relation.id} ${relation.tags?.route} ${relation.tags?.name ?? ''}`.trim(),
        input: { tags: relation.tags ?? {}, members, ways: own, nodes, memberTags, outsideWays },
      }
    })
}

const cases: Case[] = []
for (const kind of KINDS) {
  for (const size of SIZES) {
    const { input } = generateRoute({ seed: size, kind, ways: size })
    const result = measure(`generated ${kind} ${size}`, input)
    cases.push(result)
    console.log(
      `${result.name.padEnd(28)} analyse ${result.analyseMs.median} ms (max ${result.analyseMs.max}), layout ${result.layoutMs.median} ms, ${result.issues} issues, ${result.linear}`,
    )
  }
}
const fixtureCases: Case[] = []
for (const fixture of FIXTURES) {
  for (const { name, input } of fixtureRoutes(fixture)) fixtureCases.push(measure(name, input))
}
fixtureCases.sort((a, b) => b.analyseMs.median - a.analyseMs.median)
for (const c of fixtureCases.slice(0, 5))
  console.log(
    `${c.name.slice(0, 60).padEnd(60)} analyse ${c.analyseMs.median} ms, ${c.ways}/${c.members} ways/members`,
  )
console.log(
  `${fixtureCases.length} fixture routes, slowest ${fixtureCases[0]?.analyseMs.median ?? 0} ms`,
)

mkdirSync(join(ROOT, 'reports'), { recursive: true })
const out = join(ROOT, 'reports', 'route-analysis-bench.json')
writeFileSync(
  out,
  `${JSON.stringify({ runs: RUNS, date: new Date().toISOString(), generated: cases, fixtures: fixtureCases }, null, 2)}\n`,
)
console.log(`wrote ${out}`)
