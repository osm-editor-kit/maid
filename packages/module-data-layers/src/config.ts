/**
 * What a data layer is, whether the editor's config brings it or a person adds it by URL or file:
 * the kinds, the checks every layer goes through, and the colours. Pure: no network, no React.
 */
import type { GeoJsonData } from './geojson.ts'

export const DATA_LAYER_KINDS = ['geojson', 'pmtiles', 'vector'] as const

export type DataLayerKind = (typeof DATA_LAYER_KINDS)[number]

export const KIND_LABEL: Record<DataLayerKind, string> = {
  geojson: 'GeoJSON',
  pmtiles: 'PMTiles',
  vector: 'Vector tiles',
}

/** A data layer as the editor's config (or a stored URL) gives it */
export type DataLayerConfig = {
  id: string
  name: string
  kind: DataLayerKind
  url: string
  /** `#rrggbb`. Without it the layer gets the next colour of the palette. */
  color?: string
  /** Vector tiles: the layers of the tiles to draw. PMTiles: read from the file when absent. */
  sourceLayers?: string[]
}

/** A GeoJSON file a person opened. Kept in memory only: it is gone after a reload. */
export type FileLayer = {
  id: string
  name: string
  color: string
  data: GeoJsonData
}

/** A layer as it is drawn: the config with its colour settled and where it came from */
export type DataLayer = {
  id: string
  name: string
  kind: DataLayerKind
  /** Empty for a file */
  url: string
  color: string
  sourceLayers?: string[]
  origin: 'config' | 'added' | 'file'
  data?: GeoJsonData
}

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDataLayerKind(value: unknown): value is DataLayerKind {
  return typeof value === 'string' && (DATA_LAYER_KINDS as readonly string[]).includes(value)
}

/** A path on the same server (`/data/x.geojson`), not a protocol-relative `//host/...` */
export function isSameServerPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//')
}

/** Whether an address points at this machine. Automated runs may load only these. */
export function isLocalUrl(url: string): boolean {
  if (isSameServerPath(url)) return true
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/** The reason an address cannot be used for a kind of layer, or `undefined` when it can */
export function checkLayerUrl(url: unknown, kind: DataLayerKind): string | undefined {
  if (typeof url !== 'string' || url.trim() === '') return 'Enter the address of the data.'
  const trimmed = url.trim()
  if (!isSameServerPath(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      return 'The address is not valid. It must start with https://.'
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return 'The address must start with https:// (or http://).'
  }
  if (kind === 'vector' && !['{z}', '{x}', '{y}'].every((part) => trimmed.includes(part)))
    return 'A vector tile address needs {z}, {x} and {y} in it.'
  return undefined
}

/** The kind an address most likely has: `.pmtiles` is PMTiles, `{z}` is vector tiles, else GeoJSON */
export function guessKind(url: string): DataLayerKind {
  const trimmed = url.trim()
  if (/\.pmtiles(?:[?#]|$)/i.test(trimmed)) return 'pmtiles'
  if (trimmed.includes('{z}')) return 'vector'
  return 'geojson'
}

/** Source layer names typed by a person: separated by commas, blanks and repeats dropped */
export function parseSourceLayers(text: string): string[] {
  const names: string[] = []
  for (const part of text.split(',')) {
    const name = part.trim()
    if (name !== '' && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Checks a layer from the editor's config or a stored one. Returns the layer with its fields
 * trimmed, or every reason it is not usable (in plain words).
 */
export function checkDataLayerConfig(input: unknown): Checked<DataLayerConfig> {
  if (!isRecord(input)) return { ok: false, errors: ['A data layer must be an object.'] }
  const { id, name, kind, url, color, sourceLayers } = input
  const errors: string[] = []
  if (typeof id !== 'string' || !ID_PATTERN.test(id))
    errors.push('The id must be 1 to 64 letters, digits, "-" or "_".')
  if (typeof name !== 'string' || name.trim() === '') errors.push('The name must not be empty.')
  if (!isDataLayerKind(kind)) errors.push(`The kind must be one of ${DATA_LAYER_KINDS.join(', ')}.`)
  if (isDataLayerKind(kind)) {
    const urlError = checkLayerUrl(url, kind)
    if (urlError) errors.push(urlError)
  }
  if (color !== undefined && (typeof color !== 'string' || !COLOR_PATTERN.test(color)))
    errors.push('The colour must be a hex value such as #d6007a.')
  let names: string[] | undefined
  if (sourceLayers !== undefined) {
    if (
      !Array.isArray(sourceLayers) ||
      !sourceLayers.every((item) => typeof item === 'string' && item.trim() !== '')
    ) {
      errors.push('The source layers must be a list of names.')
    } else {
      names = parseSourceLayers(sourceLayers.join(','))
    }
  }
  if (kind === 'vector' && (names === undefined || names.length === 0))
    errors.push('Vector tiles need the names of their source layers.')
  if (kind === 'geojson' && sourceLayers !== undefined)
    errors.push('Source layers only apply to vector tiles and PMTiles.')
  if (errors.length > 0) return { ok: false, errors }
  // every check above passed, so these narrow types are right
  const trimmedName = (name as string).trim()
  const value: DataLayerConfig = {
    id: id as string,
    name: trimmedName,
    kind: kind as DataLayerKind,
    url: (url as string).trim(),
    ...(typeof color === 'string' ? { color: color.toLowerCase() } : {}),
    ...(names !== undefined && kind !== 'geojson' ? { sourceLayers: names } : {}),
  }
  return { ok: true, value }
}

/**
 * The colours of the default palette: magenta, cyan, lime, orange, violet. None of them is one of
 * iD's feature colours.
 */
export const PALETTE = ['#d6007a', '#00a6c7', '#7bc31a', '#ff7a00', '#7c4dff'] as const

/** The first palette colour that no layer uses yet; after the palette runs out, the colours repeat */
export function pickColor(used: readonly string[]): string {
  const taken = new Set(used.map((color) => color.toLowerCase()))
  return (
    PALETTE.find((color) => !taken.has(color)) ??
    PALETTE[used.length % PALETTE.length] ??
    PALETTE[0]
  )
}

/**
 * Settles the colours of a list of layers, in order: a layer's own colour stays, a layer without
 * one gets the first palette colour that no layer uses (own colours of later layers included).
 */
export function resolveColors(colors: readonly (string | undefined)[]): string[] {
  const used = colors.filter((color): color is string => color !== undefined)
  return colors.map((color) => {
    if (color !== undefined) return color.toLowerCase()
    const picked = pickColor(used)
    used.push(picked)
    return picked
  })
}

/**
 * Checks the layers the editor's config gives: each one, and that no id is used twice. Throws with
 * every problem in one message, so a broken config is seen at once.
 */
export function checkConfigLayers(layers: readonly unknown[]): DataLayerConfig[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const valid: DataLayerConfig[] = []
  for (const input of layers) {
    const checked = checkDataLayerConfig(input)
    if (!checked.ok) {
      problems.push(checked.errors.join(' '))
      continue
    }
    if (ids.has(checked.value.id)) problems.push(`The id "${checked.value.id}" is used twice.`)
    ids.add(checked.value.id)
    valid.push(checked.value)
  }
  if (problems.length > 0) throw new Error(`Data layers: ${problems.join(' ')}`)
  return valid
}
