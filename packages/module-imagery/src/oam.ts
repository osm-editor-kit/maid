/**
 * The only file that calls the layer index's `/oam` entry: OpenAerialMap images, asked for live from HOT's STAC API
 * (api.imagery.hotosm.org) by the view, and drawn from HOT's TiTiler. Loaded with `import()` the first time it is
 * needed, as eli.ts. Unlike ELI the list is not bundled: each new view at zoom 12 or more is one request, made only
 * while the panel is open. The requests go through the editor's fetch, so its gate refuses them under automation
 * (AGENTS.md, core rule 1); the panel is off there anyway.
 */
import { HttpError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import type { OamLayer } from '@osm-editor-kit/maplibre-editor-layer-index/oam'
import type { Drawn } from './eli.ts'
import type { View } from './helpers.ts'

type Oam = typeof import('@osm-editor-kit/maplibre-editor-layer-index/oam')

/** From this zoom (OSM convention) on, the panel lists OpenAerialMap images: below it a view holds too many */
export const OAM_MIN_ZOOM = 12
/** The most images the panel lists for a view, newest first */
export const OAM_LIMIT = 50

let loaded: Oam | undefined

async function load(): Promise<Oam> {
  if (loaded === undefined) loaded = await import('@osm-editor-kit/maplibre-editor-layer-index/oam')
  return loaded
}

/** The editor's request function, set by the module's setup; read at each request (offset-protocol.ts does the same) */
let send: (() => RemoteFetch) | undefined

export function setOamFetch(get: () => RemoteFetch) {
  send = get
}

/**
 * The editor's fetch in the shape the package takes. The editor's fetch throws on an error status; the package wants
 * the status (a 404 is an unknown image, not a failure), so an `HttpError` becomes a response that is not ok.
 */
function oamFetch(url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) {
  if (send === undefined) throw new Error('The imagery module has not been set up')
  return send()(url, init).then(
    (response) => ({
      ok: true,
      status: response.status,
      json: () => response.json() as Promise<unknown>,
    }),
    (error: unknown) => {
      if (error instanceof HttpError) {
        return { ok: false, status: error.status, json: async (): Promise<unknown> => null }
      }
      throw error
    },
  )
}

/** The images in a view, newest first; none below `OAM_MIN_ZOOM` (no request is made then) */
export async function listOam(view: View, signal?: AbortSignal): Promise<OamLayer[]> {
  if (view.zoom < OAM_MIN_ZOOM) return []
  const oam = await load()
  const { layers } = await oam.searchOam(view.bounds, {
    limit: OAM_LIMIT,
    fetch: oamFetch,
    ...(signal ? { signal } : {}),
  })
  return layers
}

/** One image ready to draw (`oam:<item id>`), or `undefined` when the API does not know it */
export async function drawOam(value: string, background: boolean): Promise<Drawn | undefined> {
  const oam = await load()
  const itemId = oam.oamItemId(value)
  if (itemId === undefined) return undefined
  const layer = await oam.getOamItem(itemId, { fetch: oamFetch })
  if (layer === undefined) return undefined
  const sourceId = oam.oamSourceId(layer)
  return {
    id: value,
    name: oam.getOamImageryUsedValue(layer),
    sourceId,
    source: oam.getOamRasterSourceSpec(layer),
    // an empty paint, as ELI's specs have: the map layer passes the paint on, and MapLibre refuses `paint: undefined`
    layer: oam.getOamRasterLayerSpec(layer, { source: sourceId, paint: {} }),
    background,
    oam: layer,
  }
}

/** The query of an image's draw, shared by the map layer and the panel (which shows the chosen image's details) */
export function oamDrawQuery(id: string, background: boolean) {
  return {
    queryKey: ['imagery', 'oam', id, background] as const,
    queryFn: async () => (await drawOam(id, background)) ?? null,
  }
}
