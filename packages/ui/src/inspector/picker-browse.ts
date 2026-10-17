import type { Geometry, Preset, PresetCategory, PresetRow } from '@osm-editor-kit/maid-presets'
import type { FavouriteEntry } from '../favourites.ts'
import { pickerRows } from './picker-logic.ts'

/**
 * Which part of the list a row is in: the search results, the favourites (under the Favourites row), the recently
 * used presets (under "Recently used"), or the defaults for the geometry.
 */
export type Section = 'search' | 'favourite' | 'recent' | 'default'

/**
 * A row as the picker draws it. A preset under an expanded category or the Favourites row is a `member` (drawn
 * indented, after its row). A favourite's row carries its geometry: the favourites of every geometry are listed
 * there, and one whose geometry is not the feature's is drawn disabled. A category row carries whether it is expanded.
 */
export type ListRow =
  | {
      kind: 'preset'
      key: string
      section: Section
      preset: Preset
      member: boolean
      /** Set for a favourite under the Favourites row: the geometry the favourite is for */
      geometry?: Geometry
    }
  | { kind: 'category'; key: string; category: PresetCategory; expanded: boolean }
  | { kind: 'favourites'; key: string; expanded: boolean }

export type ListInput = {
  /** A non-empty search: only the search results are listed; no favourites, recents, defaults or categories */
  searching: boolean
  /** The presets the search found, best first (used when searching) */
  found: readonly Preset[]
  /**
   * The defaults for an empty search, in order: presets and categories (presets browseOf). Without the browse list,
   * the presets that an empty search gives.
   */
  defaults: readonly PresetRow[]
  /** The recently used presets that fit the feature, most recent first (browseOf.recent) */
  recent: readonly Preset[]
  /** All favourites, whatever their geometry, in their order: the Favourites row lists them when it is open */
  favourites: readonly FavouriteEntry[]
  /** The Favourites row is open: its favourites are listed under it */
  favouritesOpen: boolean
  /** The ids of the categories that are open */
  expanded: ReadonlySet<string>
}

export function isCategory(row: PresetRow): row is PresetCategory {
  return 'members' in row
}

function presetRow(section: Section, preset: Preset): ListRow {
  return { kind: 'preset', key: `${section}/${preset.id}`, section, preset, member: false }
}

// a member's key carries its category: the same preset may be a default too, and it is drawn twice
function memberRow(category: PresetCategory, preset: Preset): ListRow {
  return {
    kind: 'preset',
    key: `member/${category.id}/${preset.id}`,
    section: 'default',
    preset,
    member: true,
  }
}

// a favourite's key carries its geometry: one preset can be a favourite for two geometries
function favouriteRow(entry: FavouriteEntry): ListRow {
  return {
    kind: 'preset',
    key: `favourite/${entry.preset.id}/${entry.geometry}`,
    section: 'favourite',
    preset: entry.preset,
    member: true,
    geometry: entry.geometry,
  }
}

/**
 * The rows the picker lists, in order. With a search: the found presets (pickerRows: no favourite is listed twice).
 * With an empty search: the Favourites row, and under it, when it is open, every favourite; then the recent presets,
 * each once; then the defaults for the geometry. A favourite is listed under the Favourites row and, as before, where it
 * belongs among the recent presets and the defaults. A category row is followed by its members when it is open, and
 * not otherwise. Nothing is listed twice in the recent presets or the defaults.
 */
export function listRows(input: ListInput): ListRow[] {
  const { searching, found, defaults, recent, favourites, favouritesOpen, expanded } = input
  if (searching) {
    return pickerRows(
      found,
      favourites.map((entry) => entry.preset),
      true,
    ).map((preset) => presetRow('search', preset))
  }

  const rows: ListRow[] = []
  if (favourites.length > 0) {
    rows.push({ kind: 'favourites', key: 'favourites', expanded: favouritesOpen })
    if (favouritesOpen) for (const entry of favourites) rows.push(favouriteRow(entry))
  }

  const shownRecent: Preset[] = []
  for (const preset of recent) {
    if (shownRecent.some((other) => other.id === preset.id)) continue
    shownRecent.push(preset)
  }
  for (const preset of shownRecent) rows.push(presetRow('recent', preset))

  const taken = new Set(shownRecent.map((preset) => preset.id))
  for (const row of defaults) {
    if (isCategory(row)) {
      const isOpen = expanded.has(row.id)
      rows.push({ kind: 'category', key: `category/${row.id}`, category: row, expanded: isOpen })
      if (isOpen) for (const member of row.members) rows.push(memberRow(row, member))
    } else if (!taken.has(row.id)) {
      rows.push(presetRow('default', row))
    }
  }
  return rows
}
