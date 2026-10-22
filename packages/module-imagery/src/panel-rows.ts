/**
 * The pure parts of the background panel's rows: the groups, the repeat test, the links and the dates
 * of a layer, and the overlay list. No React, no MapLibre and no ELI at run time, so the tests run
 * without a browser. `series.ts` and `ImageryPanel.tsx` use them.
 */
import { sortListing, type Listing } from './helpers.ts'

/** The groups of the background list, in the order they are shown */
export const BACKGROUND_GROUPS = [
  { id: 'local-photo', label: 'Local aerial imagery' },
  { id: 'global-photo', label: 'Global aerial imagery' },
  { id: 'maps', label: 'Maps' },
  { id: 'historic', label: 'Historic' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'other', label: 'Other' },
] as const

export type BackgroundGroupId = (typeof BACKGROUND_GROUPS)[number]['id']

/**
 * The group a layer is listed under: by its category. An aerial photo is local when it has a coverage
 * area and global when it is worldwide. Categories that are not listed (`qa`, `other`, or none) are in Other.
 */
export function backgroundGroup(category: string | undefined, worldwide: boolean | undefined) {
  switch (category) {
    case 'photo':
      return worldwide ? 'global-photo' : 'local-photo'
    case 'map':
    case 'osmbasedmap':
      return 'maps'
    case 'historicmap':
    case 'historicphoto':
      return 'historic'
    case 'elevation':
      return 'elevation'
    case 'qa':
    case 'other':
    case undefined:
    default:
      return 'other'
  }
}

/**
 * The rows in their groups, in the order of `BACKGROUND_GROUPS`. Empty groups are left out, and the order
 * of the rows inside a group is kept.
 */
export function groupRows<T extends { group: BackgroundGroupId }>(rows: readonly T[]) {
  return BACKGROUND_GROUPS.flatMap((group) => {
    const members = rows.filter((row) => row.group === group.id)
    return members.length > 0 ? [{ id: group.id, label: group.label, rows: members }] : []
  })
}

function normalized(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Whether a text repeats the name, so it is not shown under it: the same text (trimmed, case-insensitive). A text
 * that only contains the name says more ("Bing Aerial imagery © Microsoft" under "Bing Aerial") and stays. An empty
 * text repeats nothing to show.
 */
export function repeatsName(text: string | undefined, name: string) {
  const words = normalized(text ?? '')
  if (words === '') return true
  const title = normalized(name)
  return words === title
}

/** A link of a layer, with the label the panel shows for it */
export type LayerLink = { label: string; url: string }

/** An http or https address, or `undefined`: a layer's data is never shown as a link to any other scheme */
function webUrl(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * The links of a layer that the index gives: the attribution's URL and the licence's. The index has no
 * privacy policy or terms URL (ELI 0.2.0), so there are none to show. A licence that is the same page as
 * the attribution is listed once. An attribution text without a URL is not a link and is not returned here.
 */
export function layerLinks(layer: Pick<Listing, 'attributionUrl' | 'licenseUrl'>): LayerLink[] {
  const attribution = webUrl(layer.attributionUrl)
  const license = webUrl(layer.licenseUrl)
  const links: LayerLink[] = []
  if (attribution !== undefined) links.push({ label: 'Attribution', url: attribution })
  if (license !== undefined && license !== attribution) {
    links.push({ label: 'License', url: license })
  }
  return links
}

/** The dates of a layer as the index gives them: `2010 – 2015`, `from 2010` or `until 2015`. Undefined when neither is given. */
export function dateText(startDate: string | undefined, endDate: string | undefined) {
  const start = startDate?.trim() || undefined
  const end = endDate?.trim() || undefined
  if (start !== undefined && end !== undefined) return start === end ? start : `${start} – ${end}`
  if (start !== undefined) return `from ${start}`
  if (end !== undefined) return `until ${end}`
  return undefined
}

/**
 * The age of a layer for the panel: its dates when the index gives them, else the year of the series' date
 * that is shown (`seriesLabel`, for example `2025 Sommer`).
 */
export function layerAge(
  layer: Pick<Listing, 'startDate' | 'endDate'>,
  seriesLabel: string | undefined,
) {
  return dateText(layer.startDate, layer.endDate) ?? seriesLabel
}

/**
 * The overlays of the list: those that cover the view at this zoom (`inView`), and every overlay that is on
 * now (`on`), whether it covers the view or not, as iD lists the sources in use. A layer is listed once.
 * Sorted as the list is: best first, then by name.
 */
export function overlayRows(inView: readonly Listing[], on: readonly Listing[]) {
  const seen = new Set<string>()
  const rows: Listing[] = []
  for (const item of [...inView, ...on]) {
    if (!item.overlay || seen.has(item.id)) continue
    seen.add(item.id)
    rows.push(item)
  }
  return sortListing(rows)
}
