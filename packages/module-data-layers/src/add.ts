/**
 * Adding a layer from the form: the checks of the form (no network), then the checks that need the
 * data (one request per layer, made only when a person adds it). Errors are plain sentences.
 */
import {
  checkDataLayerConfig,
  checkLayerUrl,
  parseSourceLayers,
  type Checked,
  type DataLayerConfig,
  type DataLayerKind,
  type FileLayer,
} from './config.ts'
import { parseGeoJson } from './geojson.ts'
import { readPmtilesLayers } from './pmtiles.ts'

export type AddInput = {
  name: string
  kind: DataLayerKind
  url: string
  /** Vector tiles: the source layers, separated by commas */
  sourceLayers: string
  color: string
  /** A GeoJSON file from the person's computer. When given, `url` is not used. */
  file?: File
}

export type Added = { kind: 'url'; layer: DataLayerConfig } | { kind: 'file'; layer: FileLayer }

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** The checks of the form that need no network */
export function checkAddInput(input: AddInput) {
  const errors: string[] = []
  if (input.name.trim() === '') errors.push('Give the layer a name.')
  if (input.file) {
    if (input.kind !== 'geojson')
      errors.push('A file can only be GeoJSON. Choose GeoJSON, or give an address instead.')
  } else {
    const urlError = checkLayerUrl(input.url, input.kind)
    if (urlError) errors.push(urlError)
  }
  if (!COLOR_PATTERN.test(input.color)) errors.push('Pick a colour.')
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

/** A request for the data itself; a failure to reach the server is said in plain words */
async function probe(url: string) {
  try {
    return await fetch(url)
  } catch (error) {
    throw describeFailure(error, 'The data')
  }
}

/**
 * The checks that need the data: GeoJSON is fetched and parsed, PMTiles has its header and layer
 * names read, vector tiles get one test tile. Returns the source layers the layer needs.
 */
async function checkRemote(input: AddInput, url: string) {
  if (input.kind === 'geojson') {
    const response = await probe(url)
    if (!response.ok) throw new Error(`The server answered ${response.status}.`)
    const parsed = parseGeoJson(await response.text())
    if (!parsed.ok) throw new Error(parsed.errors.join(' '))
    return undefined
  }
  if (input.kind === 'pmtiles') {
    try {
      return await readPmtilesLayers(url)
    } catch (error) {
      throw describeFailure(error, 'Could not read this PMTiles file')
    }
  }
  // Any answer to the test tile counts as reachable: a server may answer an empty tile with 404.
  const tile = url.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0')
  const response = await probe(tile)
  await response.body?.cancel()
  return parseSourceLayers(input.sourceLayers)
}

/**
 * Checks a layer the person typed or chose and turns it into what the module stores. Makes at most
 * one request per layer, and none when the form's own checks fail.
 */
export async function addDataLayer(input: AddInput): Promise<Checked<Added>> {
  const errors = checkAddInput(input)
  if (errors.length > 0) return { ok: false, errors }
  const name = input.name.trim()

  if (input.file) {
    let text: string
    try {
      text = await input.file.text()
    } catch {
      return { ok: false, errors: [`${input.file.name} could not be read.`] }
    }
    const parsed = parseGeoJson(text)
    if (!parsed.ok) return { ok: false, errors: [`${input.file.name}: ${parsed.errors.join(' ')}`] }
    const layer: FileLayer = {
      id: newLayerId('file'),
      name,
      color: input.color,
      data: parsed.value,
    }
    return { ok: true, value: { kind: 'file', layer } }
  }

  const url = input.url.trim()
  let sourceLayers: string[] | undefined
  try {
    sourceLayers = await checkRemote(input, url)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
  const checked = checkDataLayerConfig({
    id: newLayerId('user'),
    name,
    kind: input.kind,
    url,
    color: input.color,
    ...(sourceLayers !== undefined ? { sourceLayers } : {}),
  })
  if (!checked.ok) return { ok: false, errors: checked.errors }
  return { ok: true, value: { kind: 'url', layer: checked.value } }
}
