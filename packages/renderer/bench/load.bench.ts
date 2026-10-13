import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
// Timing of the engine's load path, one scene, headless: for each tile of the first view (the 1600x1000 viewport of
// the benchmark at the scene's start zoom, 9 tiles on the dense scene) the body the mock API sends, then what the
// engine does with it: JSON.parse of the text, OsmData.merge (JSON to entities, entities into the history, the
// indexes), FeatureBuilder.build (features for the four sources), and the work of `push` that does not touch
// MapLibre (the per-feature bookkeeping and the queue concat).
// Run: bun packages/renderer/bench/load.bench.ts [--scene dense] [--runs 7]
// Writes reports/renderer-load-bench-<scene>.json. Bun is JavaScriptCore, not V8: judge by ratio between two states
// of the code, not by the absolute numbers.
import { EditHistory, ModelContext, type OsmJsonElement } from '@osm-editor-kit/maid-model'
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { SCENES } from '../../../tools/fixtures/scenes.ts'
import { SceneIndex } from '../../../tools/mock-osm-api/server.ts'
import { FeatureBuilder } from '../src/build.ts'
import { OsmData } from '../src/data.ts'
import { iconImagesRequestedAt } from '../src/icon-requests.ts'
import { buildLayers, type LayerOptions } from '../src/layers.ts'

const ROOT = resolve(import.meta.dir, '../../..')
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback
}
const RUNS = Number(arg('runs', '7')) || 7
const sceneName = arg('scene', 'dense')
const scene = SCENES.find((s) => s.name === sceneName)
if (!scene) throw new Error(`unknown scene ${sceneName}`)

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
const round = (n: number) => Math.round(n * 10) / 10

// the tiles of the first view, as engine.loadVisibleTiles computes them (OSM zoom 16 tiles, MapLibre zoom = OSM - 1)
const TILE_ZOOM = 16
const n = 2 ** TILE_ZOOM
const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * n)
const lat2y = (lat: number) =>
  Math.floor(
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      n,
  )
const x2lon = (x: number) => (x / n) * 360 - 180
const y2lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
const [clon, clat] = scene.center
const mapLibreZoom = scene.zoom - 1
const worldPx = 512 * 2 ** mapLibreZoom
const cxWorld = (clon + 180) / 360
const cyWorld =
  (1 -
    Math.log(Math.tan((clat * Math.PI) / 180) + 1 / Math.cos((clat * Math.PI) / 180)) / Math.PI) /
  2
const halfW = 800 / worldPx
const halfH = 500 / worldPx
const bounds = { w: (cxWorld - halfW) * 360 - 180, e: (cxWorld + halfW) * 360 - 180 }
const yTop = cyWorld - halfH
const yBottom = cyWorld + halfH
const latOf = (yw: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * yw))) * 180) / Math.PI
const tiles: [number, number][] = []
for (let x = lon2x(bounds.w); x <= lon2x(bounds.e); x++)
  for (let y = lat2y(latOf(yTop)); y <= lat2y(latOf(yBottom)); y++) tiles.push([x, y])

const raw = JSON.parse(
  gunzipSync(readFileSync(resolve(ROOT, `fixtures/${scene.name}.json.gz`))).toString(),
) as { elements: OsmJsonElement[] }
const index = new SceneIndex(raw.elements as never)
const t0 = performance.now()
const bodies = tiles.map(([x, y]) =>
  index.map([x2lon(x), y2lat(y + 1), x2lon(x + 1), y2lat(y)] as [number, number, number, number]),
)
const serverMs = performance.now() - t0
const bytes = bodies.reduce((sum, b) => sum + b.length, 0)

const imageIds = new Set<string>()
type Run = { parse: number; merge: number; build: number; push: number; features: number }
function once(): Run {
  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  const builder = new FeatureBuilder(data, defaultPresets)
  const featureSource = new Map<string, string>()
  const queues: Record<string, unknown[]> = { areas: [], lines: [], points: [], vertices: [] }
  const run: Run = { parse: 0, merge: 0, build: 0, push: 0, features: 0 }
  for (const text of bodies) {
    let a = performance.now()
    const json = JSON.parse(text) as { elements: OsmJsonElement[] }
    let b = performance.now()
    run.parse += b - a
    a = b
    const added = data.merge(json.elements)
    b = performance.now()
    run.merge += b - a
    a = b
    const batch = builder.build(added)
    b = performance.now()
    run.build += b - a
    a = b
    for (const name of ['areas', 'lines', 'points', 'vertices'] as const) {
      const features = batch[name]
      run.features += features.length
      for (const f of features) featureSource.set(String(f.id ?? f.properties?.id), name)
      queues[name] = queues[name]!.concat(features)
    }
    run.push += performance.now() - b
    // the images the first view names: one pin per preset icon, one bare icon per vertex icon. The shell used to make
    // all of them when the batch arrived; now MapLibre asks for each one when it lays out a tile (see `images` below).
    for (const f of batch.points)
      if (!f.properties?.addr) imageIds.add(`pin-${f.properties?.icon ?? 'none'}`)
    for (const f of batch.vertices)
      if (f.properties?.icon) imageIds.add(`icon-${f.properties.icon}`)
  }
  return run
}

const runs: Run[] = []
// run 0 is the first in this process: cold code, like a page load. The medians are of the warm runs after it.
const cold = once()
for (let i = 1; i <= RUNS; i++) runs.push(once())
// Which of the images above MapLibre asks for when the first view is laid out. A tile is laid out at the floor of the
// MapLibre zoom (the scene opens at OSM zoom minus 1 in MapLibre), and only for the layers not hidden at that zoom:
// `iconImagesRequestedAt` applies the worker's rule to the layers `buildLayers` returns. `all` is what the shell made
// before this change; `neededAtOpeningZoom` counts the families the layers ask for (every pin of the batch when a
// family is asked for, since a layer asks for the icon of every feature it draws).
const openingZoom = Math.floor(scene.zoom - 1)
const layerOptions: LayerOptions = {
  fill: 'full',
  labels: true,
  icons: true,
  pins: 'fit',
  lat: clat,
  dashes: new Map(),
  selectionOnly: false,
}
const layers = buildLayers(layerOptions)
const pinIds = [...imageIds].filter((id) => id.startsWith('pin-'))
const iconIds = [...imageIds].filter((id) => id.startsWith('icon-'))
const families = iconImagesRequestedAt(layers, openingZoom)
const pinsAt = (set: Set<string>) => (set.has('pin-') ? pinIds.length : 0)
const iconsAt = (set: Set<string>) => (set.has('icon-') ? iconIds.length : 0)
const images = {
  openingZoom,
  all: { pins: pinIds.length, vertexIcons: iconIds.length, total: imageIds.size },
  neededAtOpeningZoom: {
    pins: pinsAt(families),
    vertexIcons: iconsAt(families),
    total: pinsAt(families) + iconsAt(families),
  },
}

const result = {
  scene: scene.name,
  runs: RUNS,
  tiles: tiles.length,
  bodyBytes: bytes,
  features: runs[0]!.features,
  distinctImages: imageIds.size,
  distinctPins: pinIds.length,
  distinctVertexIcons: iconIds.length,
  images,
  serverStringifyAllTilesMs: round(serverMs),
  coldMs: {
    parse: round(cold.parse),
    merge: round(cold.merge),
    build: round(cold.build),
    pushBookkeeping: round(cold.push),
    total: round(cold.parse + cold.merge + cold.build + cold.push),
  },
  medianMs: {
    parse: round(median(runs.map((r) => r.parse))),
    merge: round(median(runs.map((r) => r.merge))),
    build: round(median(runs.map((r) => r.build))),
    pushBookkeeping: round(median(runs.map((r) => r.push))),
    total: round(median(runs.map((r) => r.parse + r.merge + r.build + r.push))),
  },
}
mkdirSync(resolve(ROOT, 'reports'), { recursive: true })
const out = resolve(ROOT, `reports/renderer-load-bench-${scene.name}.json`)
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
console.log(
  `images ${scene.name}: all ${images.all.total} (${images.all.pins} pins, ${images.all.vertexIcons} vertex icons); needed at zoom ${openingZoom}: ${images.neededAtOpeningZoom.total} (${images.neededAtOpeningZoom.pins} pins, ${images.neededAtOpeningZoom.vertexIcons} vertex icons)`,
)
console.log(`wrote ${out}`)
