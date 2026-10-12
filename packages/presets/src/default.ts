import fields from '@openstreetmap/id-tagging-schema/dist/fields.min.json'
// The bundled id-tagging-schema data. Kept out of index.ts so that importing the library does not pull the data in.
import presets from '@openstreetmap/id-tagging-schema/dist/presets.min.json'
import translations from '@openstreetmap/id-tagging-schema/dist/translations/en.min.json'
import { createPresets } from './presets.ts'
import type { PresetData, Presets } from './types.ts'

export const defaultPresetData: PresetData = { presets, fields, translations }

export const defaultPresets: Presets = createPresets(defaultPresetData)
