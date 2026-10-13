import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
// Timing of the per-edit path of a vertex drag, headless: one node moved through `history.perform` (model, the
// staging difference, OsmData's indexes), then the features the engine rebuilds for it (`redraw`: the vertex and
// every way that uses the node). MapLibre's `updateData` is not part of this.
// Run: bun packages/renderer/bench/edit.bench.ts [--steps 300] [--scene dense]
// Writes reports/renderer-edit-bench-<scene>.json. Bun is JavaScriptCore: judge by ratio between two states of the code.
import {
  actionMoveNode,
  EditHistory,
  ModelContext,
  OsmNode,
  type OsmJsonElement,
} from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { FeatureBuilder } from '../src/build.ts'
import { OsmData } from '../src/data.ts'

const ROOT = resolve(import.meta.dir, '../../..')
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback
}
const STEPS = Number(arg('steps', '300')) || 300
const scene = arg('scene', 'dense')
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!
const round = (n: number) => Math.round(n * 100) / 100

const elements = (
  JSON.parse(gunzipSync(readFileSync(resolve(ROOT, `fixtures/${scene}.json.gz`))).toString()) as {
    elements: OsmJsonElement[]
  }
).elements
const context = new ModelContext()
const history = new EditHistory(context)
const data = new OsmData(context, history)
data.merge(elements)
const builder = new FeatureBuilder(data, defaultPresets)
builder.build(data.all())

// a junction of two or more ways, as a drag of a shared vertex touches the most
let target: OsmNode | undefined
for (const [id, ways] of data.nodeWays)
  if (ways.length >= 3) {
    target = data.node(id)
    break
  }
if (!target?.loc) throw new Error('no junction node found')
const id = target.id
const [lon, lat] = target.loc

const perform: number[] = []
const rebuild: number[] = []
for (let step = 0; step < STEPS; step++) {
  const loc: [number, number] = [lon + step * 1e-7, lat + step * 1e-7]
  let a = performance.now()
  history.perform(actionMoveNode(id, loc))
  let b = performance.now()
  perform.push(b - a)
  a = b
  const node = data.node(id)!
  if (node) builder.buildVertex(node)
  for (const wayId of data.nodeWays.get(id) ?? []) {
    const way = data.way(wayId)
    if (way) builder.buildWay(way)
  }
  rebuild.push(performance.now() - a)
}
const result = {
  scene,
  steps: STEPS,
  waysAtNode: data.nodeWays.get(id)?.length,
  medianMs: {
    perform: round(median(perform)),
    rebuildFeatures: round(median(rebuild)),
    total: round(median(perform) + median(rebuild)),
  },
}
mkdirSync(resolve(ROOT, 'reports'), { recursive: true })
const out = resolve(ROOT, `reports/renderer-edit-bench-${scene}.json`)
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
console.log(`wrote ${out}`)
