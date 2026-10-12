/**
 * Pure helpers of the imagery module: what the list shows, how it is ordered and searched, and
 * how the stored choice is read back. No React, no MapLibre and no imports of the ELI package, so
 * they can be tested without a browser.
 */

/** The viewport: `[west, south, east, north]` in degrees, and the zoom */
export type View = { bounds: [number, number, number, number]; zoom: number }

/** What is stored: the chosen background, the chosen overlays and the brightness (0.2 to 1) */
export type ImageryStored = {
  backgroundId: string | null
  overlayIds: string[]
  brightness: number
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
export function categoryLabel(category: string | undefined): string | undefined {
  if (category === undefined) return undefined
  return CATEGORY_LABELS[category] ?? category
}

/**
 * True when the browser says it is driven by automation (`navigator.webdriver`). Then no imagery
 * is loaded and nothing is stored: the module behaves as if it had never been used.
 */
export function isAutomatedBrowser(
  nav: { webdriver?: boolean } | undefined = globalThis.navigator,
): boolean {
  return nav?.webdriver === true
}

export function clampBrightness(value: number): number {
  if (!Number.isFinite(value)) return BRIGHTNESS_MAX
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, value))
}

/**
 * Reads the stored choice. Anything that does not have the right shape falls back to the
 * defaults, so an old or damaged entry cannot break the map.
 */
export function parseStored(
  raw: unknown,
  fallback: { backgroundId: string | null },
): ImageryStored {
  const stored: ImageryStored = {
    backgroundId: fallback.backgroundId,
    overlayIds: [],
    brightness: BRIGHTNESS_MAX,
  }
  if (typeof raw !== 'object' || raw === null) return stored
  const record = raw as Record<string, unknown>
  if (record.backgroundId === null || typeof record.backgroundId === 'string')
    stored.backgroundId = record.backgroundId
  if (Array.isArray(record.overlayIds))
    stored.overlayIds = [
      ...new Set(record.overlayIds.filter((id): id is string => typeof id === 'string')),
    ]
  if (typeof record.brightness === 'number') stored.brightness = clampBrightness(record.brightness)
  return stored
}

/** Best layers first, then by name. ELI gives no ranking of its own beyond the `best` flag. */
export function sortListing(items: readonly Listing[]): Listing[] {
  return [...items].sort(
    (a, b) => Number(b.best) - Number(a.best) || a.name.localeCompare(b.name, 'en'),
  )
}

/**
 * Whether a layer is worth listing at this zoom. ELI's `maxzoom` is not a limit: MapLibre
 * overzooms the last tiles. Only a layer that starts at a higher zoom is left out.
 */
export function visibleAtZoom(item: Pick<Listing, 'minzoom'>, zoom: number): boolean {
  return zoom >= (item.minzoom ?? 0)
}

/** Every word of the query must appear in the name or the category label (case-insensitive) */
export function matchesQuery(item: Listing, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${item.name} ${categoryLabel(item.category) ?? ''}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}
