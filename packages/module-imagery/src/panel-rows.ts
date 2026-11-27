/**
 * The pure parts of the background panel's rows: the groups, the repeat test, the links and the dates
 * of a layer, and the overlay list. No React, no MapLibre and no ELI at run time, so the tests run
 * without a browser. `series.ts` and `ImageryPanel.tsx` use them.
 */
import { sortListing, type Listing } from './helpers.ts'
import { m } from './messages.ts'

/**
 * The groups of the background list, in the order they are shown (Tobias, 2026-11-27): the aerial photos, local and
 * worldwide, and the maps last. Historic layers, elevation and the rest go with the photos, by their coverage; their
 * icon says what they are.
 */
export const BACKGROUND_GROUPS = [
  { id: 'local-photo' },
  { id: 'global-photo' },
  { id: 'maps' },
] as const

export type BackgroundGroupId = (typeof BACKGROUND_GROUPS)[number]['id']

/** The name of a group; read when the list is made, as the language is set at mount */
export function groupLabel(id: BackgroundGroupId): string {
  switch (id) {
    case 'local-photo':
      return m.imagery_group_local_photo()
    case 'global-photo':
      return m.imagery_group_global_photo()
    case 'maps':
      return m.imagery_group_maps()
  }
}

/**
 * The group a layer is listed under. A map (`map`, `osmbasedmap`) is in Maps. Every other layer (a photo, a historic
 * map or photo, elevation, QA, other, none) is local when it has a coverage area and worldwide when it has none.
 */
export function backgroundGroup(
  category: string | undefined,
  worldwide: boolean | undefined,
): BackgroundGroupId {
  if (category === 'map' || category === 'osmbasedmap') return 'maps'
  return worldwide ? 'global-photo' : 'local-photo'
}

/**
 * The rows in their groups, in the order of `BACKGROUND_GROUPS`. Empty groups are left out, except those named in
 * `keep` (the local photos, when OpenAerialMap images are listed in them), and the order of the rows inside a group is
 * kept.
 */
export function groupRows<T extends { group: BackgroundGroupId }>(
  rows: readonly T[],
  keep: readonly BackgroundGroupId[] = [],
) {
  return BACKGROUND_GROUPS.flatMap((group) => {
    const members = rows.filter((row) => row.group === group.id)
    return members.length > 0 || keep.includes(group.id)
      ? [{ id: group.id, label: groupLabel(group.id), rows: members }]
      : []
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
  if (attribution !== undefined)
    links.push({ label: m.imagery_link_attribution(), url: attribution })
  if (license !== undefined && license !== attribution) {
    links.push({ label: m.imagery_link_license(), url: license })
  }
  return links
}

/** The dates of a layer as the index gives them: `2010 – 2015`, `from 2010` or `until 2015`. Undefined when neither is given. */
export function dateText(startDate: string | undefined, endDate: string | undefined) {
  const start = startDate?.trim() || undefined
  const end = endDate?.trim() || undefined
  if (start !== undefined && end !== undefined)
    return start === end ? start : m.imagery_date_range({ start, end })
  if (start !== undefined) return m.imagery_date_from({ start })
  if (end !== undefined) return m.imagery_date_until({ end })
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

/** A group of overlays whose names start the same, or one overlay on its own */
export type OverlayEntry<T> =
  | { kind: 'layer'; item: T }
  | { kind: 'group'; label: string; items: { item: T; short: string }[] }

/** The part of a name before `: `, ` - ` or `, ` (`OSM Inspector: Highways` → `OSM Inspector`), if there is one */
function separatorPrefix(name: string) {
  const match = /^(.+?)(?::\s|\s-\s|,\s)/.exec(name)
  return match?.[1]?.trim()
}

/** The first `count` words of a name, when it has more words than that or exactly as many */
function firstWords(name: string, count: number) {
  const words = name.trim().split(/\s+/)
  return words.length >= count ? words.slice(0, count).join(' ') : undefined
}

/** The name without its group's prefix and the separator after it; the whole name when nothing is left */
function shortName(name: string, prefix: string) {
  const rest = name
    .slice(prefix.length)
    .replace(/^\s*[:,-]?\s*/, '')
    .trim()
  return rest === '' ? name : rest
}

/**
 * The overlays grouped by the start of their name, as many of them come from one provider (Tobias, 2026-11-27): first
 * the part before a separator (`OSM Inspector: …`, `IBGE BC250 - …`), then the first two words (`TIGER Roads 2022`),
 * then the first word (`Kartverket …`, `NVE …`). A group needs two overlays; one alone stays a row. A group stands
 * where its first overlay stood, its overlays keep their order, and each shows its name without the prefix.
 */
export function overlayGroups<T extends { name: string }>(items: readonly T[]): OverlayEntry<T>[] {
  const prefixOf = new Map<T, string>()
  const strategies = [
    separatorPrefix,
    (name: string) => firstWords(name, 2),
    (name: string) => {
      const word = firstWords(name, 1)
      // a short word (`The`, `De`) says nothing about the provider
      return word !== undefined && word.length >= 3 ? word : undefined
    },
  ]
  for (const strategy of strategies) {
    const counts = new Map<string, number>()
    const left = items.filter((item) => !prefixOf.has(item))
    for (const item of left) {
      const prefix = strategy(item.name)
      if (prefix !== undefined)
        counts.set(prefix.toLowerCase(), (counts.get(prefix.toLowerCase()) ?? 0) + 1)
    }
    for (const item of left) {
      const prefix = strategy(item.name)
      if (prefix !== undefined && (counts.get(prefix.toLowerCase()) ?? 0) >= 2)
        prefixOf.set(item, prefix)
    }
  }
  const entries: OverlayEntry<T>[] = []
  const groups = new Map<string, Extract<OverlayEntry<T>, { kind: 'group' }>>()
  for (const item of items) {
    const prefix = prefixOf.get(item)
    if (prefix === undefined) {
      entries.push({ kind: 'layer', item })
      continue
    }
    const key = prefix.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = { kind: 'group', label: prefix, items: [] }
      groups.set(key, group)
      entries.push(group)
    }
    group.items.push({ item, short: shortName(item.name, prefix) })
  }
  return entries
}
