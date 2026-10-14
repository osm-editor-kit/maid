/**
 * The map layers of a data layer, as plain objects the renderer's `<Source>` and `<Layer>` take.
 * Pure: the component in MapLayers.tsx renders them, the tests check them.
 */
import { isLocalUrl } from '@osm-editor-kit/maid-core'
import type { MapLayerItem } from '@osm-editor-kit/maid-renderer'
import {
  PALETTE,
  resolveColors,
  type DataLayer,
  type DataLayerConfig,
  type FileLayer,
} from './config.ts'
import type { GeoJsonData } from './geojson.ts'

/** One layer of the map (fill, line or circle), without its source */
export type LayerSpec = MapLayerItem['layers'][number]

export type SourceSpec =
  | { type: 'geojson'; data: string | GeoJsonData }
  | { type: 'vector'; url: string }
  | { type: 'vector'; tiles: string[] }

/**
 * The draw of one data layer: one source, and for each source layer of vector tiles a fill, a line
 * and a circle layer (GeoJSON has one set without a source layer).
 */
export type DataLayerDraw = {
  sourceId: string
  source: SourceSpec
  sets: { sourceLayer: string | undefined; layers: LayerSpec[] }[]
}

/**
 * Whether the automated-run rule lets a layer load. Stored layers never do, nor a layer a link names (AGENTS.md, core
 * rule 1); files and local config do.
 */
export function allowedWhenAutomated(layer: DataLayer) {
  if (layer.origin === 'added' || layer.origin === 'link') return false
  if (layer.origin === 'file') return true
  return isLocalUrl(layer.url)
}

/**
 * Every layer in the order it is listed: the config's, then the ones a person added by URL, then the layer a link
 * names (at most one), then the files. Colours are settled over the whole list, so a layer keeps its colour while
 * others come and go.
 */
export function layersOf(
  config: readonly DataLayerConfig[],
  added: readonly DataLayerConfig[],
  files: readonly FileLayer[],
  linked: readonly DataLayerConfig[] = [],
) {
  const pending: (Omit<DataLayer, 'color'> & { color: string | undefined })[] = [
    ...config.map((layer) => ({ ...layer, color: layer.color, origin: 'config' as const })),
    ...added.map((layer) => ({ ...layer, color: layer.color, origin: 'added' as const })),
    ...linked.map((layer) => ({ ...layer, color: layer.color, origin: 'link' as const })),
    ...files.map((file) => ({
      id: file.id,
      name: file.name,
      kind: 'geojson' as const,
      url: '',
      color: file.color,
      data: file.data,
      origin: 'file' as const,
    })),
  ]
  const colors = resolveColors(pending.map((layer) => layer.color))
  return pending.map((layer, index) => ({ ...layer, color: colors[index] ?? PALETTE[0] }))
}

/** The layers to draw: not hidden, and allowed by the automated-run rule when it applies */
export function visibleLayers(
  layers: readonly DataLayer[],
  hidden: readonly string[],
  automated: boolean,
) {
  const off = new Set(hidden)
  return layers.filter((layer) => !off.has(layer.id) && (!automated || allowedWhenAutomated(layer)))
}

const SOURCE_PREFIX = 'data-layer:'

/**
 * The draw of one layer. Its `sourceLayers` are the vector layers to draw; a PMTiles layer without
 * them (read from the file, not known yet) draws nothing. Returns `undefined` when there is nothing to draw.
 */
export function layerDraw(layer: DataLayer): DataLayerDraw | undefined {
  const sourceId = `${SOURCE_PREFIX}${layer.id}`
  if (layer.kind === 'geojson') {
    return {
      sourceId,
      source: { type: 'geojson', data: layer.data ?? layer.url },
      sets: [{ sourceLayer: undefined, layers: layerSet(sourceId, layer.color) }],
    }
  }
  const names = layer.sourceLayers ?? []
  if (names.length === 0) return undefined
  const source: SourceSpec =
    layer.kind === 'pmtiles'
      ? { type: 'vector', url: `pmtiles://${layer.url}` }
      : { type: 'vector', tiles: [layer.url] }
  return {
    sourceId,
    source,
    sets: names.map((sourceLayer) => ({
      sourceLayer,
      layers: layerSet(sourceId, layer.color, sourceLayer),
    })),
  }
}

/** The fill, line and circle layers for one source (and one of its source layers) */
function layerSet(sourceId: string, color: string, sourceLayer?: string): LayerSpec[] {
  const base = sourceLayer === undefined ? sourceId : `${sourceId}/${sourceLayer}`
  const within = sourceLayer === undefined ? {} : { 'source-layer': sourceLayer }
  return [
    {
      id: `${base}:fill`,
      type: 'fill',
      ...within,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': color, 'fill-opacity': 0.2 },
    },
    {
      // polygons get their outline here too, so an area is visible without its fill
      id: `${base}:line`,
      type: 'line',
      ...within,
      filter: ['match', ['geometry-type'], ['LineString', 'Polygon'], true, false],
      paint: { 'line-color': color, 'line-width': 2 },
    },
    {
      id: `${base}:circle`,
      type: 'circle',
      ...within,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': color,
        'circle-radius': 4,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    },
  ]
}
