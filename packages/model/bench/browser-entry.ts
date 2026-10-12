// Browser twin of load.ts: the same steps for one scene, timed inside a browser page.
// tools/bench/model-load.ts bundles this file and calls globalThis.__modelLoad.
// Run it with: bun tools/bench/model-load.ts   (numbers are from Chrome, Firefox or WebKit)

import {
  EditHistory,
  ModelContext,
  OsmJSONParser,
  OsmNode,
  OsmRelation,
  OsmWay,
  createOsmEntity,
} from '../src/index.ts'
import type { OsmEntity } from '../src/index.ts'
import { OsmStore } from './poc-store.ts'

export type ModelLoadResult = {
  elements: number
  tJson: number
  tPoc: number
  tParse: number
  tEnt: number
  tGraph: number
  tDirect: number
}

declare global {
  var __modelLoad: (jsonText: string, runs: number) => ModelLoadResult
}

// Optional metadata that the parser copies onto every entity, when the element has it.
function metaOf(obj: any) {
  return {
    ...(obj.version !== undefined && { version: obj.version }),
    ...(obj.changeset !== undefined && { changeset: obj.changeset }),
    ...(obj.timestamp !== undefined && { timestamp: obj.timestamp }),
    ...(obj.user !== undefined && { user: obj.user }),
    ...(obj.uid !== undefined && { uid: String(obj.uid) }),
  }
}

// Entities straight from the API JSON, without OsmJSONParser. The props match what the parser
// builds (_parseNode, _parseWay, _parseRelation in OsmJSONParser.ts), without its generic copyProps pass.
function entitiesFromJSON(context: ModelContext, elements: any[]): OsmEntity[] {
  const entities: OsmEntity[] = []
  for (const obj of elements) {
    const common = { visible: obj.visible ?? true, tags: obj.tags || {}, ...metaOf(obj) }
    if (obj.type === 'node') {
      entities.push(new OsmNode(context, { ...common, id: `n${obj.id}`, loc: [obj.lon, obj.lat] }))
    } else if (obj.type === 'way') {
      const nodes = (obj.nodes || []).map((id: number) => `n${id}`)
      entities.push(new OsmWay(context, { ...common, id: `w${obj.id}`, nodes }))
    } else if (obj.type === 'relation') {
      const members = (obj.members || []).map((m: any) => ({ id: m.type[0] + m.ref, type: m.type, role: m.role }))
      entities.push(new OsmRelation(context, { ...common, id: `r${obj.id}`, members }))
    }
  }
  return entities
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
    const history = new EditHistory(context)
    history.merge(entities)
    const tGraph = performance.now() - t

    const directContext = new ModelContext()
    t = performance.now()
    entitiesFromJSON(directContext, json.elements)
    const tDirect = performance.now() - t

    for (const [k, v] of Object.entries({ tJson, tPoc, tParse, tEnt, tGraph, tDirect }))
      best[k] = Math.min(best[k] ?? 1e9, v)
  }
  return {
    elements,
    tJson: best.tJson ?? 0,
    tPoc: best.tPoc ?? 0,
    tParse: best.tParse ?? 0,
    tEnt: best.tEnt ?? 0,
    tGraph: best.tGraph ?? 0,
    tDirect: best.tDirect ?? 0,
  }
}
