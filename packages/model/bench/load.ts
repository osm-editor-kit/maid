// Times loading each fixture into the proof-of-concept store and into the ported model.
// Run: bun packages/model/bench/load.ts   (numbers are from Bun, not from a browser)

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {
  ModelContext,
  OsmJSONParser,
  createOsmEntity,
  Graph,
} from '../src/index.ts'
import { OsmStore } from './poc-store.ts'

for (const scene of ['small', 'medium', 'dense']) {
  const text = gunzipSync(
    readFileSync(`${import.meta.dir}/../../../fixtures/${scene}.json.gz`),
  ).toString()
  const best: Record<string, number> = {}
  let n = 0
  for (let run = 0; run < 5; run++) {
    let t = performance.now()
    const json = JSON.parse(text)
    const tJson = performance.now() - t
    n = json.elements.length

    t = performance.now()
    new OsmStore().merge(json.elements)
    const tPoc = performance.now() - t

    const context = new ModelContext()
    t = performance.now()
    const parsed = new OsmJSONParser().parse(json)
    const tParse = performance.now() - t
    t = performance.now()
    const entities = parsed.data.map((d: any) => createOsmEntity(context, d))
    const tEnt = performance.now() - t
    t = performance.now()
    const graph = new Graph(context)
    graph.rebase(entities, [graph])
    const tGraph = performance.now() - t
    for (const [k, v] of Object.entries({ tJson, tPoc, tParse, tEnt, tGraph }))
      best[k] = Math.min(best[k] ?? 1e9, v)
  }
  console.log(
    scene,
    n,
    Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +v.toFixed(1)])),
  )
}
