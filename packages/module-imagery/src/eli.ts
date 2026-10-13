/**
 * The only file that calls the ELI package. It is loaded with `import()` the first time a person
 * opens the panel or chooses an imagery layer, so the layer index is not in the app's start-up
 * code. The data is bundled in the package: these calls send no request to OSM or any other
 * server. Only the tiles of a chosen layer are requested, from the layer's own server.
 */
import type {
  BBox,
  EliLayer,
  RasterLayerSpec,
  RasterSourceSpec,
} from '@osm-editor-kit/maplibre-editor-layer-index'
import { toMapZoom } from './helpers.ts'

const load = () => import('@osm-editor-kit/maplibre-editor-layer-index')

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

/** A layer ready for react-map-gl: its source and its layer, with the id `eli-<id>` */
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
}

function toListing(layer: EliLayer) {
  return {
    id: layer.id,
    name: layer.name,
    category: layer.category,
    best: layer.best,
    overlay: layer.overlay,
    minzoom: layer.minzoom,
    attributionText: layer.attributionText,
  }
}

/**
 * The layers that cover the viewport, with their attribution. Layers that need an API key are
 * left out, because no key is given. Loads the details of the continent in view from the package.
 */
export async function listView(bounds: BBox) {
  const eli = await load()
  const layers = await eli.loadLayersInViewport(bounds)
  return layers.map(toListing)
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
