// Benchmark of the filter matcher on the dense fixture (Neukölln, about 140k elements).
// Run: bun packages/filters/bench/filters.bench.ts
// Prints the numbers; with FILTERS_BENCH_OUT=<file> it also writes them there as JSON.
//
// What it measures: one call per element of the fixture, as the renderer makes them on load and on
// every filter change. Each figure is the median of five runs after a warm-up run.
// - stateOf: what can be done with the element (the renderer's hot path)
// - filterOf: the filter that decides for it (the renderer's hidden counter)
// Geometry: a node is a point; a way is an area when it is closed, else a line; a relation is an
// area when it is a multipolygon, else a relation. Vertices are not in the fixture as elements of
// their own, so no vertex calls are made.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createFilterSet, defaultFilters } from '../src/index.ts'
import type { Geometry, Tags } from '../src/index.ts'

const ROOT = resolve(import.meta.dir, '../../..')
const RUNS = Number(process.env.RUNS ?? 5)
const OUT = process.env.FILTERS_BENCH_OUT

type Element = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Tags
  nodes?: number[]
  members?: unknown[]
}

const fixture: { elements: Element[] } = JSON.parse(
  gunzipSync(readFileSync(resolve(ROOT, 'fixtures/dense.json.gz'))).toString(),
)

const items: [Tags, Geometry][] = fixture.elements.map((element) => {
  const tags = element.tags ?? {}
  if (element.type === 'node') return [tags, 'point']
  if (element.type === 'way') {
    const nodes = element.nodes ?? []
    const closed = nodes.length > 2 && nodes[0] === nodes[nodes.length - 1]
    return [tags, closed ? 'area' : 'line']
  }
  return [tags, tags.type === 'multipolygon' ? 'area' : 'relation']
})

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function time(run: () => number) {
  const start = performance.now()
  const sink = run()
  return { ms: performance.now() - start, sink }
}

const sets = {
  defaults: createFilterSet(defaultFilters),
  'buildings:readonly,boundaries:hidden': createFilterSet(
    defaultFilters,
    'buildings:readonly,boundaries:hidden',
  ),
}

type Result = {
  set: string
  call: 'stateOf' | 'filterOf'
  medianMs: number
  runsMs: number[]
  elements: number
  /** A checksum of the answers, so a change in what is decided shows up */
  checksum: number
}

const results: Result[] = []

for (const [name, set] of Object.entries(sets)) {
  const stateOf = () => {
    let hidden = 0
    let readOnly = 0
    for (const [tags, geometry] of items) {
      const state = set.stateOf(tags, geometry)
      if (state === 'hidden') hidden++
      else if (state === 'readonly') readOnly++
    }
    return hidden * 1_000_000 + readOnly
  }
  const filterOf = () => {
    let decided = 0
    for (const [tags, geometry] of items) {
      if (set.filterOf(tags, geometry) !== undefined) decided++
    }
    return decided
  }
  for (const [call, run] of [
    ['stateOf', stateOf],
    ['filterOf', filterOf],
  ] as const) {
    run() // warm-up
    const runs = Array.from({ length: RUNS }, () => time(run))
    results.push({
      set: name,
      call,
      medianMs: Math.round(median(runs.map((r) => r.ms)) * 100) / 100,
      runsMs: runs.map((r) => Math.round(r.ms * 100) / 100),
      elements: items.length,
      checksum: runs[0]!.sink,
    })
  }
}

const report = {
  fixture: 'fixtures/dense.json.gz',
  elements: items.length,
  runs: RUNS,
  results,
}
if (OUT) writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`)

for (const r of results) {
  console.log(
    `${r.call.padEnd(9)} ${r.set.padEnd(36)} median ${r.medianMs.toFixed(1)} ms for ${r.elements} elements (runs ${r.runsMs.join(', ')}) checksum ${r.checksum}`,
  )
}
if (OUT) console.log(`wrote ${OUT}`)
