import type { Preset, PresetCategory, PresetRow } from '@osm-editor-kit/maid-presets'
import { pickerRows } from './picker-logic.ts'

/**
 * Which part of the list a row is in: the search results, the favourites (first, under "Favourites"), the
 * recently used presets (under "Recently used"), or the defaults for the geometry.
 */
export type Section = 'search' | 'favourite' | 'recent' | 'default'

/**
 * A row as the picker draws it. A preset under an expanded category is a `member` (drawn indented, after its
 * category row). A category row carries whether it is expanded.
 */
export type ListRow =
  | { kind: 'preset'; key: string; section: Section; preset: Preset; member: boolean }
  | { kind: 'category'; key: string; category: PresetCategory; expanded: boolean }

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
  /** The favourites of the feature's geometry, in their order */
  favourites: readonly Preset[]
  /** The ids of the categories that are open */
  expanded: ReadonlySet<string>
}

function isCategory(row: PresetRow): row is PresetCategory {
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

/**
 * The rows the picker lists, in order. With a search: the found presets (pickerRows: no favourite is listed
 * twice). With an empty search: the favourites; then the recent presets, without the favourites; then the
 * defaults, without a preset that is a favourite or recent (it is listed where it was first). A category row is
 * followed by its members when it is open, and not otherwise. Nothing is listed twice in the defaults.
 */
export function listRows(input: ListInput): ListRow[] {
  const { searching, found, defaults, recent, favourites, expanded } = input
  if (searching) {
    return pickerRows(found, favourites, true).map((preset) => presetRow('search', preset))
  }

  const rows: ListRow[] = favourites.map((preset) => presetRow('favourite', preset))
  const favouriteIds = new Set(favourites.map((preset) => preset.id))
  const shownRecent: Preset[] = []
  for (const preset of recent) {
    if (favouriteIds.has(preset.id) || shownRecent.some((other) => other.id === preset.id)) continue
    shownRecent.push(preset)
  }
  for (const preset of shownRecent) rows.push(presetRow('recent', preset))

  const taken = new Set([...favouriteIds, ...shownRecent.map((preset) => preset.id)])
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
