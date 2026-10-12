/**
 * What the photos module keeps between visits, and the rules that decide which providers may be
 * used. Pure: no React, no store, no browser global except the navigator the caller passes in.
 */
import type { DateRange, PhotoTypeFilter } from '@osm-editor-kit/street-imagery'

/** The providers the module offers. Panoramax is public; Mapillary needs a client token. */
export const IMAGERY_PROVIDER_IDS = ['panoramax', 'mapillary'] as const
export type ImageryProviderId = (typeof IMAGERY_PROVIDER_IDS)[number]

export const PROVIDER_LABELS: Record<ImageryProviderId, string> = {
  panoramax: 'Panoramax',
  mapillary: 'Mapillary',
}

/** Which photos to show: both kinds, flat photos only, or 360° photos only. */
export const PHOTO_KINDS = ['all', 'flat', 'pano'] as const
export type PhotoKind = (typeof PHOTO_KINDS)[number]

/** What is stored in the browser under `maid:street-imagery` (version 1). */
export type StreetImageryStored = {
  /** The providers the person switched on. Nothing is requested for the others. */
  providers: ImageryProviderId[]
  photoKind: PhotoKind
  /** Days as `YYYY-MM-DD`. No `from` and no `to`: no limit. */
  date: DateRange
}

export const DEFAULT_STORED: StreetImageryStored = { providers: [], photoKind: 'all', date: {} }

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `true` for a real calendar day written as `YYYY-MM-DD`. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProviderId(value: unknown): value is ImageryProviderId {
  return typeof value === 'string' && (IMAGERY_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Reads what storage gave back. Anything that does not fit is dropped and the default is used
 * for it: a stored value must never stop the editor from starting.
 */
export function parseStored(value: unknown): StreetImageryStored {
  if (!isRecord(value)) return DEFAULT_STORED
  const providers = Array.isArray(value.providers)
    ? [...new Set(value.providers.filter(isProviderId))]
    : []
  const photoKind = PHOTO_KINDS.find((kind) => kind === value.photoKind) ?? DEFAULT_STORED.photoKind
  const stored = isRecord(value.date) ? value.date : {}
  const date: DateRange = {}
  if (isDay(stored.from)) date.from = stored.from
  if (isDay(stored.to)) date.to = stored.to
  return { providers, photoKind, date }
}

/** Mapillary is offered only when the build has a token; Panoramax always. */
export function providerAvailable(
  id: ImageryProviderId,
  mapillaryToken: string | undefined,
): boolean {
  return id === 'panoramax' || (mapillaryToken ?? '').trim() !== ''
}

/**
 * The providers whose photos are requested now: switched on, available with this token, and never
 * in an automated browser (AGENTS.md, core rule 1).
 */
export function activeProviders(
  stored: readonly ImageryProviderId[],
  mapillaryToken: string | undefined,
  automated: boolean,
): ImageryProviderId[] {
  if (automated) return []
  return IMAGERY_PROVIDER_IDS.filter(
    (id) => stored.includes(id) && providerAvailable(id, mapillaryToken),
  )
}

/** The photo-type filter the layers take for a kind. `undefined` shows both kinds. */
export function photoTypesOf(kind: PhotoKind): PhotoTypeFilter[] | undefined {
  if (kind === 'flat') return ['flat']
  if (kind === 'pano') return ['pano']
  return undefined
}

/** Automated browsers (tests, benchmarks, agents) get no photos, whatever is stored. */
export function isAutomatedBrowser(nav: { webdriver?: boolean } | undefined): boolean {
  return nav?.webdriver === true
}
