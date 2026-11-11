/**
 * The presets of Maid Lanes: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports this
 * file, and through `import()`, so the schema is a chunk of its own (see apps/maid-parking/src/presets.ts).
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - traffic signs: the German traffic sign field on roads (bus lanes, cycle lanes, turn arrows)
 */
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { trafficSignPresetChanges } from '@osm-editor-kit/maid-module-traffic-signs'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  return createPresets(
    withChanges(
      withChanges(defaultPresetData, streetImageryPresetChanges),
      trafficSignPresetChanges,
    ),
  )
}
