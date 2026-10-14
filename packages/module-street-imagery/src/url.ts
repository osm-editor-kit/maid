/**
 * The URL parameters of the photos module, in iD's names and formats (`.reference/id/modules/renderer/photos.js`):
 *
 *   photo_type     flat, panoramic, or both (`flat,panoramic`): Maid's kind all, flat or pano
 *   photo_overlay  the providers on, comma list; `none` for no provider (Maid's own value: iD leaves the key out)
 *   photo_dates    `from_to` as `YYYY-MM-DD`; `_` for no limit (iD reads it that way, and never writes it)
 *   photo          the open photo, `provider/id` (iD's form; the id only, as the audit decided)
 *
 * Only `photo_type` is declared by the module (index.ts). The shell reserves `photo_overlay`, `photo_dates` and `photo`
 * for its carried iD rows (shell `url/id-url.ts`), so declaring them waits for that change; their parsers are here and
 * tested. `photo_username` is not in Maid (it has no username filter).
 *
 * Pure: no React, no nuqs, no store. The parsers have the shape core's `UrlParser` takes.
 */
import type { IdUrlName, UrlParser } from '@osm-editor-kit/maid-core'
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

function sameRef(a: PhotoRef, b: PhotoRef) {
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
