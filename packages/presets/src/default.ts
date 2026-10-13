import deprecated from '@openstreetmap/id-tagging-schema/dist/deprecated.min.json'
import fields from '@openstreetmap/id-tagging-schema/dist/fields.min.json'
import categories from '@openstreetmap/id-tagging-schema/dist/preset_categories.min.json'
import defaults from '@openstreetmap/id-tagging-schema/dist/preset_defaults.min.json'
// The bundled id-tagging-schema data. Kept out of index.ts so that importing the library does not pull the data in.
import presets from '@openstreetmap/id-tagging-schema/dist/presets.min.json'
import translations from '@openstreetmap/id-tagging-schema/dist/translations/en.min.json'
import { createPresets } from './presets.ts'
import type { PresetData, Presets } from './types.ts'

// The deprecated list is in this file, so in the presets' chunk: the validation of outdated tags reads it, and it is not in the start chunk.
// The categories and the defaults per geometry are here too: the type picker reads them, and they are not in the start chunk.
export const defaultPresetData: PresetData = {
  presets,
  fields,
  translations,
  deprecated,
  categories,
  defaults,
}

// pure, so that an editor which builds its own presets from the data does not pay for these
export const defaultPresets: Presets = /* @__PURE__ */ createPresets(defaultPresetData)

export { discardedTags } from './discarded.ts'
