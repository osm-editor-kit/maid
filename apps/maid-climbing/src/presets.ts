/**
 * The presets of Maid Climbing: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this
 * file, and through `import()`, so the schema is a chunk of its own (see apps/maid-parking/src/presets.ts).
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - climbing: the fields of id-tagging-schema PR 2793 (styles, pitches, more grade systems) on crags and routes
 */
import { climbingPresetChanges } from '@osm-editor-kit/maid-module-climbing'
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  return createPresets(
    withChanges(withChanges(defaultPresetData, streetImageryPresetChanges), climbingPresetChanges),
  )
}
