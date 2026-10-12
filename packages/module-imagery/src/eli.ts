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
import type { Listing } from './helpers.ts'

const load = () => import('@osm-editor-kit/maplibre-editor-layer-index')

/** A layer ready for react-map-gl: its source and its layer, with the id `eli-<id>` */
export type Drawn = {
  sourceId: string
  source: RasterSourceSpec
  layer: RasterLayerSpec
  /** The background, drawn with the brightness setting; overlays are not */
  background: boolean
}

function toListing(layer: EliLayer): Listing {
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
export async function listView(bounds: BBox): Promise<Listing[]> {
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
    sourceId,
    source: eli.getRasterSourceSpec(layer),
    layer: eli.getRasterLayerSpec(layer, { source: sourceId }),
    background,
  }
}
