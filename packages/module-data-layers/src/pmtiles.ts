/**
 * PMTiles: reading the layer names of an archive, and registering the protocol that lets MapLibre
 * read `pmtiles://` sources.
 */
import type { RemoteFetch } from '@osm-editor-kit/maid-core'
import { queryOptions } from '@tanstack/react-query'
import { PMTiles, Protocol, TileType, type RangeResponse, type Source } from 'pmtiles'
import { z } from 'zod'

/** The part of an archive's metadata that is read. Other members are not checked. */
const metadataSchema = z.object({
  // a layer without a non-empty id is dropped on its own
  vector_layers: z
    .array(
      z
        .object({ id: z.string().min(1) })
        .nullable()
        .catch(null),
    )
    .catch([]),
})

/** The layer names in an archive's metadata (`vector_layers`), in order, without repeats */
export function sourceLayerNames(metadata: unknown) {
  const result = metadataSchema.safeParse(metadata)
  if (!result.success) return []
  const names = new Set<string>()
  for (const layer of result.data.vector_layers) if (layer !== null) names.add(layer.id)
  return [...names]
}

/**
 * An archive read through the editor's fetch: each range is one request through `send`, so the gate, the
 * time limit and the automation check apply. The library's default source calls the global fetch instead.
 */
class EditorSource implements Source {
  private readonly url: string
  private readonly send: RemoteFetch
  private readonly signal: AbortSignal | undefined

  constructor(url: string, send: RemoteFetch, signal: AbortSignal | undefined) {
    this.url = url
    this.send = send
    this.signal = signal
  }

  getKey(): string {
    return this.url
  }

  async getBytes(offset: number, length: number, _signal?: AbortSignal, etag?: string) {
    const headers: Record<string, string> = { Range: `bytes=${offset}-${offset + length - 1}` }
    if (etag) headers['If-Match'] = etag
    const response = await this.send(this.url, { headers, signal: this.signal })
    const data = await response.arrayBuffer()
    // a server that ignores the range answers 200 with the whole file: the part is cut here
    const part = response.status === 206 ? data : data.slice(offset, offset + length)
    const result: RangeResponse = { data: part }
    const tag = response.headers.get('ETag')
    if (tag) result.etag = tag
    return result
  }
}

async function readArchive(url: string, send: RemoteFetch, signal: AbortSignal | undefined) {
  const archive = new PMTiles(new EditorSource(url, send, signal))
  const header = await archive.getHeader()
  if (header.tileType !== TileType.Mvt) throw new Error('it does not hold vector tiles.')
  const names = sourceLayerNames(await archive.getMetadata())
  if (names.length === 0) throw new Error('it lists no vector layers in its metadata.')
  return names
}

/** The layer names of a PMTiles archive. Makes requests (ranges of the archive) through `send`. */
export function readPmtilesLayers(url: string, send: RemoteFetch, signal?: AbortSignal) {
  return readArchive(url, send, signal)
}

/**
 * The layer names of an archive, as a query per address. The header is read once per session; a failed
 * read is not retried (as before), and is tried again when the layer is shown again.
 */
export function pmtilesLayersOptions(url: string, send: RemoteFetch) {
  return queryOptions({
    queryKey: ['data-layers', 'pmtiles-layers', url] as const,
    queryFn: ({ signal }) => readPmtilesLayers(url, send, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}

/** The part of a MapLibre library object that registers protocols (its type leaves it out) */
type WithProtocols = {
  addProtocol?: (
    name: string,
    loader: (request: { url: string }, controller: AbortController) => Promise<unknown>,
  ) => void
}

/** Libraries (the object react-map-gl hands out) that have the protocol already */
const registered = new WeakSet<object>()

/**
 * Registers the `pmtiles` protocol with the map library, once per library object. This is the one
 * imperative MapLibre call of the package: `addProtocol` is a static of the library, not of a map,
 * and react-map-gl has no declarative form for it. It must run before a `pmtiles://` source is added.
 */
export function registerPmtilesProtocol(mapLib: object) {
  if (registered.has(mapLib)) return
  registered.add(mapLib)
  ;(mapLib as WithProtocols).addProtocol?.('pmtiles', new Protocol().tile)
}
