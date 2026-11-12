/**
 * The presets of Maid Golf: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this
 * file, and through `import()`: the schema's data and the country data are a chunk of their own, fetched in parallel
 * with the entry and run after the map exists.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - golf: bunkers with natural=sand, water hazards with natural=water, a pin preset, and the golf presets first in the
 *   type picker (the defaults per geometry)
 */
import { golfPresetChanges, withGolfDefaults } from '@osm-editor-kit/maid-module-golf'
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  const data = withChanges(
    withChanges(defaultPresetData, streetImageryPresetChanges),
    golfPresetChanges,
  )
  return createPresets({ ...data, defaults: withGolfDefaults(data.defaults) })
}
