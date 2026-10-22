/**
 * The background rows of the panel, with a time series as one row and its dates as chips under it.
 * Pure: no React, no MapLibre and no ELI at run time (the entry type is imported only), so the tests
 * run without a browser. `eli.ts` makes the entries with ELI's `groupLayers`.
 */
import type { EliLayerEntry } from '@osm-editor-kit/maplibre-editor-layer-index'
import { categoryLabel, everyWordIn, type Listing } from './helpers.ts'
import {
  backgroundGroup,
  layerAge,
  layerLinks,
  type BackgroundGroupId,
  type LayerLink,
} from './panel-rows.ts'

/** One date of a series, shown as a button under its row */
export type SeriesChip = {
  /** The layer's id: the stored choice when this date is chosen */
  id: string
  /** The date as ELI gives it, for example `2025 Sommer` */
  label: string
  /** The layer's own name, for the chip's tooltip; this is the name iD cites */
  name: string
  /** ELI's best layer of the series */
  best: boolean
  /** This date is the background drawn now */
  active: boolean
}

/** One row of the background list: a standalone layer, or a series with its dates */
export type SeriesRow = {
  /** The entry's id: the series' group id, or the layer's id for a standalone layer */
  key: string
  /** The series name without the date part, or the layer's name */
  name: string
  /** The category label of the newest date (the series is filed under it) */
  category: string | undefined
  /** The category as ELI gives it (`photo`, `historicmap` ...), for the row's icon */
  categoryId: string | undefined
  /** The group the row is listed under (see `panel-rows.ts`), from the newest date */
  group: BackgroundGroupId
  /** The row's Best mark: what a click on the row selects is ELI's best */
  best: boolean
  /** A date of this row is the background drawn now */
  selected: boolean
  /** What a click on the row selects: the default date (ELI's best, else the newest) */
  defaultId: string
  /** The attribution of the drawn date, or of the default date while none is drawn */
  attributionText: string | undefined
  /** The links of the drawn date (or the default date): the attribution's and the licence's */
  links: LayerLink[]
  /** The dates of the drawn date, or its series label when the index gives no dates */
  age: string | undefined
  /** Every date, newest first. Empty for a standalone layer. */
  chips: SeriesChip[]
}

/**
 * The rows for the entries, given the id of the background drawn now (or null). Best rows first,
 * then by name, as the flat list is. A series keeps the order of its dates from ELI (newest first).
 */
export function seriesRows(
  entries: readonly EliLayerEntry<Listing>[],
  shownId: string | null,
): SeriesRow[] {
  return [...entries]
    .sort(
      (a, b) =>
        Number(b.defaultVariant.best) - Number(a.defaultVariant.best) ||
        a.name.localeCompare(b.name, 'en'),
    )
    .map((entry) => {
      const drawn = entry.variants.find((variant) => variant.id === shownId)
      const chips: SeriesChip[] = entry.grouped
        ? entry.variants.map((variant) => ({
            id: variant.id,
            label: variant.group?.label ?? variant.name,
            name: variant.name,
            best: variant.best,
            active: variant.id === shownId,
          }))
        : []
      // filed under the newest date, as its category is
      const filed = entry.variants[0] ?? entry.defaultVariant
      const shown = drawn ?? entry.defaultVariant
      return {
        key: entry.id,
        name: entry.name,
        category: categoryLabel(filed.category),
        categoryId: filed.category,
        group: backgroundGroup(filed.category, filed.worldwide),
        best: entry.defaultVariant.best,
        selected: drawn !== undefined,
        defaultId: entry.defaultVariant.id,
        attributionText: shown.attributionText,
        links: layerLinks(shown),
        age: layerAge(shown, entry.grouped ? shown.group?.label : undefined),
        chips,
      }
    })
}

/** The rows that match a search: every word in the series name, the category or a date label */
export function filterSeriesRows(rows: readonly SeriesRow[], query: string) {
  return rows.filter((row) =>
    everyWordIn(
      [row.name, row.category ?? '', ...row.chips.map((chip) => chip.label)].join(' '),
      query,
    ),
  )
}
