/**
 * The presets of Maid: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this file,
 * and through `import()`: the schema's data and the country data (about 1.9 MB) are a chunk of their own, fetched in
 * parallel with the entry and run after the map exists.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - surface and smoothness: one field for both tags on roads and paths, with bundled photos
 * Further changes are chained the same way: `withChanges(withChanges(data, a), b)`; see preset-changes.example.ts.
 */
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { surfacePresetChanges } from '@osm-editor-kit/maid-module-surface'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  return createPresets(
    withChanges(withChanges(defaultPresetData, streetImageryPresetChanges), surfacePresetChanges),
    // withChanges(…, examplePresetChanges): see preset-changes.example.ts
  )
}
