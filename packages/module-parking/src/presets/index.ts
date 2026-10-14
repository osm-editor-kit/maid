import type { PresetChanges } from '@osm-editor-kit/maid-presets'
import { PARKING_FIELDS } from './fields.ts'
import { PARKING_PRESET_EDITS, PARKING_PRESETS } from './presets.ts'

/**
 * The app's preset changes: the parking fields (per side on roads, and on areas and crossings), the parking presets
 * and the edits to the road, crossing and car park presets of the data. The app's config applies it with
 * `withChanges(data, parkingPresetChanges)`, after any other module's changes (for example the traffic signs).
 * The names and labels are messages, read when this is applied: they are in the page's language (see ../messages.ts).
 */
export const parkingPresetChanges: PresetChanges = {
  fields: PARKING_FIELDS,
  presets: PARKING_PRESETS,
  presetEdits: PARKING_PRESET_EDITS,
}
