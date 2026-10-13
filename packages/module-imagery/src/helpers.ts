/**
 * Pure helpers of the imagery module: what the list shows, how it is ordered and searched, and
 * how the stored choice is read back. No React, no MapLibre and no imports of the ELI package, so
 * they can be tested without a browser.
 */
import { z } from 'zod'
import { CUSTOM_ID, customNumber, isCustomId, type CustomEntry } from './custom.ts'

/**
 * Zoom numbers. MapLibre counts zoom with 512 px tiles. ELI, iD and Rapid count with 256 px tiles
 * (OSM zoom). For the same view, OSM zoom is MapLibre zoom plus one: MapLibre 13 is OSM 14. ELI's
 * `minzoom` is in OSM zoom, so a number from `map.getZoom()` goes through `toOsmZoom` before it is
 * compared with it, and a value from ELI goes through `toMapZoom` before it is given to MapLibre.
 */
export function toOsmZoom(mapZoom: number) {
  return mapZoom + 1
}

/** The inverse of `toOsmZoom`: an OSM (256 px) zoom as MapLibre (512 px) counts it */
export function toMapZoom(osmZoom: number) {
  return osmZoom - 1
}

/** The viewport: `[west, south, east, north]` in degrees, and the zoom in OSM convention */
export type View = { bounds: [number, number, number, number]; zoom: number }

/**
 * One saved custom background. A broken entry (no id of the `custom-<n>` form, no template) is
 * dropped; a name of the wrong type is emptied, and the entry stays.
 */
const storedCustom = z
  .object({
    id: z.string().regex(CUSTOM_ID),
    name: z.string().catch(''),
    template: z.string().min(1),
  })
  .nullable()
  .catch(null)

function isEntry(entry: CustomEntry | null): entry is CustomEntry {
  return entry !== null
}

/** The first entry of each id stays: a repeated id would make two rows for one choice */
function uniqueIds(entries: CustomEntry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

/**
 * The stored choice, read field by field: a field of the wrong type takes its default, so an old or
 * damaged entry cannot break the map. Overlays of the wrong type are dropped, repeats too. A stored
 * value that is not an object takes every default. Custom backgrounds are read entry by entry (see
 * `storedCustom`); `customNext` is the number the next custom id takes, see `parseStored`.
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
      custom: z
        .array(storedCustom)
        .transform((entries) => uniqueIds(entries.filter(isEntry)))
        .catch([]),
      customNext: z.number().int().min(1).catch(1),
    })
    .catch({
      backgroundId: defaultBackground,
      overlayIds: [],
      brightness: BRIGHTNESS_MAX,
      custom: [],
      customNext: 1,
    })
}

/**
 * What is stored: the chosen background (a layer id or a custom id), the chosen overlays, the
 * brightness (0.2 to 1), the saved custom backgrounds and the number of the next custom id.
 */
export type ImageryStored = z.infer<ReturnType<typeof storedImagery>>

const rawCustomList = z.object({ custom: z.array(z.unknown()) })
const rawEntryId = z.object({ id: z.string() })

/**
 * The highest custom number in the stored value, counting entries that are dropped as broken too.
 * A dropped entry's id must never be given out again, so it is counted here.
 */
function highestStoredCustomNumber(raw: unknown) {
  const list = rawCustomList.safeParse(raw)
  if (!list.success) return 0
  return list.data.custom.reduce<number>((highest, item) => {
    const entry = rawEntryId.safeParse(item)
    return entry.success ? Math.max(highest, customNumber(entry.data.id)) : highest
  }, 0)
}

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

/**
 * Reads the stored choice; see `storedImagery`. Never throws: every field has a default.
 *
 * Two things are settled here, not in the schema. A chosen custom background whose entry is gone
 * (dropped as broken, or never there) falls back to the default, so nothing points at nothing. The
 * next custom number is never below the highest number seen in the stored value, so an id is not
 * given out twice.
 */
export function parseStored(
  raw: unknown,
  fallback: { backgroundId: string | null },
): ImageryStored {
  const stored = storedImagery(fallback.backgroundId).parse(raw)
  const { custom } = stored
  const backgroundGone =
    isCustomId(stored.backgroundId) && !custom.some((entry) => entry.id === stored.backgroundId)
  const highest = Math.max(
    highestStoredCustomNumber(raw),
    ...custom.map((entry) => customNumber(entry.id)),
  )
  return {
    ...stored,
    backgroundId: backgroundGone ? fallback.backgroundId : stored.backgroundId,
    customNext: Math.max(stored.customNext, highest + 1),
  }
}

/** Best layers first, then by name. ELI gives no ranking of its own beyond the `best` flag. */
export function sortListing(items: readonly Listing[]) {
  return [...items].sort(
    (a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name, 'en'),
  )
}

/**
 * Whether a layer is worth listing at this zoom, given in OSM convention (see `toOsmZoom`). ELI's
 * `maxzoom` is not a limit: MapLibre overzooms the last tiles. Only a layer that starts at a higher
 * zoom is left out.
 */
export function visibleAtZoom(item: Pick<Listing, 'minzoom'>, zoom: number) {
  if (item.minzoom === undefined) return true
  return zoom >= item.minzoom
}

/** Every word of the query must appear in the name or the category label (case-insensitive) */
export function matchesQuery(item: Listing, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${item.name} ${categoryLabel(item.category) ?? ''}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * The names of the imagery drawn now, as iD cites them: the background first, then the overlays in
 * the order they were chosen. `names` has the name of each layer that is drawn; a layer that is
 * chosen but not drawn yet (or needs an API key) is not in it and is left out.
 */
export function usedNames(
  backgroundId: string | null,
  overlayIds: readonly string[],
  names: Readonly<Record<string, string>>,
) {
  const ids = backgroundId === null ? overlayIds : [backgroundId, ...overlayIds]
  return ids.flatMap((id) => {
    const name = names[id]
    return name === undefined ? [] : [name]
  })
}

/** The name of the drawn background, or undefined with no background or while it is not drawn yet */
export function backgroundName(
  backgroundId: string | null,
  names: Readonly<Record<string, string>>,
) {
  return backgroundId === null ? undefined : names[backgroundId]
}
