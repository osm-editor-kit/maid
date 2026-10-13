import type { PresetChanges } from '@osm-editor-kit/maid-presets'
import { PARKING_FIELDS } from './fields.ts'
import { PARKING_PRESET_EDITS, PARKING_PRESETS } from './presets.ts'

export { LABELS_DE } from './labels-de.ts'
export { withGermanLabels } from './german.ts'
export { PARKING_FIELDS, PARKING_PRESETS, PARKING_PRESET_EDITS }

/**
 * The app's preset changes: the parking fields (per side on roads, and on areas and crossings), the parking presets
 * and the edits to the road, crossing and car park presets of the data. The app's config applies it with
 * `withChanges(data, parkingPresetChanges)`, after any other module's changes (for example the traffic signs).
 * German labels: LABELS_DE (labels-de.ts), applied by the app with `withGermanLabels(data)` when the visit is German.
 */
export const parkingPresetChanges: PresetChanges = {
  fields: PARKING_FIELDS,
  presets: PARKING_PRESETS,
  presetEdits: PARKING_PRESET_EDITS,
}
