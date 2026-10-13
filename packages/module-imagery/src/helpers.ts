/**
 * Pure helpers of the imagery module: what the list shows, how it is ordered and searched, and
 * how the stored choice is read back. No React, no MapLibre and no imports of the ELI package, so
 * they can be tested without a browser.
 */
import { z } from 'zod'

/** The viewport: `[west, south, east, north]` in degrees, and the zoom */
export type View = { bounds: [number, number, number, number]; zoom: number }

/**
 * The stored choice, read field by field: a field of the wrong type takes its default, so an old or
 * damaged entry cannot break the map. Overlays of the wrong type are dropped, repeats too. A stored
 * value that is not an object takes every default.
 */
export function storedImagery(defaultBackground: string | null) {
  return z
    .object({
      backgroundId: z.string().nullable().catch(defaultBackground),
      overlayIds: z
        .array(z.string().nullable().catch(null))
        .transform((ids) => [...new Set(ids.filter((id): id is string => id !== null))])
        .catch([]),
      brightness: z.number().catch(BRIGHTNESS_MAX).transform(clampBrightness),
    })
    .catch({ backgroundId: defaultBackground, overlayIds: [], brightness: BRIGHTNESS_MAX })
}

/** What is stored: the chosen background, the chosen overlays and the brightness (0.2 to 1) */
export type ImageryStored = z.infer<ReturnType<typeof storedImagery>>

/** One row of the list, as the panel needs it. Filled from the ELI package by `eli.ts`. */
export type Listing = {
  id: string
  name: string
  /** ELI's category, for example `photo` or `historicmap` */
  category?: string
  /** ELI marks the best layers for their region */
  best: boolean
  overlay: boolean
  minzoom?: number
  /** Plain text: the ELI package gives HTML, which the panel does not render */
  attributionText?: string
}

export const BRIGHTNESS_MIN = 0.2
export const BRIGHTNESS_MAX = 1

const CATEGORY_LABELS: Record<string, string> = {
  photo: 'Aerial photo',
  map: 'Map',
  historicmap: 'Historic map',
  historicphoto: 'Historic photo',
  osmbasedmap: 'Map based on OSM',
  qa: 'Quality assurance',
  elevation: 'Elevation',
  other: 'Other',
}

/** The name of an ELI category for people; unknown categories are shown as they are */
export function categoryLabel(category: string | undefined) {
  if (category === undefined) return undefined
  return CATEGORY_LABELS[category] ?? category
}

export function clampBrightness(value: number) {
  if (!Number.isFinite(value)) return BRIGHTNESS_MAX
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, value))
}

/** Reads the stored choice; see `storedImagery`. Never throws: every field has a default. */
export function parseStored(raw: unknown, fallback: { backgroundId: string | null }) {
  return storedImagery(fallback.backgroundId).parse(raw)
}

/** Best layers first, then by name. ELI gives no ranking of its own beyond the `best` flag. */
export function sortListing(items: readonly Listing[]) {
  return [...items].sort(
    (a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name, 'en'),
  )
}

/**
 * Whether a layer is worth listing at this zoom. ELI's `maxzoom` is not a limit: MapLibre
 * overzooms the last tiles. Only a layer that starts at a higher zoom is left out.
 */
export function visibleAtZoom(item: Pick<Listing, 'minzoom'>, zoom: number) {
  return zoom >= (item.minzoom ?? 0)
}

/** Every word of the query must appear in the name or the category label (case-insensitive) */
export function matchesQuery(item: Listing, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${item.name} ${categoryLabel(item.category) ?? ''}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}
