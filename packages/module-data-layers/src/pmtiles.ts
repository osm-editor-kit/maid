/**
 * PMTiles: reading the layer names of an archive, and registering the protocol that lets MapLibre
 * read `pmtiles://` sources.
 */
import { PMTiles, Protocol, TileType } from 'pmtiles'
import { isRecord } from './config.ts'

/** The layer names in an archive's metadata (`vector_layers`), in order, without repeats */
export function sourceLayerNames(metadata: unknown): string[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.vector_layers)) return []
  const names: string[] = []
  for (const layer of metadata.vector_layers) {
    if (
      isRecord(layer) &&
      typeof layer.id === 'string' &&
      layer.id !== '' &&
      !names.includes(layer.id)
    )
      names.push(layer.id)
  }
  return names
}

async function readArchive(url: string): Promise<string[]> {
  const archive = new PMTiles(url)
  const header = await archive.getHeader()
  if (header.tileType !== TileType.Mvt) throw new Error('it does not hold vector tiles.')
  const names = sourceLayerNames(await archive.getMetadata())
  if (names.length === 0) throw new Error('it lists no vector layers in its metadata.')
  return names
}

/** Cached per address: the header is read once. A failed read is forgotten, so it is tried again. */
const archives = new Map<string, Promise<string[]>>()

/** The layer names of a PMTiles archive. Makes requests to the archive's server (ranges of it). */
export function readPmtilesLayers(url: string): Promise<string[]> {
  const cached = archives.get(url)
  if (cached) return cached
  const read = readArchive(url)
  archives.set(url, read)
  read.catch(() => archives.delete(url))
  return read
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
export function registerPmtilesProtocol(mapLib: object): void {
  if (registered.has(mapLib)) return
  registered.add(mapLib)
  ;(mapLib as WithProtocols).addProtocol?.('pmtiles', new Protocol().tile)
}
