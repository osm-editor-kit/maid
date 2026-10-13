import fields from '@openstreetmap/id-tagging-schema/dist/fields.min.json'
// The bundled id-tagging-schema data. Kept out of index.ts so that importing the library does not pull the data in.
import presets from '@openstreetmap/id-tagging-schema/dist/presets.min.json'
import translations from '@openstreetmap/id-tagging-schema/dist/translations/en.min.json'
import { createPresets } from './presets.ts'
import type { PresetData, Presets } from './types.ts'

export const defaultPresetData: PresetData = { presets, fields, translations }

// pure, so that an editor which builds its own presets from the data does not pay for these
export const defaultPresets: Presets = /* @__PURE__ */ createPresets(defaultPresetData)

export { discardedTags } from './discarded.ts'
