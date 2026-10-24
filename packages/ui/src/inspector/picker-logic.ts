import type { Preset } from '@osm-editor-kit/maid-presets'

/**
 * The row that becomes active after moving by `delta` (+1 or -1), wrapping at both ends.
 * An index outside the list (or none yet) starts from the first row going down and the last going up.
 * Returns -1 when there are no rows.
 */
export function moveActive(current: number, delta: 1 | -1, count: number) {
  if (count <= 0) return -1
  const from = current >= 0 && current < count ? current : delta > 0 ? -1 : count
  return (((from + delta) % count) + count) % count
}

/** The preset's first tag as `key=value`, or undefined when the preset has no tags. */
export function mainTagLabel(preset: Preset) {
  const first = Object.entries(preset.tags)[0]
  return first ? `${first[0]}=${first[1]}` : undefined
}

/**
 * The rows the picker lists, in order. With an empty search the favourites come first, then the
 * presets that were found without the favourites, so no row is listed twice. A search lists what
 * it found, favourites among them.
 */
export function pickerRows(
  found: readonly Preset[],
  favourites: readonly Preset[],
  searching: boolean,
) {
  if (searching || favourites.length === 0) return [...found]
  const favouriteIds = new Set(favourites.map((preset) => preset.id))
  return [...favourites, ...found.filter((preset) => !favouriteIds.has(preset.id))]
}

/**
 * The row that is active when the picker opens: the feature's type, or without one (a new feature with a generic
 * type) the most recently used type, so that Enter or one click takes it; else the first row.
 */
export function startRow(currentRow: number, favouriteCount: number, recentCount: number) {
  if (currentRow >= 0) return currentRow
  return recentCount > 0 ? favouriteCount : 0
}
