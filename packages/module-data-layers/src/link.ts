/**
 * A data layer a link names (`?data=<address>`). The address in the URL is the state: the layer is shown while the
 * URL names it, and removing it clears the parameter. Nothing is stored, so a link alone never writes storage
 * (docs/research/url-state-audit.md, section 1.1).
 *
 * The layer is loaded once per address, through the module's own add path (`addDataLayer`, which checks the
 * address through the editor's fetch, so the `data` gate and the time limit apply), as a TanStack Query on the
 * editor's client. The map draws it when the query has a result.
 */
import { isAutomated, type RemoteFetch, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { addDataLayer } from './add.ts'
import { guessKind, pickColor, type DataLayerConfig, type FileLayer } from './config.ts'
import { linkedLayerId, linkedLayerName } from './url.ts'

/**
 * Whether a link may load its layer now. Under automation (AGENTS.md, core rule 1) nothing remote is loaded from a
 * link, so the benchmark browser and the checks never fetch the address. A person's browser loads it.
 */
export function linkMayLoad(url: string | null, automated: boolean) {
  if (automated) return false
  return url !== null && url !== ''
}

/**
 * The layer of one address, checked through `send` (one request for GeoJSON, the header for PMTiles). Throws with the
 * reason in plain words when the address does not give a layer. The id is the address's own (`linkedLayerId`).
 */
export async function loadLinkedLayer(
  url: string,
  send: RemoteFetch,
  color: string,
): Promise<DataLayerConfig> {
  const result = await addDataLayer(
    { name: linkedLayerName(url), kind: guessKind(url), url, sourceLayers: '', color },
    send,
  )
  if (!result.ok) throw new Error(result.errors.join(' '))
  if (result.value.kind !== 'url') throw new Error('A link names an address, not a file.')
  return { ...result.value.layer, id: linkedLayerId(url) }
}

/** The query of one address. Kept for the session, like the PMTiles reads (`pmtilesLayersOptions`). */
export function linkedLayerOptions(url: string, send: RemoteFetch, color: string) {
  return queryOptions({
    queryKey: ['data-layers', 'link', url] as const,
    queryFn: () => loadLinkedLayer(url, send, color),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}

/** The colours of the layers a person or the config has, so a linked layer gets one of the others not in use */
export function colorsInUse(
  config: readonly DataLayerConfig[],
  added: readonly DataLayerConfig[],
  files: readonly FileLayer[],
): string[] {
  return [...config, ...added, ...files].flatMap((layer) => (layer.color ? [layer.color] : []))
}

/**
 * The layer a link names, and the address and the way to remove it. `load` is false in the panel: it reads the
 * query the map runs, and never starts a load of its own.
 */
export function useLinkedLayer(
  handle: UrlParamHandle<string>,
  send: RemoteFetch,
  inUse: readonly string[],
  options: { load: boolean },
) {
  const [url, setUrl] = useUrlParam(handle)
  const color = pickColor([...inUse])
  const query = useQuery({
    ...linkedLayerOptions(url ?? '', send, color),
    enabled: options.load && linkMayLoad(url, isAutomated()),
  })
  const error = url !== null && query.error ? describe(query.error) : undefined
  return { url, setUrl, layer: url ? query.data : undefined, error }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
