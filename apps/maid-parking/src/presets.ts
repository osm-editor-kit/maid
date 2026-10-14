/**
 * The presets of Maid Parking: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this
 * file, and through `import()`: the schema's data and the country data (about 1.9 MB) are a chunk of their own,
 * fetched in parallel with the entry and run after the map exists.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - parking: the parking fields on roads and the parking presets; their names are the module's messages, in the page's
 *   language. The names are made here, after the page's language is set (see mount.tsx).
 */
import { parkingPresetChanges } from '@osm-editor-kit/maid-module-parking'
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  const data = withChanges(
    withChanges(defaultPresetData, streetImageryPresetChanges),
    parkingPresetChanges,
  )
  return createPresets(data)
}
