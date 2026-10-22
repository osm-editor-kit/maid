/**
 * Pure helpers of the imagery module: what the list shows, how it is ordered and searched, and
 * how the stored choice is read back. No React, no MapLibre and no imports of the ELI package, so
 * they can be tested without a browser.
 */
import { z } from 'zod'
import type { CustomEntry } from './custom.ts'
import { customValue, NONE } from './url.ts'

export const BRIGHTNESS_MIN = 0.2
export const BRIGHTNESS_MAX = 1

/** The viewport: `[west, south, east, north]` in degrees, and the zoom in OSM convention */
export type View = { bounds: [number, number, number, number]; zoom: number }

/**
 * The view the layer listing is computed from, and keyed by. The box is rounded outward to 0.001 degrees
 * (about 110 m of latitude, about 45 px at zoom 16) and the zoom down to a tenth. So a pan of a few pixels
 * keeps the same key and asks nothing new. A layer that covers the view is always listed; a layer with a
 * minzoom between two tenths of a zoom level appears at the next tenth. The listing is computed from this
 * rounded view, so a key says exactly what it was computed from.
 */
export function listingView(view: View): View {
  const [west, south, east, north] = view.bounds
  return {
    bounds: [
      Math.floor(west * 1000) / 1000,
      Math.floor(south * 1000) / 1000,
      Math.ceil(east * 1000) / 1000,
      Math.ceil(north * 1000) / 1000,
    ],
    zoom: Math.floor(view.zoom * 10) / 10,
  }
}

/** One saved custom background: a name and its template. A broken entry is dropped; a name of the wrong type is emptied. */
const storedCustom = z
  .object({
    name: z.string().catch(''),
    template: z.string().min(1),
  })
  .nullable()
  .catch(null)

function isEntry(entry: CustomEntry | null): entry is CustomEntry {
  return entry !== null
}

/** The first entry of each template stays: a repeated template would make two rows for one background */
function uniqueTemplates(entries: CustomEntry[]) {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.template)) return false
    seen.add(entry.template)
    return true
  })
}

/**
 * The stored choice, read field by field: a field of the wrong type takes its default, so an old or damaged entry
 * cannot break the map. `background` is the last background chosen (a value of iD's notation, see url.ts), or null
 * when none was ever chosen. Overlays of the wrong type are dropped, repeats too. A stored value that is not an object
 * takes every default.
 */
export const storedImagery = z
  .object({
    background: z.string().min(1).nullable().catch(null),
    overlayIds: z
      .array(z.string().nullable().catch(null))
      .transform((ids) => [...new Set(ids.filter((id): id is string => id !== null))])
      .catch([]),
    brightness: z.number().catch(BRIGHTNESS_MAX).transform(clampBrightness),
    custom: z
      .array(storedCustom)
      .transform((entries) => uniqueTemplates(entries.filter(isEntry)))
      .catch([]),
  })
  .catch({ background: null, overlayIds: [], brightness: BRIGHTNESS_MAX, custom: [] })

/**
 * What is stored: the last background and overlays chosen, the brightness (0.2 to 1) and the saved custom backgrounds.
 * The URL is the live state; these are the choices for the next visit (docs/research/url-state-audit.md, section 3.2).
 */
export type ImageryStored = z.infer<typeof storedImagery>

/** Reads the stored choice; see `storedImagery`. Never throws: every field has a default. */
export function parseStored(raw: unknown): ImageryStored {
  return storedImagery.parse(raw)
}

/**
 * The stored value of an earlier version, in that version's shape, turned into the current one (zustand's `migrate`).
 * Version 2 kept `backgroundId` (an ELI id, `custom-<n>`, or null for none) and a custom list with ids. A `custom-<n>`
 * becomes `custom:<template>` through its entry, and an entry that is gone leaves no choice. A null `backgroundId` was
 * a choice of none, so it becomes `none`; a missing one was never chosen (null). Version 3 is returned as it is.
 */
export function migrateStored(raw: unknown, version: number): unknown {
  if (version >= 3 || typeof raw !== 'object' || raw === null) return raw
  const record = raw as Record<string, unknown>
  const templates = new Map<string, string>()
  const custom: CustomEntry[] = []
  if (Array.isArray(record.custom)) {
    for (const item of record.custom) {
      if (typeof item !== 'object' || item === null) continue
      const entry = item as Record<string, unknown>
      if (typeof entry.id !== 'string' || typeof entry.template !== 'string') continue
      templates.set(entry.id, entry.template)
      custom.push({
        name: typeof entry.name === 'string' ? entry.name : '',
        template: entry.template,
      })
    }
  }
  const id = record.backgroundId
  let background: string | null = null
  if (id === null) background = NONE
  else if (typeof id === 'string' && LEGACY_CUSTOM_ID.test(id)) {
    const template = templates.get(id)
    background = template === undefined ? null : customValue(template)
  } else if (typeof id === 'string') background = id
  return {
    background,
    overlayIds: record.overlayIds,
    brightness: record.brightness,
    custom,
  }
}

/** The id a version 2 custom background had: `custom-1`, `custom-2`, ... */
const LEGACY_CUSTOM_ID = /^custom-[1-9]\d*$/

/**
 * Where a layer sits in its time series, as ELI gives it (`group`, with `order` 0 for the oldest).
 * Same shape as ELI's `EliLayerGroup`, written out here so this file imports nothing from ELI.
 */
export type ListingGroup = { id: string; name: string; label: string; order: number }

/** One layer of the list, as the panel needs it. Filled from the ELI package by `eli.ts`. */
export type Listing = {
  id: string
  name: string
  /** ELI's category, for example `photo` or `historicmap` */
  category?: string
  /** ELI marks the best layers for their region */
  best: boolean
  overlay: boolean
  minzoom?: number
  /** Set when the layer is one date of a time series (see `series.ts`) */
  group?: ListingGroup
  /** Plain text: the ELI package gives HTML, which the panel does not render */
  attributionText?: string
  /** True when the layer has no coverage area: ELI files it under `world` */
  worldwide?: boolean
  /** The dates the index gives for the layer, as it writes them */
  startDate?: string
  endDate?: string
  /** The attribution's own page, from the index */
  attributionUrl?: string
  /** The licence's page, from the index */
  licenseUrl?: string
}

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

/** Best layers first, then by name. ELI gives no ranking of its own beyond the `best` flag. */
export function sortListing(items: readonly Listing[]) {
  return [...items].sort(
    (a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name, 'en'),
  )
}

/**
 * Whether a layer is worth listing at this zoom, given in OSM convention (see `toOsmZoom` in maid-core). ELI's
 * `maxzoom` is not a limit: MapLibre overzooms the last tiles. Only a layer that starts at a higher
 * zoom is left out.
 */
export function visibleAtZoom(item: Pick<Listing, 'minzoom'>, zoom: number) {
  if (item.minzoom === undefined) return true
  return zoom >= item.minzoom
}

/** Every word of the query must appear in the text (case-insensitive). An empty query matches. */
export function everyWordIn(text: string, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = text.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** Every word of the query must appear in the name or the category label (case-insensitive) */
export function matchesQuery(item: Listing, query: string) {
  return everyWordIn(`${item.name} ${categoryLabel(item.category) ?? ''}`, query)
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
