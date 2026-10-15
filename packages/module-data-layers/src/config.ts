/**
 * What a data layer is, whether the editor's config brings it or a person adds it by URL or file:
 * the kinds, the one schema every layer is checked with, and the colours. Pure: no network, no React.
 */
import { z } from 'zod'
import type { GeoJsonData } from './geojson.ts'

export const DATA_LAYER_KINDS = ['geojson', 'gpx', 'pmtiles', 'vector'] as const

export type DataLayerKind = (typeof DATA_LAYER_KINDS)[number]

export const KIND_LABEL: Record<DataLayerKind, string> = {
  geojson: 'GeoJSON',
  gpx: 'GPX',
  pmtiles: 'PMTiles',
  vector: 'Vector tiles',
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const KIND_MESSAGE = `The kind must be one of ${DATA_LAYER_KINDS.join(', ')}.`
const OBJECT_MESSAGE = 'A data layer must be an object.'
const ENTER_ADDRESS = 'Enter the address of the data.'
const NOT_VALID_ADDRESS = 'The address is not valid. It must start with https://.'
const NOT_HTTP_ADDRESS = 'The address must start with https:// (or http://).'
const TEMPLATE_ADDRESS = 'A vector tile address needs {z}, {x} and {y} in it.'
const LIST_MESSAGE = 'The source layers must be a list of names.'
const NEED_SOURCE_LAYERS = 'Vector tiles need the names of their source layers.'
const ID_MESSAGE = 'The id must be 1 to 64 letters, digits, "-" or "_".'
const NAME_MESSAGE = 'The name must not be empty.'
const COLOR_MESSAGE = 'The colour must be a hex value such as #d6007a.'
const ONLY_VECTOR_AND_PMTILES = 'Source layers only apply to vector tiles and PMTiles.'
/** KML is not read. Refused before any request, for an address that names it and for a file or response that is KML. */
export const KML_MESSAGE = 'KML is not supported. Use a GPX or GeoJSON file instead.'
/** A GPX address or file name, with an optional query or fragment (`track.gpx?x=1`) */
export const GPX_PATTERN = /\.gpx(?:[?#]|$)/i
/** A KML address or file name, read as the same as GPX_PATTERN */
export const KML_PATTERN = /\.kml(?:[?#]|$)/i

/** A `#rrggbb` colour in any case. Stored in lower case. */
export const colorSchema = z
  .string({ error: COLOR_MESSAGE })
  .regex(COLOR_PATTERN, { error: COLOR_MESSAGE })
  .toLowerCase()

/** A path on the same server (`/data/x.geojson`), not a protocol-relative `//host/...` */
export function isSameServerPath(url: string) {
  return url.startsWith('/') && !url.startsWith('//')
}

/**
 * An address, trimmed: an https or http URL, or a path on the same server. The message says what
 * is wrong with the text: empty, not a URL at all, or another scheme.
 */
const address = z
  .string({ error: ENTER_ADDRESS })
  .trim()
  .pipe(
    z.union([z.string().refine(isSameServerPath), z.url({ protocol: /^https?$/ })], {
      error: (issue) => {
        const text = String(issue.input)
        if (text === '') return ENTER_ADDRESS
        // a readable address with another scheme (`ftp:`, `javascript:`) is named as such
        return URL.canParse(text) && !/^https?:/i.test(text) ? NOT_HTTP_ADDRESS : NOT_VALID_ADDRESS
      },
    }),
  )
  .refine((text) => !KML_PATTERN.test(text), { error: KML_MESSAGE })

/** Vector tiles also need the `{z}`, `{x}` and `{y}` template in the address */
const vectorAddress = address.refine(
  (text) => ['{z}', '{x}', '{y}'].every((part) => text.includes(part)),
  { error: TEMPLATE_ADDRESS },
)

/** The reason an address cannot be used for a kind of layer, or `undefined` when it can */
export function checkLayerUrl(url: unknown, kind: DataLayerKind) {
  const result = (kind === 'vector' ? vectorAddress : address).safeParse(url)
  return result.success ? undefined : result.error.issues[0]?.message
}

/**
 * The kind an address most likely has: `.pmtiles` is PMTiles, `.gpx` is GPX, `{z}` is vector tiles, else GeoJSON.
 * A GeoJSON address that answers with GPX is read as GPX too (add.ts).
 */
export function guessKind(url: string): DataLayerKind {
  const trimmed = url.trim()
  if (/\.pmtiles(?:[?#]|$)/i.test(trimmed)) return 'pmtiles'
  if (GPX_PATTERN.test(trimmed)) return 'gpx'
  if (trimmed.includes('{z}')) return 'vector'
  return 'geojson'
}

/** Source layer names typed by a person: separated by commas, blanks and repeats dropped */
export function parseSourceLayers(text: string) {
  const names: string[] = []
  for (const part of text.split(',')) {
    const name = part.trim()
    if (name !== '' && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * A list of source layer names. Each item must be text that is not blank; the list is then read
 * as a typed string (see `parseSourceLayers`). `missing` is said when the list is absent.
 */
function sourceLayerList(missing: string) {
  return z
    .array(
      z
        .string({ error: LIST_MESSAGE })
        .refine((item) => item.trim() !== '', { error: LIST_MESSAGE }),
      {
        error: (issue) => (issue.input === undefined ? missing : LIST_MESSAGE),
      },
    )
    .transform((items) => parseSourceLayers(items.join(',')))
}

/** The fields every kind of layer has */
const layerFields = {
  id: z.string({ error: ID_MESSAGE }).regex(ID_PATTERN, { error: ID_MESSAGE }),
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, { error: NAME_MESSAGE }),
  color: colorSchema.optional(),
  sourceLayers: sourceLayerList(LIST_MESSAGE).optional(),
}

/**
 * A data layer as the editor's config, a stored entry or the form gives it. One schema for all
 * three: GeoJSON and GPX layers have no source layers, vector tiles need them, PMTiles may list them.
 * Anything that is not an object (`null` and arrays too) is refused first, with its own message.
 */
export const dataLayerSchema = z.looseObject({}, { error: OBJECT_MESSAGE }).pipe(
  z.discriminatedUnion(
    'kind',
    [
      z.object({
        ...layerFields,
        kind: z.literal('geojson'),
        url: address,
        sourceLayers: z.undefined({ error: ONLY_VECTOR_AND_PMTILES }).optional(),
      }),
      z.object({
        ...layerFields,
        kind: z.literal('gpx'),
        url: address,
        sourceLayers: z.undefined({ error: ONLY_VECTOR_AND_PMTILES }).optional(),
      }),
      z.object({
        ...layerFields,
        kind: z.literal('pmtiles'),
        url: address,
      }),
      z.object({
        ...layerFields,
        kind: z.literal('vector'),
        url: vectorAddress,
        sourceLayers: sourceLayerList(NEED_SOURCE_LAYERS).refine((names) => names.length > 0, {
          error: NEED_SOURCE_LAYERS,
        }),
      }),
    ],
    { error: KIND_MESSAGE },
  ),
)

/** A data layer as the editor's config (or a stored URL) gives it */
export type DataLayerConfig = z.infer<typeof dataLayerSchema>

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
  /** `link`: the address a URL names (`?data=`); not stored, shown while the URL names it */
  origin: 'config' | 'added' | 'file' | 'link'
  data?: GeoJsonData
}

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/** The fields alone, for an unknown kind, where the union cannot look at them */
const commonFields = z.object(layerFields)

/** The order in which the messages name the fields */
const FIELD_ORDER = ['id', 'name', 'kind', 'url', 'color', 'sourceLayers']

function fieldRank(field: PropertyKey | undefined) {
  const index = FIELD_ORDER.indexOf(String(field))
  return index === -1 ? FIELD_ORDER.length : index
}

/**
 * Checks a layer from the editor's config, the form or the stored state. Returns the layer with its
 * fields trimmed, or every reason it is not usable (in plain words).
 */
export function checkDataLayerConfig(input: unknown): Checked<DataLayerConfig> {
  const result = dataLayerSchema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  // An unknown kind stops the union at the kind. The other fields are checked on their own too, so
  // every reason is named.
  const issues = [...result.error.issues]
  if (issues.some((issue) => issue.path[0] === 'kind')) {
    const fields = commonFields.safeParse(input)
    if (!fields.success) issues.push(...fields.error.issues)
  }
  // in the order of the fields, as the messages have always come
  issues.sort((a, b) => fieldRank(a.path[0]) - fieldRank(b.path[0]))
  return { ok: false, errors: issues.map((issue) => issue.message) }
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
export function resolveColors(colors: readonly (string | undefined)[]) {
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
export function checkConfigLayers(layers: readonly unknown[]) {
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
