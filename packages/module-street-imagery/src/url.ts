/**
 * The URL parameters of the photos module, in iD's names and formats (`.reference/id/modules/renderer/photos.js`):
 *
 *   photo_type     flat, panoramic, or both (`flat,panoramic`): Maid's kind all, flat or pano
 *   photo_overlay  the providers on, comma list; `none` for no provider (Maid's own value: iD leaves the key out)
 *   photo_dates    `from_to` as `YYYY-MM-DD`; `_` for no limit (iD reads it that way, and never writes it)
 *   photo          the open photo, `provider/id` (iD's form; the id only, as the audit decided)
 *
 * The module declares all four in setup (index.ts) from `PHOTO_PARAM_DECLARATIONS`, and reads and writes them with
 * `PHOTO_HANDLES` (the same declarations, built as the core builds the handle `api.urlParam` returns). `photo_username`
 * is not in Maid (it has no username filter).
 *
 * Pure: no React, no nuqs, no store. The parsers have the shape core's `UrlParser` takes.
 */
import type {
  IdUrlName,
  UrlParamDeclaration,
  UrlParamHandle,
  UrlParser,
} from '@osm-editor-kit/maid-core'
import {
  DAY,
  IMAGERY_PROVIDER_IDS,
  type ImageryProviderId,
  type PhotoKind,
  type StreetImageryStored,
} from './state.ts'

/** The value of a list that is empty: no provider on */
export const NONE = 'none'

/** iD's names for the four parameters (the same names in Maid) */
export const ID_PHOTO_TYPE: IdUrlName = { name: 'photo_type' }
export const ID_PHOTO_OVERLAY: IdUrlName = { name: 'photo_overlay' }
export const ID_PHOTO_DATES: IdUrlName = { name: 'photo_dates' }
export const ID_PHOTO: IdUrlName = { name: 'photo' }

/** The date limit: `from` and `to`, each a day or absent (no limit on that side) */
export type PhotoDates = StreetImageryStored['date']

/** The open photo: its provider and its id at the provider */
export type PhotoRef = { providerId: ImageryProviderId; photoId: string }

export function isProviderId(value: string): value is ImageryProviderId {
  return (IMAGERY_PROVIDER_IDS as readonly string[]).includes(value)
}

/** A list as iD writes and reads it: separated by commas, or by semicolons (photos.js) */
function listOf(value: string): string[] {
  return value
    .replace(/;/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function sameList<T>(a: readonly T[], b: readonly T[]) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameDates(a: PhotoDates, b: PhotoDates) {
  return a.from === b.from && a.to === b.to
}

export function sameRef(a: PhotoRef, b: PhotoRef) {
  return a.providerId === b.providerId && a.photoId === b.photoId
}

/**
 * `photo_type`: `flat` shows flat photos, `panoramic` the 360° ones, both (`flat,panoramic`) every kind. Maid's kinds:
 * `flat`, `pano` (panoramic) and `all`. Any other value is no opinion (null).
 */
export const parseAsPhotoType: UrlParser<PhotoKind> = {
  parse(value) {
    const parts = listOf(value)
    const flat = parts.includes('flat')
    const pano = parts.includes('panoramic')
    if (flat && pano) return 'all'
    if (flat) return 'flat'
    if (pano) return 'pano'
    return null
  },
  serialize: (kind) => (kind === 'all' ? 'flat,panoramic' : kind === 'flat' ? 'flat' : 'panoramic'),
  eq: (a, b) => a === b,
}

/**
 * `photo_overlay`: the providers on, in the order chosen. Names that are not Maid's providers (iD's other layers) are
 * left out; a value with none of Maid's is no opinion (null). `none` is the explicit empty list.
 */
export const parseAsPhotoOverlay: UrlParser<ImageryProviderId[]> = {
  parse(value) {
    if (value === NONE) return []
    const ids = [...new Set(listOf(value).filter(isProviderId))]
    return ids.length > 0 ? ids : null
  },
  serialize: (ids) => (ids.length === 0 ? NONE : ids.join(',')),
  eq: sameList,
}

/** Splits `from_to` the way iD does (photos.js `init`): the last `_` or en dash divides the two days */
const DATES = /^(.*)[–_](.*)$/

/**
 * `photo_dates`: `from_to`, each side a day or empty. `_` (both sides empty) is no limit, written explicitly so that a
 * stored limit does not come back. A value that is not two days and separator is no opinion (null); an invalid side
 * is left out, as iD does.
 */
export const parseAsPhotoDates: UrlParser<PhotoDates> = {
  parse(value) {
    const match = DATES.exec(value.trim())
    if (match === null) return null
    const from = match[1] ?? ''
    const to = match[2] ?? ''
    if (from === '' && to === '') return {}
    const dates: PhotoDates = {}
    if (DAY.safeParse(from).success) dates.from = from
    if (DAY.safeParse(to).success) dates.to = to
    return dates.from === undefined && dates.to === undefined ? null : dates
  },
  serialize: ({ from, to }) => `${from ?? ''}_${to ?? ''}`,
  eq: sameDates,
}

/**
 * `photo`: the open photo as `provider/id`, the first of the list (iD takes the first, photos.js `init`). Only Maid's
 * providers; anything else is no opinion (null).
 */
export const parseAsPhoto: UrlParser<PhotoRef> = {
  parse(value) {
    const first = (value.split(/[;,]/)[0] ?? '').trim()
    const slash = first.indexOf('/')
    if (slash <= 0) return null
    const providerId = first.slice(0, slash)
    const photoId = first.slice(slash + 1).trim()
    if (!isProviderId(providerId) || photoId === '') return null
    return { providerId, photoId }
  },
  serialize: ({ providerId, photoId }) => `${providerId}/${photoId}`,
  eq: sameRef,
}

/**
 * The four declarations, as the module passes them to `api.urlParam` in setup. Each carries iD's name, so that an iD
 * link maps onto it (the shell's id-url.ts). `photo_type` keeps its value in the URL when it is the default (`clearOnDefault:
 * false`, as before); the other three are `history: 'replace'` (the core default, written out).
 */
export const PHOTO_PARAM_DECLARATIONS = {
  type: {
    name: 'photo_type',
    parser: parseAsPhotoType,
    options: { history: 'replace', clearOnDefault: false },
    iD: ID_PHOTO_TYPE,
  },
  overlay: {
    name: 'photo_overlay',
    parser: parseAsPhotoOverlay,
    options: { history: 'replace' },
    iD: ID_PHOTO_OVERLAY,
  },
  dates: {
    name: 'photo_dates',
    parser: parseAsPhotoDates,
    options: { history: 'replace' },
    iD: ID_PHOTO_DATES,
  },
  photo: {
    name: 'photo',
    parser: parseAsPhoto,
    options: { history: 'replace' },
    iD: ID_PHOTO,
  },
} satisfies {
  type: UrlParamDeclaration<PhotoKind>
  overlay: UrlParamDeclaration<ImageryProviderId[]>
  dates: UrlParamDeclaration<PhotoDates>
  photo: UrlParamDeclaration<PhotoRef>
}

/**
 * The handle of a declaration, built as the core builds the one `api.urlParam` returns (`history` defaults to `replace`).
 * The readers and the sync take these: a stable object, so that the core's `useUrlParam` keeps its parser.
 */
export function handleOf<T>(declaration: UrlParamDeclaration<T>): UrlParamHandle<T> {
  return {
    name: declaration.name,
    parser: declaration.parser,
    options: { ...declaration.options, history: declaration.options?.history ?? 'replace' },
    iD: declaration.iD,
  }
}

export const PHOTO_HANDLES = {
  type: handleOf(PHOTO_PARAM_DECLARATIONS.type),
  overlay: handleOf(PHOTO_PARAM_DECLARATIONS.overlay),
  dates: handleOf(PHOTO_PARAM_DECLARATIONS.dates),
  photo: handleOf(PHOTO_PARAM_DECLARATIONS.photo),
}

/**
 * The photo the URL shows: its `photo` when its provider is on. A URL photo whose provider is off waits: it stays in
 * the URL and shows when the provider comes on. Pure.
 */
export function shownPhotoRef(
  url: PhotoRef | null,
  on: readonly ImageryProviderId[],
): PhotoRef | null {
  return url !== null && on.includes(url.providerId) ? url : null
}

/**
 * Whether a change of the providers from `before` to `after` closes the URL's photo: its provider was on and is now off.
 * A photo that waits (its provider was never on) is not closed by another provider. Pure.
 */
export function switchOffCloses(
  url: PhotoRef | null,
  before: readonly ImageryProviderId[],
  after: readonly ImageryProviderId[],
): boolean {
  return url !== null && before.includes(url.providerId) && !after.includes(url.providerId)
}

/**
 * The photo reference of a photo from a provider's data: null for a provider Maid does not offer (such a photo cannot be
 * opened in the dock). Pure.
 */
export function refOf(photo: { providerId: string; photoId: string }): PhotoRef | null {
  return isProviderId(photo.providerId)
    ? { providerId: photo.providerId, photoId: photo.photoId }
    : null
}
