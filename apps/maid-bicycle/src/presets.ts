/**
 * The presets of Maid Bicycle: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this
 * file, and through `import()`: the schema's data and the country data (about 1.9 MB) are a chunk of their own,
 * fetched in parallel with the entry and run after the map exists.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - surface and smoothness: one field for both tags on roads and paths, with bundled photos
 * - traffic signs: one field for `traffic_sign` on roads, cycleways and paths (text input for now)
 * - bicycle infrastructure: a preset per TILDA category and subcategory (after the traffic signs, so its presets show
 *   the sign fields of the iD presets they are based on)
 * Further changes are chained the same way: `withChanges(withChanges(data, a), b)`.
 */
import { bikePresetChanges } from '@osm-editor-kit/maid-module-bike-infrastructure'
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { surfacePresetChanges } from '@osm-editor-kit/maid-module-surface'
import { trafficSignPresetChanges } from '@osm-editor-kit/maid-module-traffic-signs'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  const withSigns = withChanges(
    withChanges(withChanges(defaultPresetData, streetImageryPresetChanges), surfacePresetChanges),
    trafficSignPresetChanges,
  )
  return createPresets(withChanges(withSigns, bikePresetChanges(withSigns)))
}
