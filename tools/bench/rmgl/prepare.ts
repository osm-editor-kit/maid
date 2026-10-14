/**
 * Turns the dense fixture into the GeoJSON and the layer list the react-map-gl benchmark draws.
 *
 * The features come from Maid's own feature builder and the layers from Maid's own `buildLayers`, so both
 * sides of the comparison draw what Maid draws: the same sources, the same 113 layers with their filters
 * and expressions. No network: the fixture is a committed file (AGENTS.md, core rule 1).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { LayerSpecification } from 'maplibre-gl'
import {
  EditHistory,
  ModelContext,
  type OsmJsonElement,
} from '../../../packages/model/src/index.ts'
import { defaultPresets } from '../../../packages/presets/src/default.ts'
import { FeatureBuilder } from '../../../packages/renderer/src/build.ts'
import { OsmData } from '../../../packages/renderer/src/data.ts'
import { BELOW_OSM_LAYER } from '../../../packages/renderer/src/extension-points.ts'
import {
  ACTIVE_SOURCE,
  buildLayers,
  EDIT_SOURCES,
  interactiveLayerIds,
  SELECT_SOURCES,
  SOURCES,
} from '../../../packages/renderer/src/layers.ts'

const ROOT = resolve(import.meta.dir, '../../..')

export type Prepared = {
  center: [number, number]
  /** Source ids in the order Maid declares them; the first four carry the fixture's features */
  sources: string[]
  dataSources: { areas: string; lines: string; points: string; vertices: string }
  features: Record<'areas' | 'lines' | 'points' | 'vertices', number>
  layers: number
  interactive: number
}

/** Icons are images Maid makes at run time. Without them a layer would ask for missing images on both sides. */
function withoutIcons(layer: LayerSpecification): LayerSpecification {
  if (layer.type !== 'symbol' || !layer.layout || !('icon-image' in layer.layout)) return layer
  const layout = { ...layer.layout }
  delete layout['icon-image']
  return { ...layer, layout }
}

export function prepare(outDir: string): Prepared {
  const meta = JSON.parse(readFileSync(join(ROOT, 'fixtures/dense.meta.json'), 'utf8')) as {
    center: [number, number]
  }
  const { elements } = JSON.parse(
    gunzipSync(readFileSync(join(ROOT, 'fixtures/dense.json.gz'))).toString(),
  ) as { elements: OsmJsonElement[] }

  const context = new ModelContext()
  const data = new OsmData(context, new EditHistory(context))
  const batch = new FeatureBuilder(data, defaultPresets).build(data.merge(elements))

  const below: LayerSpecification = {
    id: BELOW_OSM_LAYER,
    type: 'background',
    layout: { visibility: 'none' },
  }
  const layers: LayerSpecification[] = [
    below,
    ...buildLayers({
      fill: 'partial',
      labels: true,
      icons: true,
      pins: 'fit',
      lat: meta.center[1],
      dashes: new Map(),
      selectTwins: true,
    }),
  ].map(withoutIcons)

  mkdirSync(outDir, { recursive: true })
  const write = (name: string, value: unknown) =>
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(value))
  const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features })
  write('areas', collection(batch.areas))
  write('lines', collection(batch.lines))
  write('points', collection(batch.points))
  write('vertices', collection(batch.vertices))
  write('layers', layers)

  const prepared: Prepared = {
    center: meta.center,
    sources: [
      ...Object.values(SOURCES),
      ACTIVE_SOURCE,
      ...Object.values(EDIT_SOURCES),
      ...Object.values(SELECT_SOURCES),
    ],
    dataSources: {
      areas: SOURCES.areas,
      lines: SOURCES.lines,
      points: SOURCES.points,
      vertices: SOURCES.vertices,
    },
    features: {
      areas: batch.areas.length,
      lines: batch.lines.length,
      points: batch.points.length,
      vertices: batch.vertices.length,
    },
    layers: layers.length,
    interactive: interactiveLayerIds(layers).length,
  }
  write('meta', { ...prepared, interactiveIds: interactiveLayerIds(layers) })
  return prepared
}

if (import.meta.main) {
  const out = resolve(import.meta.dir, 'dist/data')
  console.log(prepare(out), `\nwritten to ${out}`)
}
