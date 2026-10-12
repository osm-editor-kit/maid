// Times the load path the app uses, for one scene, inside a browser page: API JSON to entities
// (entitiesFromOsmJson), then into the history (EditHistory.merge).
// `bun run bench-model` bundles this file and calls globalThis.__modelLoad.

import { EditHistory, ModelContext, entitiesFromOsmJson } from '../src/index.ts'

export type ModelLoadResult = {
  elements: number
  tJson: number
  tEntities: number
  tMerge: number
}

declare global {
  var __modelLoad: (jsonText: string, runs: number) => ModelLoadResult
}

// Best (lowest) time per step over `runs` runs. The text is parsed again on every run, so
// JSON.parse is timed each time.
globalThis.__modelLoad = (jsonText: string, runs: number): ModelLoadResult => {
  const best = { elements: 0, tJson: Infinity, tEntities: Infinity, tMerge: Infinity }
  for (let run = 0; run < runs; run++) {
    let t = performance.now()
    const json = JSON.parse(jsonText)
    best.tJson = Math.min(best.tJson, performance.now() - t)
    best.elements = json.elements.length

    const context = new ModelContext()
    t = performance.now()
    const entities = entitiesFromOsmJson(context, json.elements)
    best.tEntities = Math.min(best.tEntities, performance.now() - t)

    t = performance.now()
    new EditHistory(context).merge(entities)
    best.tMerge = Math.min(best.tMerge, performance.now() - t)
  }
  return best
}
