import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Timing of the feature builder on the dense fixture (Neukölln, about 140k elements), with the default presets.
// Run: bun packages/renderer/bench/build.bench.ts [--runs 7]
// Writes reports/renderer-build-bench.json and prints the same numbers.
//
// What it measures, each as the median of the runs after a warm-up:
// - build: FeatureBuilder.build over every element, the way the engine builds a tile (merge first, not timed);
// - match: presets.match for every tagged node, as the builder asks for an icon, without a location and with
//   the node's own location (the location is only looked up for a preset that has a location set).
import { gunzipSync } from 'node:zlib'
import { EditHistory, ModelContext, OsmNode, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { FeatureBuilder } from '../src/build.ts'
import { OsmData } from '../src/data.ts'

const ROOT = resolve(import.meta.dir, '../../..')
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1] ?? 7) || 7
const OUT = resolve(ROOT, 'reports/renderer-build-bench.json')

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const elements = (
  JSON.parse(gunzipSync(readFileSync(resolve(ROOT, 'fixtures/dense.json.gz'))).toString()) as {
    elements: OsmJsonElement[]
  }
).elements

const builds: number[] = []
let features = 0
for (let run = 0; run <= RUNS; run++) {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  const added = data.merge(elements)
  const builder = new FeatureBuilder(data, defaultPresets)
  const start = performance.now()
  const batch = builder.build(added)
  const ms = performance.now() - start
  features = batch.areas.length + batch.lines.length + batch.points.length + batch.vertices.length
  // run 0 is the warm-up
  if (run > 0) builds.push(ms)
}

// match alone: every tagged node, once without a location and once with the node's own
const context = new ModelContext()
const data = new OsmData(context, new EditHistory(context))
data.merge(elements)
const tagged: Array<{ tags: Record<string, string>; loc: [number, number] }> = []
for (const node of data.history.staging.graph.base.entities.values()) {
  if (node instanceof OsmNode && node.loc && Object.keys(node.tags).length > 0)
    tagged.push({ tags: node.tags, loc: [node.loc[0], node.loc[1]] })
}
const matchTimes = { without: [] as number[], with: [] as number[] }
for (let run = 0; run <= RUNS; run++) {
  let start = performance.now()
  for (const { tags } of tagged) defaultPresets.match(tags, 'point')
  const without = performance.now() - start
  start = performance.now()
  for (const { tags, loc } of tagged) defaultPresets.match(tags, 'point', loc)
  const withLoc = performance.now() - start
  if (run > 0) {
    matchTimes.without.push(without)
    matchTimes.with.push(withLoc)
  }
}

const result = {
  fixture: 'dense',
  runs: RUNS,
  features,
  build: {
    medianMs: Math.round(median(builds) * 10) / 10,
    samplesMs: builds.map((ms) => Math.round(ms * 10) / 10),
  },
  taggedNodes: tagged.length,
  match: {
    withoutLocMs: Math.round(median(matchTimes.without) * 10) / 10,
    withLocMs: Math.round(median(matchTimes.with) * 10) / 10,
  },
}
mkdirSync(resolve(ROOT, 'reports'), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`)
console.log(`features ${features}, tagged nodes ${tagged.length}`)
console.log(`build median ${result.build.medianMs} ms over ${RUNS} runs`)
console.log(
  `match over tagged nodes: without loc ${result.match.withoutLocMs} ms, with loc ${result.match.withLocMs} ms`,
)
console.log(`wrote ${OUT}`)
