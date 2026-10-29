import { toMapZoom } from '@osm-editor-kit/maid-core'
/**
 * The only file that calls the ELI package. It is loaded with `import()` the first time a person
 * opens the panel or chooses an imagery layer, so the layer index is not in the app's start-up
 * code. The data is bundled in the package: these calls send no request to OSM or any other
 * server. Only the tiles of a chosen layer are requested, from the layer's own server.
 */
import type {
  EliLayer,
  EliLayerEntry,
  RasterLayerSpec,
  RasterSourceSpec,
} from '@osm-editor-kit/maplibre-editor-layer-index'
import type { OamLayer } from '@osm-editor-kit/maplibre-editor-layer-index/oam'
import { bestIds, coverageFromBoxes, type Coverage } from './coverage.ts'
import { visibleAtZoom, type Listing, type View } from './helpers.ts'

type Eli = typeof import('@osm-editor-kit/maplibre-editor-layer-index')

/** The package once it has loaded: `knownLayer` reads it synchronously, after the start order has waited for it */
let loaded: Eli | undefined

async function load(): Promise<Eli> {
  if (loaded === undefined) loaded = await import('@osm-editor-kit/maplibre-editor-layer-index')
  return loaded
}

/**
 * Whether the index has a layer with this id. False until the package has loaded, which the start order waits for:
 * the URL's id is then judged once the index is there.
 */
export function knownLayer(id: string): boolean {
  return loaded?.getLayer(id) !== undefined
}

/**
 * The best backgrounds that cover more than half of the view, in the order of the list (iD takes the first). Judged
 * by the boxes of the index, so no coverage is downloaded (coverage.ts).
 */
export async function bestBackgrounds(items: readonly Listing[], view: View): Promise<string[]> {
  await load()
  const candidates: { id: string; coverage: Coverage | undefined }[] = []
  for (const item of items) {
    if (!item.best || item.overlay) continue
    candidates.push({ id: item.id, coverage: boxesOf(item.id) })
  }
  return bestIds(candidates, view.bounds)
}

/**
 * The coverage of a layer as the boxes of the index, `undefined` for a worldwide one or one the index does not know
 * (as ELI's `getGeometry`). The polygons are not loaded: see coverage.ts.
 */
export async function coverageOf(id: string): Promise<Coverage | undefined> {
  await load()
  return boxesOf(id)
}

function boxesOf(id: string): Coverage | undefined {
  const row = loaded?.getLayer(id)
  if (row === undefined || row.geometryId === 'world') return undefined
  return coverageFromBoxes(row.bboxes)
}

/** The name of a layer as the index gives it, for the person to read: the id when the index does not know it */
export function layerName(id: string): string {
  return loaded?.getLayer(id)?.name ?? id
}

/**
 * A style layer's `minzoom` is compared with the map's zoom (512 px), but ELI's `minzoom` is in OSM
 * zoom (256 px), so it is converted here. The layer then appears at the view ELI means. The
 * source keeps ELI's value: a source's zooms are tile zooms, which MapLibre maps itself for a
 * `tileSize` of 256. Never below 0.
 */
export function withMapMinzoom<T extends { minzoom?: number }>(layer: T): T {
  if (layer.minzoom === undefined) return layer
  return { ...layer, minzoom: Math.max(0, toMapZoom(layer.minzoom)) }
}

/** A layer ready for react-map-gl: its source and its layer, with the id `eli-<id>` (`oam-<item id>` for an OpenAerialMap image) */
export type Drawn = {
  /** ELI's id of the layer */
  id: string
  /** The name iD cites for it in `imagery_used` (ELI's `getImageryUsedValue`: the index name, else the id) */
  name: string
  sourceId: string
  source: RasterSourceSpec
  layer: RasterLayerSpec
  /** The background, drawn with the brightness setting; overlays are not */
  background: boolean
  /** The image's details, for an OpenAerialMap image (oam.ts) */
  oam?: OamLayer
}

function toListing(layer: EliLayer): Listing {
  return {
    id: layer.id,
    name: layer.name,
    category: layer.category,
    best: layer.best,
    overlay: layer.overlay,
    minzoom: layer.minzoom,
    group: layer.group,
    attributionText: layer.attributionText,
    worldwide: layer.continents.includes('world'),
    startDate: layer.startDate,
    endDate: layer.endDate,
    attributionUrl: layer.attributionUrl,
    licenseUrl: layer.licenseUrl,
  }
}

/** What the panel lists for a view: every layer at this zoom, and the backgrounds as time series */
export type Listed = {
  /** The layers that cover the view at this zoom, overlays too; the stored choice is looked up here */
  items: Listing[]
  /** The backgrounds at this zoom, one entry per series (ELI's `groupLayers`, see `series.ts`) */
  series: EliLayerEntry<Listing>[]
}

/**
 * The layers that cover the view, with their attribution. Layers that need an API key are left out,
 * because no key is given. Loads the details the layers are filed under, from the package.
 *
 * Series are made after the zoom filter, so a series offers only the dates that cover the view and
 * show at this zoom.
 */
export async function listView(view: View): Promise<Listed> {
  const eli = await load()
  const layers = await eli.loadLayersInViewport(view.bounds)
  const items = layers.map(toListing).filter((item) => visibleAtZoom(item, view.zoom))
  const series = eli.groupLayers(items.filter((item) => !item.overlay))
  return { items, series }
}

/**
 * The layers that cover the view at this zoom, as `listView` lists them, from the index's always-loaded rows alone:
 * no details (attribution, dates, series) and so no continent's details file (0.74 MB for Europe). The start order and
 * the switch on a map move need only the ids, `best`, `overlay` and `minzoom`; the panel uses `listView`.
 */
export async function listViewRows(view: View): Promise<Listed> {
  const eli = await load()
  const items = eli
    .layersInViewport(view.bounds)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      best: row.best,
      overlay: row.overlay,
      minzoom: row.minzoom,
      worldwide: row.continents.includes('world'),
    }))
    .filter((item) => visibleAtZoom(item, view.zoom))
  return { items, series: [] }
}

/**
 * The layers with these ids, whatever the view: the overlays that are on now are listed even where they do not
 * cover the view (iD lists the sources in use this way). An id the index does not know is left out.
 */
export async function listLayers(ids: readonly string[]): Promise<Listing[]> {
  const eli = await load()
  const layers = await Promise.all(ids.map((id) => eli.getLayerHydrated(id)))
  return layers.flatMap((layer) => (layer === undefined ? [] : [toListing(layer)]))
}

/**
 * One layer ready to draw, or `undefined` when it is unknown or needs an API key. The raster
 * source carries ELI's attribution, which MapLibre's attribution control shows.
 */
export async function drawLayer(id: string, background: boolean): Promise<Drawn | undefined> {
  const eli = await load()
  const layer = await eli.getLayerHydrated(id)
  if (!layer || layer.requiresKeys.length > 0) return undefined
  const sourceId = eli.eliSourceId(layer)
  return {
    id: layer.id,
    name: eli.getImageryUsedValue(layer),
    sourceId,
    source: eli.getRasterSourceSpec(layer),
    layer: withMapMinzoom(eli.getRasterLayerSpec(layer, { source: sourceId })),
    background,
  }
}
