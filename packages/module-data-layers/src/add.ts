/**
 * Adding a layer from the form: the checks of the form (no network), then the checks that need the
 * data (one request per layer, made only when a person adds it). Errors are plain sentences.
 */
import { HttpError, RateLimitedError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { queryOptions } from '@tanstack/react-query'
import {
  checkDataLayerConfig,
  checkLayerUrl,
  colorSchema,
  GPX_PATTERN,
  KML_MESSAGE,
  KML_PATTERN,
  parseSourceLayers,
  type Checked,
  type DataLayerConfig,
  type DataLayerKind,
  type FileLayer,
} from './config.ts'
import { parseGeoJson, type GeoJsonData } from './geojson.ts'
import { isGpxText, isKmlText, parseGpx } from './gpx.ts'
import { readPmtilesLayers } from './pmtiles.ts'

export type AddInput = {
  name: string
  kind: DataLayerKind
  url: string
  /** Vector tiles: the source layers, separated by commas */
  sourceLayers: string
  color: string
  /** A GeoJSON or GPX file from the person's computer. When given, `url` is not used. */
  file?: File
}

export type Added = { kind: 'url'; layer: DataLayerConfig } | { kind: 'file'; layer: FileLayer }

/** The checks of the form that need no network */
export function checkAddInput(input: AddInput) {
  const errors: string[] = []
  if (input.name.trim() === '') errors.push('Give the layer a name.')
  if (input.file) {
    if (input.kind !== 'geojson' && input.kind !== 'gpx')
      errors.push(
        'A file can only be GeoJSON or GPX. Choose one of them, or give an address instead.',
      )
  } else {
    const urlError = checkLayerUrl(input.url, input.kind)
    if (urlError) errors.push(urlError)
  }
  if (!colorSchema.safeParse(input.color).success) errors.push('Pick a colour.')
  if (input.kind === 'vector' && !input.file && parseSourceLayers(input.sourceLayers).length === 0)
    errors.push('Vector tiles need the names of their source layers, separated by commas.')
  return errors
}

/** A new id for a layer added here. Not a secret, only unique enough within one browser. */
export function newLayerId(prefix: 'user' | 'file') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const UNREACHABLE =
  'the address could not be reached from this page. Check the address, and that the server allows requests from this site.'

/** Says what went wrong with a request, in plain words. A network error is a `TypeError`. */
export function describeFailure(error: unknown, what: string) {
  if (error instanceof TypeError) return new Error(`${what}: ${UNREACHABLE}`)
  return new Error(`${what}: ${error instanceof Error ? error.message : String(error)}`)
}

/**
 * A request for the data itself, through the editor's fetch (the `data` gate, the time limit). A failure to
 * reach the server is said in plain words. A non-2xx answer comes back as a response with its status, so the
 * checks below read it as before; the editor's fetch has already cancelled its body.
 */
async function probe(send: RemoteFetch, url: string): Promise<Response> {
  try {
    return await send(url)
  } catch (error) {
    if (error instanceof HttpError || error instanceof RateLimitedError) {
      return new Response(null, { status: error.status })
    }
    throw describeFailure(error, 'The data')
  }
}

/** The kind a text is read as, and its GeoJSON: a GPX file or a GeoJSON one, and KML is refused */
type ReadText = { kind: 'geojson' | 'gpx'; data: GeoJsonData }

/**
 * Reads the text of a file or of an address. KML is refused. GPX is read as GPX when the form says GPX, when the
 * name is `.gpx`, or when the text is GPX XML; anything else is GeoJSON. `name` is a file name or an address.
 */
async function readText(
  text: string,
  name: string,
  gpxChosen: boolean,
): Promise<Checked<ReadText>> {
  if (KML_PATTERN.test(name) || isKmlText(text)) return { ok: false, errors: [KML_MESSAGE] }
  if (gpxChosen || GPX_PATTERN.test(name) || isGpxText(text)) {
    const gpx = await parseGpx(text)
    return gpx.ok ? { ok: true, value: { kind: 'gpx', data: gpx.value } } : gpx
  }
  const geojson = parseGeoJson(text)
  return geojson.ok ? { ok: true, value: { kind: 'geojson', data: geojson.value } } : geojson
}

/**
 * The checks that need the data: GeoJSON and GPX are fetched and read (a GeoJSON address that answers with GPX is
 * a GPX layer), PMTiles has its header and layer names read, vector tiles get one test tile. Returns the kind the
 * layer has and the source layers it needs.
 */
async function checkRemote(
  send: RemoteFetch,
  input: AddInput,
  url: string,
): Promise<{ kind: DataLayerKind; sourceLayers?: string[] }> {
  if (input.kind === 'geojson' || input.kind === 'gpx') {
    const response = await probe(send, url)
    if (!response.ok) throw new Error(`The server answered ${response.status}.`)
    const read = await readText(await response.text(), url, input.kind === 'gpx')
    if (!read.ok) throw new Error(read.errors.join(' '))
    return { kind: read.value.kind }
  }
  if (input.kind === 'pmtiles') {
    try {
      return { kind: 'pmtiles', sourceLayers: await readPmtilesLayers(url, send) }
    } catch (error) {
      throw describeFailure(error, 'Could not read this PMTiles file')
    }
  }
  // Any answer to the test tile counts as reachable: a server may answer an empty tile with 404.
  const tile = url.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0')
  const response = await probe(send, tile)
  await response.body?.cancel()
  return { kind: 'vector', sourceLayers: parseSourceLayers(input.sourceLayers) }
}

/**
 * The data of a GPX layer's address, for the map. A layer keeps its address, not its data, so the map reads it again
 * here (once per address, through the editor's fetch). Throws with the reason in plain words.
 */
export async function readGpxAddress(url: string, send: RemoteFetch): Promise<GeoJsonData> {
  const response = await probe(send, url)
  if (!response.ok) throw new Error(`The server answered ${response.status}.`)
  const read = await parseGpx(await response.text())
  if (!read.ok) throw new Error(read.errors.join(' '))
  return read.value
}

/** The query of a GPX address's data. Kept for the session, like the PMTiles reads (`pmtilesLayersOptions`). */
export function gpxAddressOptions(url: string, send: RemoteFetch) {
  return queryOptions({
    queryKey: ['data-layers', 'gpx', url] as const,
    queryFn: () => readGpxAddress(url, send),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}

/**
 * Checks a layer the person typed or chose and turns it into what the module stores. Makes at most
 * one request per layer, through `send` (the editor's fetch), and none when the form's own checks fail.
 */
export async function addDataLayer(input: AddInput, send: RemoteFetch): Promise<Checked<Added>> {
  const errors = checkAddInput(input)
  if (errors.length > 0) return { ok: false, errors }
  const name = input.name.trim()

  if (input.file) {
    const file = input.file
    let text: string
    try {
      text = await file.text()
    } catch {
      return { ok: false, errors: [`${file.name} could not be read.`] }
    }
    const read = await readText(text, file.name, input.kind === 'gpx')
    if (!read.ok) return { ok: false, errors: [`${file.name}: ${read.errors.join(' ')}`] }
    const layer: FileLayer = {
      id: newLayerId('file'),
      name,
      color: input.color,
      data: read.value.data,
    }
    return { ok: true, value: { kind: 'file', layer } }
  }

  const url = input.url.trim()
  let found: { kind: DataLayerKind; sourceLayers?: string[] }
  try {
    found = await checkRemote(send, input, url)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
  const checked = checkDataLayerConfig({
    id: newLayerId('user'),
    name,
    kind: found.kind,
    url,
    color: input.color,
    ...(found.sourceLayers !== undefined ? { sourceLayers: found.sourceLayers } : {}),
  })
  if (!checked.ok) return { ok: false, errors: checked.errors }
  return { ok: true, value: { kind: 'url', layer: checked.value } }
}
