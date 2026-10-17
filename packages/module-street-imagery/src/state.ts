/**
 * What the photos module keeps between visits, and the rules that decide which providers may be
 * used. Pure: no React, no store, no browser global except the navigator the caller passes in.
 */
import type { PhotoTypeFilter } from '@osm-editor-kit/street-imagery'
import { z } from 'zod'

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

/** A day as `YYYY-MM-DD`: a real calendar day (29 February only in leap years) */
export const DAY = z.iso.date()

/**
 * What is stored in the browser under `maid:street-imagery` (version 1), read field by field: a
 * value that does not fit is dropped and the default is used for it. A stored value must never stop
 * the editor from starting.
 */
const storedSchema = z
  .object({
    /** The providers the person switched on. Nothing is requested for the others. Repeats and unknown ids are dropped. */
    providers: z
      .array(z.enum(IMAGERY_PROVIDER_IDS).nullable().catch(null))
      .transform((ids) => [...new Set(ids.filter((id): id is ImageryProviderId => id !== null))])
      .catch([]),
    photoKind: z.enum(PHOTO_KINDS).catch('all'),
    /** Days as `YYYY-MM-DD`. No `from` and no `to`: no limit. */
    date: z
      .object({ from: DAY.optional().catch(undefined), to: DAY.optional().catch(undefined) })
      .catch({}),
  })
  .catch({ providers: [], photoKind: 'all', date: {} })

/** What is stored: the providers, the photo kind and the dates (see `storedSchema`) */
export type StreetImageryStored = z.infer<typeof storedSchema>

/** What a missing or broken stored value becomes */
export const DEFAULT_STORED: StreetImageryStored = storedSchema.parse(undefined)

/** Reads what storage gave back. Never throws: every field has a default. */
export function parseStored(value: unknown): StreetImageryStored {
  return storedSchema.parse(value)
}

/**
 * The providers after one is switched on or off: the list without `id`, and `id` last when it is on (the order of
 * switching on, as the stored list keeps it). A new array; the list given is not changed.
 */
export function toggleProvider(
  list: readonly ImageryProviderId[],
  id: ImageryProviderId,
  on: boolean,
): ImageryProviderId[] {
  return [...list.filter((item) => item !== id), ...(on ? [id] : [])]
}

/** Mapillary is offered only when the build has a token; Panoramax always. */
export function providerAvailable(id: ImageryProviderId, mapillaryToken: string | undefined) {
  return id === 'panoramax' || (mapillaryToken ?? '') !== ''
}

/**
 * The providers whose photos are requested now: switched on, available with this token, and never
 * in an automated browser (AGENTS.md, core rule 1).
 */
export function activeProviders(
  stored: readonly ImageryProviderId[],
  mapillaryToken: string | undefined,
  automated: boolean,
) {
  if (automated) return []
  return IMAGERY_PROVIDER_IDS.filter(
    (id) => stored.includes(id) && providerAvailable(id, mapillaryToken),
  )
}

/**
 * The providers whose photo can be opened by its id now, whether or not the person switched them on: Mapillary with a
 * token (its Graph API gives the photo of an id). Panoramax cannot be opened by id yet. Never in an automated browser.
 * The eye of a street-level image field uses it, so the photo shows without the map layer being switched on.
 */
export function openableProviders(
  mapillaryToken: string | undefined,
  automated: boolean,
): ImageryProviderId[] {
  if (automated) return []
  return providerAvailable('mapillary', mapillaryToken) ? ['mapillary'] : []
}

/** The photo-type filter the layers take for a kind. `undefined` shows both kinds. */
export function photoTypesOf(kind: PhotoKind): PhotoTypeFilter[] | undefined {
  if (kind === 'flat') return ['flat']
  if (kind === 'pano') return ['pano']
  return undefined
}
