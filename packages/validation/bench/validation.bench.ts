// Benchmark of the headless validation on the dense fixture (Neukölln, about 140k elements).
// Run: bun packages/validation/bench/validation.bench.ts
// Writes reports/validation-bench.json and prints the same numbers as a table.
//
// What it measures, each as the median of several runs after a warm-up:
// - every rule alone over every entity (the worst case: "validate everything"), and all rules together;
// - one edit at a time, as the app does it: a change to a way from the empty validator state, with the
//   way list the app builds for `waysNear` when a way changed;
// - bursts of 50 edits one after another on the same validator (cumulative, as a series of commits);
// - a profile of the 40 edits: where the time goes per rule, and how often rules ask for neighbours.
// Issue digests (a hash of the sorted issue ids) are written too, so a change in what is reported shows.
//
// Plain script, no dependency beyond the workspace. To run it from the root, add to package.json:
//   "bench-validation": "bun packages/validation/bench/validation.bench.ts"

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  Difference,
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  actionChangeTags,
  actionMoveNode,
  entitiesFromOsmJson,
} from '@osm-editor-kit/maid-model'
import type { Action, OsmEntity, OsmJsonElement } from '@osm-editor-kit/maid-model'
import { boxesOverlap } from '../src/geo.ts'
import type { Box } from '../src/geo.ts'
import { createValidator, defaultRules } from '../src/index.ts'
import type { GraphChange, Issue, Rule, RuleContext, Validator } from '../src/index.ts'
import { entitiesToValidate } from '../src/validator.ts'
import { boxOfWay } from '../src/way-index.ts'

const ROOT = resolve(import.meta.dir, '../../..')
const RUNS = Number(process.env.RUNS ?? 5)
const FRAME_MS = 16
const CHUNK_MS = 50
const OUT = resolve(ROOT, 'reports/validation-bench.json')

// ---------------------------------------------------------------- helpers

function now() {
  return performance.now()
}

function median(values: readonly number[]) {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

type Stats = { median: number; min: number; max: number; runs: number[] }

function statsOf(samples: readonly number[]) {
  return {
    median: round(median(samples)),
    min: round(Math.min(...samples)),
    max: round(Math.max(...samples)),
    runs: samples.map((s) => round(s)),
  }
}

/** The issue ids of a run as one short hash: the same issues give the same digest */
function digestOf(issues: readonly Issue[]) {
  const ids = issues.map((issue) => issue.id).sort()
  return createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 16)
}

/** Every current entity of a graph: the base ones not overridden locally, then the local ones */
function entitiesOf(graph: Graph) {
  const out: OsmEntity[] = []
  for (const [id, entity] of graph.base.entities)
    if (!graph.local.entities.has(id) && entity) out.push(entity)
  for (const entity of graph.local.entities.values()) if (entity) out.push(entity)
  return out
}

/** The way list the app builds (packages/shell/src/modules/validation.tsx, `waysOf`) */
function waysOf(graph: Graph) {
  return entitiesOf(graph).filter((entity): entity is OsmWay => entity instanceof OsmWay)
}

/** A deterministic pick of `n` items: a small linear congruential generator, so runs agree */
function pick<T>(items: readonly T[], n: number, seed: number) {
  const pool = [...items]
  const out: T[] = []
  let state = seed
  while (out.length < n && pool.length > 0) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    out.push(pool.splice(state % pool.length, 1)[0]!)
  }
  return out
}

/** How many other ways overlap each way's box, from a grid (for choosing the busy ways) */
function neighbourCounts(ways: readonly OsmWay[], graph: Graph) {
  const CELL = 0.002
  const boxes = new Map<string, Box>()
  const cells = new Map<string, OsmWay[]>()
  for (const way of ways) {
    const box = boxOfWay(way, graph)
    if (!box) continue
    boxes.set(way.id, box)
    for (let x = Math.floor(box.minLon / CELL); x <= Math.floor(box.maxLon / CELL); x++)
      for (let y = Math.floor(box.minLat / CELL); y <= Math.floor(box.maxLat / CELL); y++) {
        const key = `${x},${y}`
        const list = cells.get(key)
        if (list) list.push(way)
        else cells.set(key, [way])
      }
  }
  const counts = new Map<string, number>()
  for (const way of ways) {
    const box = boxes.get(way.id)
    if (!box) continue
    const seen = new Set<string>()
    let count = 0
    for (let x = Math.floor(box.minLon / CELL); x <= Math.floor(box.maxLon / CELL); x++)
      for (let y = Math.floor(box.minLat / CELL); y <= Math.floor(box.maxLat / CELL); y++)
        for (const other of cells.get(`${x},${y}`) ?? []) {
          if (other.id === way.id || seen.has(other.id)) continue
          seen.add(other.id)
          const otherBox = boxes.get(other.id)
          if (otherBox && boxesOverlap(box, otherBox)) count++
        }
    counts.set(way.id, count)
  }
  return counts
}

// ---------------------------------------------------------------- load

const loadStart = now()
const fixture = JSON.parse(
  gunzipSync(readFileSync(resolve(ROOT, 'fixtures/dense.json.gz'))).toString(),
) as { elements: OsmJsonElement[] }
const context = new ModelContext()
const entities = entitiesFromOsmJson(context, fixture.elements)
const base = new Graph(context, entities)
const loadMs = now() - loadStart

const allEntities = entitiesOf(base)
const allIds = allEntities.map((entity) => entity.id)
const counts = { node: 0, way: 0, relation: 0 }
for (const entity of allEntities) {
  if (entity instanceof OsmNode) counts.node++
  else if (entity instanceof OsmWay) counts.way++
  else if (entity instanceof OsmRelation) counts.relation++
}
const baseWays = waysOf(base)

console.log(
  `loaded ${allIds.length} entities (${counts.node} nodes, ${counts.way} ways, ${counts.relation} relations) in ${round(loadMs, 0)} ms`,
)

// ---------------------------------------------------------------- per rule, and all rules

type RuleRow = {
  rule: string
  label: string
  ms: Stats
  issues: number
  digest: string
  /** rule calls that threw (the validator swallows them: they must be 0) */
  throws: number
}

function timed(runs: number, body: () => Validator) {
  let validator = body() // warm-up
  const samples: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = now()
    validator = body()
    samples.push(now() - start)
  }
  return { stats: statsOf(samples), validator }
}

console.log(`\nper rule, over all ${allIds.length} entities (median of ${RUNS} runs)`)
const ruleRows: RuleRow[] = []
for (const rule of defaultRules) {
  // the validator swallows a throwing rule; this wrapper counts the throws, otherwise the same
  let throws = 0
  const counted: Rule = {
    ...rule,
    validate(entity, ctx) {
      try {
        return rule.validate(entity, ctx)
      } catch {
        throws++
        return []
      }
    },
  }
  const { stats, validator } = timed(RUNS, () => {
    const v = createValidator([counted])
    v.validate(base, allIds, baseWays)
    return v
  })
  const issues = validator.issues()
  const row: RuleRow = {
    rule: rule.id,
    label: rule.label,
    ms: stats,
    issues: issues.length,
    digest: digestOf(issues),
    throws: throws / (RUNS + 1),
  }
  ruleRows.push(row)
  console.log(
    `  ${rule.id.padEnd(20)} ${String(row.ms.median).padStart(9)} ms  issues ${String(row.issues).padStart(6)}  throws ${row.throws}`,
  )
}

const overhead = timed(RUNS, () => {
  const v = createValidator([])
  v.validate(base, allIds, baseWays)
  return v
})
console.log(
  `  ${'(no rules: context only)'.padEnd(20)} ${String(round(overhead.stats.median)).padStart(9)} ms`,
)

const everything = timed(RUNS, () => {
  const v = createValidator(defaultRules)
  v.validate(base, allIds, baseWays)
  return v
})
const everythingIssues = everything.validator.issues()
const everythingDigest = digestOf(everythingIssues)
console.log(
  `  ${'all rules'.padEnd(20)} ${String(everything.stats.median).padStart(9)} ms  issues ${everythingIssues.length}  digest ${everythingDigest}`,
)
const perEntityUs = (everything.stats.median * 1000) / allIds.length
console.log(
  `  all rules per entity: ${round(perEntityUs, 2)} us; entities per ${FRAME_MS} ms: ${Math.floor((FRAME_MS * 1000) / perEntityUs)}, per ${CHUNK_MS} ms: ${Math.floor((CHUNK_MS * 1000) / perEntityUs)}`,
)

// ---------------------------------------------------------------- choose the ways of the edits

console.log('\nchoosing ways')
const counted = neighbourCounts(baseWays, base)
const roads = baseWays.filter((way) => way.tags.highway !== undefined && !way.tags.area)
const buildings = baseWays.filter((way) => way.tags.building !== undefined)
// the ways a rule looks at: only these ask for neighbours
const features = roads.concat(buildings)
const featureNeighbours = [...features].sort(
  (a, b) => (counted.get(b.id) ?? 0) - (counted.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1),
)
const longest = baseWays.reduce((best, way) => (way.nodes.length > best.nodes.length ? way : best))

const chosen = new Map<string, { way: OsmWay; kind: string }>()
const choose = (ways: readonly OsmWay[], n: number, seed: number, kind: string) => {
  let left = n
  for (const way of pick(ways, ways.length, seed)) {
    if (left === 0) break
    if (chosen.has(way.id)) continue
    chosen.set(way.id, { way, kind })
    left--
  }
}
choose(roads, 6, 1, 'road')
choose(buildings, 4, 2, 'building')
chosen.set(longest.id, { way: longest, kind: 'long' })
choose(featureNeighbours.slice(0, 40), 3, 3, 'busy')
choose(features, 6, 4, 'other')
const editWays = [...chosen.values()]
const kindCounts = editWays.reduce<Record<string, number>>((acc, { kind }) => {
  acc[kind] = (acc[kind] ?? 0) + 1
  return acc
}, {})
console.log(
  `  ${editWays.length} ways: ${Object.entries(kindCounts)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(
      ', ',
    )}; busiest feature has ${counted.get(featureNeighbours[0]!.id)} neighbours, ${editWays.map((e) => counted.get(e.way.id) ?? 0).reduce((a, b) => a + b, 0) / editWays.length} on average`,
)

// ---------------------------------------------------------------- edits

type Edit = {
  label: string
  kind: 'move' | 'tag'
  wayId: string
  action: Action
}

/** Moves the middle node of a way by about 3 m, and sets a tag of the way */
function editsFor(way: OsmWay, index: number) {
  const edits: Edit[] = []
  const middle = way.nodes[Math.floor(way.nodes.length / 2)]
  const node = middle ? base.hasEntity(middle) : undefined
  if (node instanceof OsmNode && node.loc) {
    const loc: [number, number] = [node.loc[0] + 0.00004, node.loc[1] + 0.00003]
    edits.push({
      label: `move ${way.id}`,
      kind: 'move',
      wayId: way.id,
      action: actionMoveNode(node.id, loc),
    })
  }
  edits.push({
    label: `tag ${way.id}`,
    kind: 'tag',
    wayId: way.id,
    action: actionChangeTags(way.id, { ...way.tags, description: `bench ${index}` }),
  })
  return edits
}

const edits: Edit[] = editWays.flatMap(({ way }, index) => editsFor(way, index))
/** The head graph after each edit, built outside the timer: the editor does this part */
const heads = edits.map((edit) => edit.action(new Graph(base)))

/** The way list the app passes: all ways, rebuilt when a way changed (a move keeps the list) */
function waysFor(edit: Edit, head: Graph) {
  return edit.kind === 'tag' ? waysOf(head) : baseWays
}

/**
 * What the app does after a commit: the difference from the base (the session), the step (the difference
 * from the graph of the previous commit, `prev`), then the validator. Both differences are part of the
 * timed work, as the history makes them in the app.
 */
function commit(validator: Validator, prev: Graph, head: Graph, ways: readonly OsmWay[]) {
  const change: GraphChange = { base, head, changes: new Difference(base, head).changes }
  validator.update(change, ways, new Difference(prev, head).changes)
  return change
}

/** A validator that has made the boxes of all ways: the app does this at the first edit after loading */
function warmValidator(rules: readonly Rule[] = defaultRules) {
  const validator = createValidator(rules)
  commit(validator, base, new Graph(base), baseWays)
  return validator
}

type EditResult = {
  label: string
  kind: string
  ms: number
  waysMs: number
  checked: number
  issueDigest: string
  issues: number
}

const profile = new Map<string, { ms: number; calls: number }>()
let neighbourCalls = 0
let neighbourCandidates = 0
/** segment pairs that crossing_ways may test: segments of the way times segments of each neighbour (an upper bound) */
let crossingPairs = 0
let crossingPairsAll = 0
let crossingPairsPerEdit = 0

// the first edit after loading: no boxes yet, so the validator makes them all (once per session)
const firstEditSamples: number[] = []
for (let pass = 0; pass < RUNS; pass++) {
  const validator = createValidator(defaultRules)
  const start = now()
  commit(validator, base, heads[0]!, waysFor(edits[0]!, heads[0]!))
  firstEditSamples.push(now() - start)
}
const firstEdit = statsOf(firstEditSamples)
console.log(
  `\nthe first edit after loading (makes every box): median ${firstEdit.median} ms, worst ${firstEdit.max} ms`,
)

// steady state: the validator has its boxes, and each edit is one commit on it. Pass 0 is a warm-up.
const passes: EditResult[][] = []
const editSamples: number[][] = edits.map(() => [])
const waysSamples: number[][] = edits.map(() => [])
for (let pass = 0; pass <= RUNS; pass++) {
  const validator = warmValidator()
  const results: EditResult[] = []
  // the graph the validator has seen last: each edit starts from it
  let prev = base
  for (const [index, edit] of edits.entries()) {
    const head = heads[index]!
    const start = now()
    let waysMs = 0
    let ways: readonly OsmWay[] = baseWays
    if (edit.kind === 'tag') {
      const t = now()
      ways = waysOf(head)
      waysMs = now() - t
    }
    commit(validator, prev, head, ways)
    prev = head
    const ms = now() - start
    const issues = validator.issues()
    results.push({
      label: edit.label,
      kind: edit.kind,
      ms,
      waysMs,
      checked: entitiesToValidate(new Difference(base, head).changes, base, head).size,
      issueDigest: digestOf(issues),
      issues: issues.length,
    })
  }
  if (pass > 0) {
    passes.push(results)
    results.forEach((r, i) => {
      editSamples[i]!.push(r.ms)
      waysSamples[i]!.push(r.waysMs)
    })
  }
}
const editResults: EditResult[] = edits.map((edit, i) => ({
  label: edit.label,
  kind: edit.kind,
  ms: round(median(editSamples[i]!), 3),
  waysMs: round(median(waysSamples[i]!), 3),
  checked: passes[0]![i]!.checked,
  issueDigest: passes[0]![i]!.issueDigest,
  issues: passes[0]![i]!.issues,
}))

function summary(list: EditResult[]) {
  const ms = list.map((r) => r.ms)
  return {
    count: list.length,
    median: round(median(ms), 3),
    worst: round(Math.max(...ms), 3),
    overFrame: ms.filter((m) => m > FRAME_MS).length,
    overChunk: ms.filter((m) => m > CHUNK_MS).length,
    checkedMedian: median(list.map((r) => r.checked)),
    checkedMax: Math.max(...list.map((r) => r.checked)),
  }
}

const editSummary = {
  all: summary(editResults),
  move: summary(editResults.filter((r) => r.kind === 'move')),
  tag: summary(editResults.filter((r) => r.kind === 'tag')),
}
console.log(
  `one edit, steady state (median of ${RUNS} passes per edit; ${editResults.length} edits)`,
)
for (const [name, s] of Object.entries(editSummary))
  console.log(
    `  ${name.padEnd(6)} n=${s.count}  median ${s.median} ms  worst ${s.worst} ms  over ${FRAME_MS} ms: ${s.overFrame}  over ${CHUNK_MS} ms: ${s.overChunk}  entities checked: median ${s.checkedMedian}, max ${s.checkedMax}`,
  )
const tagWaysMs = editResults.filter((r) => r.kind === 'tag').map((r) => r.waysMs)
console.log(
  `  way list for a tag edit: median ${round(median(tagWaysMs), 2)} ms (built inside the timer)`,
)

// ---------------------------------------------------------------- bursts

/** A series of commits on one warm validator, each validated as the app validates it */
function burst(label: string, steps: { head: Graph; ways: readonly OsmWay[] }[]) {
  const validator = warmValidator()
  const samples: number[] = []
  let checkedLast = 0
  let prev = base
  for (const { head, ways } of steps) {
    const start = now()
    commit(validator, prev, head, ways)
    prev = head
    samples.push(now() - start)
    checkedLast = entitiesToValidate(new Difference(base, head).changes, base, head).size
  }
  return {
    label,
    steps: steps.length,
    perStep: statsOf(samples),
    total: round(
      samples.reduce((a, b) => a + b, 0),
      1,
    ),
    overFrame: samples.filter((s) => s > FRAME_MS).length,
    overChunk: samples.filter((s) => s > CHUNK_MS).length,
    checkedLast,
    firstTenMedian: round(median(samples.slice(0, 10))),
    lastTenMedian: round(median(samples.slice(-10))),
  }
}

// A drag: one node moved 50 small steps, each validated as if it were a commit
const dragWay = featureNeighbours[0]!
const dragNodeId = dragWay.nodes[Math.floor(dragWay.nodes.length / 2)]!
const dragEntity = base.entity(dragNodeId)
if (!(dragEntity instanceof OsmNode)) throw new Error(`${dragNodeId} is not a node`)
const dragNode = dragEntity
const dragSteps: { head: Graph; ways: readonly OsmWay[] }[] = []
{
  let head = new Graph(base)
  for (let i = 1; i <= 50; i++) {
    head = actionMoveNode(dragNodeId, [
      dragNode.loc![0] + i * 0.000002,
      dragNode.loc![1] + i * 0.000001,
    ])(head)
    dragSteps.push({ head, ways: baseWays })
  }
}
const dragBurst = burst('drag: one node, 50 steps', dragSteps)

// 50 tag edits on 50 different ways, one after another (cumulative)
const burstWays = pick(features, 50, 5)
const tagSteps: { head: Graph; ways: readonly OsmWay[] }[] = []
{
  let head = new Graph(base)
  for (const [i, way] of burstWays.entries()) {
    head = actionChangeTags(way.id, { ...way.tags, description: `burst ${i}` })(head)
    tagSteps.push({ head, ways: waysOf(head) })
  }
}
const tagBurst = burst('tags: 50 ways, one after another', tagSteps)

console.log('\nbursts of 50 commits, cumulative, on one warm validator')
for (const b of [dragBurst, tagBurst])
  console.log(
    `  ${b.label.padEnd(34)} per step median ${b.perStep.median} ms  worst ${b.perStep.max} ms  total ${b.total} ms  over ${FRAME_MS} ms: ${b.overFrame}  over ${CHUNK_MS} ms: ${b.overChunk}  entities checked at the end: ${b.checkedLast}`,
  )
for (const b of [dragBurst, tagBurst])
  console.log(
    `  ${b.label.padEnd(34)} growth: median of the first ten steps ${b.firstTenMedian} ms, of the last ten ${b.lastTenMedian} ms`,
  )

// ---------------------------------------------------------------- profile of the edits

{
  // the rules timed one by one, and the neighbour lookups counted, over the edits (instrumented: slower)
  const timedRules: Rule[] = defaultRules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    validate(entity, ctx: RuleContext) {
      const start = now()
      const wrapped: RuleContext = {
        ...ctx,
        waysNear(way) {
          const t = now()
          const near = ctx.waysNear(way)
          neighbourCalls++
          neighbourCandidates += near.length
          if (rule.id === 'crossing_ways' && way instanceof OsmWay)
            for (const other of near)
              crossingPairs +=
                Math.max(0, way.nodes.length - 1) * Math.max(0, other.nodes.length - 1)
          const dt = now() - t
          const prev = profile.get('waysNear (inside the rules)') ?? { ms: 0, calls: 0 }
          profile.set('waysNear (inside the rules)', { ms: prev.ms + dt, calls: prev.calls + 1 })
          return near
        },
      }
      const issues = rule.validate(entity, wrapped)
      const dt = now() - start
      const prev = profile.get(rule.id) ?? { ms: 0, calls: 0 }
      profile.set(rule.id, { ms: prev.ms + dt, calls: prev.calls + 1 })
      return issues
    },
  }))
  const validator = warmValidator(timedRules)
  let prev = base
  for (const [index, edit] of edits.entries()) {
    commit(validator, prev, heads[index]!, waysFor(edit, heads[index]!))
    prev = heads[index]!
  }
  console.log(
    `\nprofile of the ${edits.length} edits (rules timed one by one, instrumented: slower than the table)`,
  )
  const total = [...profile.entries()]
    .filter(([name]) => !name.startsWith('waysNear'))
    .reduce((sum, [, v]) => sum + v.ms, 0)
  for (const [name, v] of [...profile.entries()].sort((a, b) => b[1].ms - a[1].ms))
    console.log(
      `  ${name.padEnd(28)} ${String(round(v.ms, 1)).padStart(9)} ms  ${String(v.calls).padStart(8)} calls  ${round((100 * v.ms) / total, 1)}% of rules`,
    )
  console.log(
    `  waysNear: ${neighbourCalls} calls over ${edits.length} edits (${round(neighbourCalls / edits.length, 1)} per edit), ${round(neighbourCandidates / Math.max(neighbourCalls, 1), 1)} neighbours returned per call`,
  )
  const pairsPerEdit = crossingPairs / edits.length
  crossingPairsPerEdit = pairsPerEdit
  // the same count over the whole dense scene: every way validated, as validate-everything does it
  crossingPairs = 0
  const everythingValidator = createValidator(
    timedRules.filter((rule) => rule.id === 'crossing_ways'),
  )
  everythingValidator.validate(base, allIds, baseWays)
  crossingPairsAll = crossingPairs
  console.log(
    `  crossing_ways segment pairs (upper bound): ${round(pairsPerEdit, 0)} per edit, ${crossingPairsAll} for validate-everything`,
  )
}

// ---------------------------------------------------------------- report

const report = {
  fixture: 'fixtures/dense.json.gz',
  counts,
  entities: allIds.length,
  runs: RUNS,
  loadMs: round(loadMs, 0),
  bun: Bun.version,
  frameBudgetMs: FRAME_MS,
  chunkBudgetMs: CHUNK_MS,
  perRule: ruleRows,
  overheadMs: overhead.stats,
  allRules: {
    ms: everything.stats,
    issues: everythingIssues.length,
    digest: everythingDigest,
    perEntityUs: round(perEntityUs, 3),
  },
  firstEdit,
  edits: editSummary,
  editWays: editWays.map((e) => ({
    id: e.way.id,
    kind: e.kind,
    neighbours: counted.get(e.way.id) ?? 0,
    nodes: e.way.nodes.length,
  })),
  editResults,
  bursts: [dragBurst, tagBurst],
  crossingPairs: { perEdit: round(crossingPairsPerEdit, 0), validateEverything: crossingPairsAll },
  issueDigests: editResults.map((r) => `${r.label}:${r.issueDigest}:${r.issues}`),
}
mkdirSync(resolve(ROOT, 'reports'), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n')
console.log(`\nwrote ${OUT}`)
