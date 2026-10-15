import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  Graph,
  ModelContext,
  entitiesFromOsmJson,
  type OsmJsonElement,
} from '../../packages/model/src/index.ts'
import {
  bicycleProfile,
  buildRoutingGraph,
  findRoute,
  footProfile,
  haversine,
  type BuildOptions,
  type Profile,
  type RoutingGraph,
} from '../../packages/routing/src/index.ts'
/**
 * Routing benchmark: the own A* in packages/routing, on the loaded fixtures.
 *
 *   bun tools/bench/routing-bench.ts
 *
 * For each fixture (dense, relations) and each profile (bicycle, foot): builds the routing graph
 * (default junctions, and every-node for comparison), then routes between random junction pairs
 * about 1, 3 and 5 km apart (seeded). Times the route from node to node, and from two coordinates
 * one metre off the nodes (snap both, then route: the via point to route pipeline).
 * Checks the heuristic against Dijkstra on a few pairs. Writes reports/routing-bench.json and
 * prints one line per (fixture, profile, variant, distance). No network: the fixtures only.
 */

const ROOT = resolve(import.meta.dir, '../..')
const FIXTURES = ['dense', 'relations'] as const
const DISTANCES_KM = [1, 3, 5]
const PAIRS = 50
const SEED = 20261015
const TOLERANCE = 0.1
const DIJKSTRA_CHECKS = 5
/** Candidate end nodes are drawn from this many random nodes, to keep the search for pairs cheap */
const POOL = 4000
/** Coordinates for the via-point timing: one metre east of the node */
const VIA_OFFSET_DEG = 0.000013

type Variant = { name: 'junctions' | 'every-node'; options: BuildOptions }
const VARIANTS: Variant[] = [
  { name: 'junctions', options: {} },
  { name: 'every-node', options: { everyNode: true } },
]

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
}

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Pairs of junction node indices about `km` apart; fewer when the data does not reach that far */
function samplePairs(rg: RoutingGraph, km: number, random: () => number): Array<[number, number]> {
  const n = rg.nodeIds.length
  const pairs: Array<[number, number]> = []
  if (n < 2) return pairs
  const pool = Array.from({ length: Math.min(n, POOL) }, () => Math.floor(random() * n))
  const target = km * 1000
  for (let attempt = 0; attempt < PAIRS * 8 && pairs.length < PAIRS; attempt++) {
    const a = Math.floor(random() * n)
    const lon = rg.nodeLon[a]!
    const lat = rg.nodeLat[a]!
    const candidates = pool.filter((b) => {
      if (b === a) return false
      const d = haversine(lon, lat, rg.nodeLon[b]!, rg.nodeLat[b]!)
      return Math.abs(d - target) <= TOLERANCE * target
    })
    if (candidates.length === 0) continue
    pairs.push([a, candidates[Math.floor(random() * candidates.length)]!])
  }
  return pairs
}

type Timed = {
  routeMs: number[]
  viaMs: number[]
  found: number
  reasons: Record<string, number>
  lengths: number[]
}

function timeRoutes(rg: RoutingGraph, pairs: Array<[number, number]>): Timed {
  const timed: Timed = { routeMs: [], viaMs: [], found: 0, reasons: {}, lengths: [] }
  for (const [a, b] of pairs) {
    const from = rg.nodeIds[a]!
    const to = rg.nodeIds[b]!
    const started = performance.now()
    const result = findRoute(rg, { node: from }, { node: to })
    timed.routeMs.push(performance.now() - started)
    if (result.ok) {
      timed.found++
      timed.lengths.push(result.lengthM)
    } else {
      timed.reasons[result.reason] = (timed.reasons[result.reason] ?? 0) + 1
    }

    // The via point pipeline: two coordinates, snapped to the nearest routable way, then routed
    const fromLoc = { loc: [rg.nodeLon[a]! + VIA_OFFSET_DEG, rg.nodeLat[a]!] as [number, number] }
    const toLoc = { loc: [rg.nodeLon[b]! + VIA_OFFSET_DEG, rg.nodeLat[b]!] as [number, number] }
    const viaStart = performance.now()
    findRoute(rg, fromLoc, toLoc)
    timed.viaMs.push(performance.now() - viaStart)
  }
  return timed
}

function summarise(values: number[]) {
  const sorted = [...values].sort((x, y) => x - y)
  return {
    median: round(percentile(sorted, 0.5), 2),
    p95: round(percentile(sorted, 0.95), 2),
    max: round(sorted.at(-1) ?? Number.NaN, 2),
  }
}

async function main(): Promise<void> {
  const random = mulberry32(SEED)
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
    seed: SEED,
    pairsPerDistance: PAIRS,
    distancesKm: DISTANCES_KM,
    tolerance: TOLERANCE,
    timing:
      'ms; route = node to node, via = two coordinates one metre off the nodes (snap both, then route)',
  }
  const fixtures: unknown[] = []
  const loaded = new Map<string, Graph>()
  const graphs: unknown[] = []
  const routes: unknown[] = []

  for (const name of FIXTURES) {
    const parseStart = performance.now()
    const json = JSON.parse(
      gunzipSync(readFileSync(join(ROOT, 'fixtures', `${name}.json.gz`))).toString(),
    ) as { elements: OsmJsonElement[] }
    const parseMs = performance.now() - parseStart

    const context = new ModelContext()
    const modelStart = performance.now()
    const graph = new Graph(context, entitiesFromOsmJson(context, json.elements))
    loaded.set(name, graph)
    const modelMs = performance.now() - modelStart
    const counts = { node: 0, way: 0, relation: 0 }
    for (const element of json.elements) counts[element.type] += 1
    fixtures.push({ name, counts, parseMs: round(parseMs), modelMs: round(modelMs) })
    console.log(
      `${name} nodes=${counts.node} ways=${counts.way} relations=${counts.relation} parse=${Math.round(parseMs)} model=${Math.round(modelMs)}`,
    )

    for (const profile of [bicycleProfile, footProfile] as Profile[]) {
      let base: RoutingGraph | undefined
      const variantGraphs: Array<{ variant: Variant; rg: RoutingGraph }> = []
      for (const variant of VARIANTS) {
        const rg = buildRoutingGraph(graph, profile, variant.options)
        variantGraphs.push({ variant, rg })
        if (variant.name === 'junctions') base = rg
        graphs.push({
          fixture: name,
          variant: variant.name,
          ...rg.stats,
          buildMs: round(rg.stats.buildMs),
        })
        console.log(
          `  graph ${profile.name} ${variant.name}: nodes=${rg.stats.nodes} edges=${rg.stats.edges} segments=${rg.stats.segments} restrictions=${rg.stats.restrictions.applied} build=${Math.round(rg.stats.buildMs)} ms`,
        )
      }
      if (!base) continue

      for (const km of DISTANCES_KM) {
        const pairs = samplePairs(base, km, random)
        for (const { variant, rg } of variantGraphs) {
          const usable = pairs.filter(([a, b]) => {
            // Pairs of the junctions graph, read in the other variant by node id
            return rg.nodeIndex.has(base.nodeIds[a]!) && rg.nodeIndex.has(base.nodeIds[b]!)
          })
          const mapped = usable.map(
            ([a, b]) =>
              [rg.nodeIndex.get(base.nodeIds[a]!)!, rg.nodeIndex.get(base.nodeIds[b]!)!] as [
                number,
                number,
              ],
          )
          const timed = timeRoutes(rg, mapped)
          const row = {
            fixture: name,
            profile: profile.name,
            variant: variant.name,
            distanceKm: km,
            pairsSampled: pairs.length,
            searches: mapped.length,
            found: timed.found,
            route: summarise(timed.routeMs),
            via: summarise(timed.viaMs),
            meanFoundLengthM: timed.lengths.length
              ? round(timed.lengths.reduce((sum, v) => sum + v, 0) / timed.lengths.length, 0)
              : null,
            reasons: timed.reasons,
          }
          routes.push(row)
          console.log(
            `  route ${profile.name} ${variant.name} ${km} km: sampled=${pairs.length} found=${timed.found}/${mapped.length} route median=${row.route.median} p95=${row.route.p95} ms; via median=${row.via.median} p95=${row.via.p95} ms`,
          )
        }
      }
    }
  }

  // The heuristic must not change the answer: A* against Dijkstra on a few pairs of dense, bicycle, 3 km
  const denseGraph = loaded.get('dense')
  if (!denseGraph) throw new Error('the dense fixture was not loaded')
  const rg = buildRoutingGraph(denseGraph, bicycleProfile)
  const checkPairs = samplePairs(rg, 3, mulberry32(SEED + 1)).slice(0, DIJKSTRA_CHECKS)
  let agreed = 0
  let maxDiff = 0
  for (const [a, b] of checkPairs) {
    const astar = findRoute(rg, { node: rg.nodeIds[a]! }, { node: rg.nodeIds[b]! })
    const dijkstra = findRoute(
      rg,
      { node: rg.nodeIds[a]! },
      { node: rg.nodeIds[b]! },
      { heuristic: false },
    )
    if (astar.ok !== dijkstra.ok) continue
    if (!astar.ok || !dijkstra.ok) {
      agreed++
      continue
    }
    const diff = Math.abs(astar.cost - dijkstra.cost)
    maxDiff = Math.max(maxDiff, diff)
    if (diff < 1e-6) agreed++
  }
  report.dijkstra = { checked: checkPairs.length, agreed, maxCostDiffM: maxDiff }
  console.log(
    `A* vs Dijkstra (dense, bicycle, 3 km): ${agreed}/${checkPairs.length} agree, max cost diff ${maxDiff}`,
  )

  report.fixtures = fixtures
  report.graphs = graphs
  report.routes = routes

  const outPath = join(ROOT, 'reports', 'routing-bench.json')
  mkdirSync(join(ROOT, 'reports'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`wrote ${outPath}`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exitCode = 1
}
