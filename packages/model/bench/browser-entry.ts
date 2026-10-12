// Browser twin of load.ts: the same steps for one scene, timed inside a browser page.
// tools/bench/model-load.ts bundles this file and calls globalThis.__modelLoad.
// Run it with: bun tools/bench/model-load.ts   (numbers are from Chrome, Firefox or WebKit)

import {
  ModelContext,
  OsmJSONParser,
  createOsmEntity,
  Graph,
} from '../src/index.ts'
import { OsmStore } from '../../renderer/src/store.ts'

export type ModelLoadResult = {
  elements: number
  tJson: number
  tPoc: number
  tParse: number
  tEnt: number
  tGraph: number
}

declare global {
  var __modelLoad: (jsonText: string, runs: number) => ModelLoadResult
}

// Best (lowest) time per step over `runs` runs, like load.ts. The text is parsed again on
// every run, so JSON.parse is timed each time.
globalThis.__modelLoad = (jsonText: string, runs: number): ModelLoadResult => {
  const best: Record<string, number> = {}
  let elements = 0
  for (let run = 0; run < runs; run++) {
    let t = performance.now()
    const json = JSON.parse(jsonText)
    const tJson = performance.now() - t
    elements = json.elements.length

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
  return {
    elements,
    tJson: best.tJson ?? 0,
    tPoc: best.tPoc ?? 0,
    tParse: best.tParse ?? 0,
    tEnt: best.tEnt ?? 0,
    tGraph: best.tGraph ?? 0,
  }
}
