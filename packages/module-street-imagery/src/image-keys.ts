/**
 * The image keys of a feature (`mapillary`, `cycleway:right:traffic_sign:mapillary`, `panoramax`…), the ids in
 * their values, and the rules of "Use this photo". Pure: no React, no store, no network.
 *
 * A value is one or more photo ids separated by `;`. The key grammar follows the Radnetz fork (WORKDOC feature 19):
 * `[source:][cycleway|sidewalk[:left|:right|:both]:][traffic_sign[:forward|:backward]:]mapillary[:forward|:backward|:<n>]`.
 */

/** The field type the module registers on `inspector.field` (one type for every image key). */
export const STREET_IMAGES_FIELD_TYPE = 'streetImages'

export type ImageProvider = 'mapillary' | 'panoramax'

type Tags = Readonly<Record<string, string>>

/** Groups: source, base, side, traffic sign, sign direction, suffix (`forward`, `backward` or a number). */
const MAPILLARY_PATTERN =
  /^(source:)?(?:(cycleway|sidewalk)(?::(left|right|both))?:)?(?:(traffic_sign)(?::(forward|backward))?:)?mapillary(?::(forward|backward|\d{1,3}))?$/
const PANORAMAX_PATTERN = /^panoramax(?::\d{1,3})?$/

const SIDES = ['left', 'right', 'both'] as const
const WAY_PREFIXES = [
  '',
  ...['cycleway', 'sidewalk'].flatMap((base) => [
    `${base}:`,
    ...SIDES.map((side) => `${base}:${side}:`),
  ]),
]
const SIGN_PREFIXES = ['', 'traffic_sign:', 'traffic_sign:forward:', 'traffic_sign:backward:']
const SOURCE_PREFIXES = ['', 'source:']
const DIRECTION_SUFFIXES = ['', ':forward', ':backward']

/** Every Mapillary key of the grammar without numbers (`:<n>` is not listed, see isImageKey). */
const MAPILLARY_KEYS = SOURCE_PREFIXES.flatMap((source) =>
  WAY_PREFIXES.flatMap((way) =>
    SIGN_PREFIXES.flatMap((sign) =>
      DIRECTION_SUFFIXES.map((direction) => `${source}${way}${sign}mapillary${direction}`),
    ),
  ),
)

/**
 * The keys the field offers and shows: the listed Mapillary keys, then the Panoramax ones. The package's tag
 * filter only knows exact keys, so the field lists them all here; a numbered key that is not listed shows in the
 * field once it is tagged there, or when the field is shown for another key.
 */
export const IMAGE_KEYS: readonly string[] = [
  ...MAPILLARY_KEYS,
  'panoramax',
  'panoramax:0',
  'panoramax:1',
  'panoramax:2',
]

const ORDER = new Map(IMAGE_KEYS.map((key, index) => [key, index]))

/** Which provider a key's photos come from, or null for a key that is no image key. */
export function providerOfKey(key: string) {
  if (MAPILLARY_PATTERN.test(key)) return 'mapillary'
  if (PANORAMAX_PATTERN.test(key)) return 'panoramax'
  return null
}

export function isImageKey(key: string) {
  return providerOfKey(key) !== null
}

/** The key a photo of this provider is written to when no other key is the target. */
export function defaultKey(provider: ImageProvider) {
  return provider === 'mapillary' ? 'mapillary' : 'panoramax'
}

/**
 * A short label for a key, from its parts: "Right bike lane · traffic sign (source)". Not translated; the
 * key itself is shown next to it.
 */
export function keyLabel(key: string) {
  const provider = providerOfKey(key)
  if (provider === 'panoramax') {
    const number = key.match(/:(\d+)$/)?.[1]
    return number === undefined ? 'Panoramax' : `Panoramax ${number}`
  }
  const match = key.match(MAPILLARY_PATTERN)
  if (!match) return key
  const [, source, base, side, sign, signDirection, suffix] = match
  const sideText =
    side === 'both' ? 'Both sides' : side === undefined ? undefined : capitalize(side)
  const baseText = base === 'cycleway' ? 'bike lane' : base === 'sidewalk' ? 'sidewalk' : undefined
  const head =
    baseText === undefined ? undefined : capitalize([sideText, baseText].filter(Boolean).join(' '))
  const signText =
    sign === undefined ? undefined : ['traffic sign', signDirection].filter(Boolean).join(' ')
  const suffixText =
    suffix === undefined ? undefined : /^\d+$/.test(suffix) ? `no. ${suffix}` : suffix
  // a photo of the way itself, when neither a bike lane, a sidewalk nor a sign names it
  const way = head === undefined && signText === undefined ? 'Way' : undefined
  const parts = [head ?? way, signText, suffixText].filter(
    (part): part is string => part !== undefined,
  )
  const text = parts.join(' · ')
  return source === undefined ? text : `${text} (source)`
}

function capitalize(text: string) {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`
}

/** The ids of a value: split at `;`, trimmed, empty parts dropped, order kept. */
export function splitIds(value: string | undefined) {
  return (value ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function joinIds(ids: readonly string[]) {
  return ids.join(';')
}

export function hasId(value: string | undefined, id: string) {
  return splitIds(value).includes(id)
}

/** The value with `id` added at the end, unless it is there already (then the value is unchanged). */
export function appendId(value: string | undefined, id: string) {
  const ids = splitIds(value)
  return ids.includes(id) ? joinIds(ids) : joinIds([...ids, id])
}

/** The value without `id`. Undefined when no id is left: the tag is then removed. */
export function removeId(value: string | undefined, id: string) {
  const ids = splitIds(value).filter((item) => item !== id)
  return ids.length === 0 ? undefined : joinIds(ids)
}

/**
 * The keys of the feature that have a value, in the field's order (the offered keys first, then any other image
 * key of the tags, by name).
 */
export function imageKeysWithValue(tags: Tags) {
  return Object.keys(tags)
    .filter((key) => isImageKey(key) && splitIds(tags[key]).length > 0)
    .sort((a, b) => {
      const byOrder =
        (ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) - (ORDER.get(b) ?? Number.MAX_SAFE_INTEGER)
      return byOrder !== 0 ? byOrder : a.localeCompare(b)
    })
}

const MAPILLARY_ID = /^\d{1,30}$/
const PANORAMAX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The photo id that a typed or pasted text stands for: an id, or a link to the photo on the provider's site
 * (`https://www.mapillary.com/app/?pKey=…`, `…/map/im/…`; a Panoramax `#pic=…` or `?pic=…`). Anything else is an error
 * with the reason. Nothing is requested.
 */
export function idFromText(
  provider: ImageProvider,
  text: string,
): { id: string } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { error: 'Type an id or paste a link' }
  if (/^https?:\/\//i.test(trimmed)) return idFromLink(provider, trimmed)
  if (provider === 'mapillary') {
    return MAPILLARY_ID.test(trimmed) ? { id: trimmed } : { error: 'Not a Mapillary id' }
  }
  return PANORAMAX_ID.test(trimmed)
    ? { id: trimmed.toLowerCase() }
    : { error: 'Not a Panoramax id' }
}

function idFromLink(provider: ImageProvider, link: string) {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return { error: 'Not a link' }
  }
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (provider === 'mapillary') {
    if (!/(^|\.)mapillary\.com$/i.test(url.hostname)) return { error: 'Not a Mapillary link' }
    const id =
      query.get('pKey') ??
      hash.get('pKey') ??
      url.pathname.match(/\/(?:map\/im|photo)\/(\d+)/)?.[1] ??
      null
    return id !== null && MAPILLARY_ID.test(id)
      ? { id }
      : { error: 'No Mapillary photo in this link' }
  }
  const id = query.get('pic') ?? hash.get('pic')
  return id !== null && PANORAMAX_ID.test(id)
    ? { id: id.toLowerCase() }
    : { error: 'No Panoramax photo in this link' }
}

/**
 * The key "Use this photo" writes to: the active row when it is a key of the photo's provider, in the feature the
 * field is shown for; otherwise the provider's default key.
 */
export function targetKey(
  provider: ImageProvider,
  active: { rowId: string; key: string } | null,
  writerRowId: string | undefined,
) {
  if (
    active !== null &&
    writerRowId !== undefined &&
    active.rowId === writerRowId &&
    providerOfKey(active.key) === provider
  ) {
    return active.key
  }
  return defaultKey(provider)
}

export type UsePlan =
  | { ok: true; key: string; value: string }
  | { ok: false; key?: string; reason: string }

/**
 * What "Use this photo" does with the open photo: the key, and the new value of that key, or why it cannot.
 * `writer` is the feature the field last registered (its row id and tags); null when no feature shows the field.
 */
export function planUse(input: {
  photoId: string
  provider: ImageProvider
  active: { rowId: string; key: string } | null
  writer: { rowId: string; tags: Tags } | null
}): UsePlan {
  const { photoId, provider, active, writer } = input
  if (writer === null) {
    return { ok: false, reason: 'Select a feature that shows the Street-level images field' }
  }
  const key = targetKey(provider, active, writer.rowId)
  const current = writer.tags[key]
  if (hasId(current, photoId)) return { ok: false, key, reason: `${key} already has this photo` }
  return { ok: true, key, value: appendId(current, photoId) }
}
