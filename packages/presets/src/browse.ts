// What the type picker lists before the person types: the recently used presets that fit the feature, then the
// defaults for its geometry (defaults.ts). Port of iD's presetIndex.recent and defaults (modules/presets/index.js).
// The list of ids is kept by the editor (packages/ui, recents); this file only reads it.
import { offered } from './defaults.ts'
import type { Geometry, LonLat, Preset, PresetRow, Presets } from './types.ts'

/** iD's MAX_RECENTS_TO_SHOW: how many recent presets the list shows */
export const RECENTS_TO_SHOW = 8

/** What the picker needs for an empty search, for one feature (its geometries and its place) */
export type Browse = {
  /** The defaults for the geometries: presets and categories, in iD's order */
  defaults: PresetRow[]
  /**
   * The recent presets that fit the geometries and the place, most recent first, at most `RECENTS_TO_SHOW`.
   * An id that is no preset, a hidden preset, a preset that does not match every geometry, and one whose
   * location set does not hold at `loc` are left out, and the list goes on with the next one (iD fills all slots,
   * issue #11405). An id given twice is listed once.
   */
  recent: (ids: readonly string[]) => Preset[]
}

/**
 * The browse list of a presets instance for a feature with these geometries and this place. Without `loc`
 * every location set holds, as in the search.
 */
export function browseOf(presets: Presets, geometries: readonly Geometry[], loc?: LonLat): Browse {
  return {
    defaults: presets.defaults(geometries),
    recent: (ids) => {
      if (geometries.length === 0) return []
      const seen = new Set<string>()
      const found: Preset[] = []
      for (const id of ids) {
        if (seen.has(id)) continue
        seen.add(id)
        const preset = presets.preset(id)
        if (!preset || !offered(preset, geometries)) continue
        if (loc !== undefined && !presets.matchesLocation(preset.locationSet, loc)) continue
        found.push(preset)
        if (found.length === RECENTS_TO_SHOW) break
      }
      return found
    },
  }
}
