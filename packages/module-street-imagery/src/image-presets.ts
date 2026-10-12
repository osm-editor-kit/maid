/**
 * The "Street-level images" field for every feature: it replaces the schema's `mapillary` field, and is a universal
 * field over all image keys, so it can be added with "Add field" and shows once one of its keys has a value. The app's config applies it with `withChanges` (see
 * README.md).
 */
import { IMAGE_KEYS, STREET_IMAGES_FIELD_TYPE } from './image-keys.ts'

/**
 * The field's id is `mapillary`, the id of the schema's identifier field for one Mapillary image: a field with
 * that id replaces it in every preset, so the feature shows one field for all image keys (as the fork does).
 */
export const STREET_IMAGES_FIELD_ID = 'mapillary'

/**
 * The shape of maid-presets' `PresetChanges` that this field uses. Written out here because this module does not
 * depend on maid-presets; any object of this shape is a valid `PresetChanges`.
 */
export type StreetImagesPresetChanges = {
  fields: Readonly<Record<string, { type: string; label: string; keys: readonly string[] }>>
  universalFields: { add: readonly string[] }
}

export const streetImageryPresetChanges: StreetImagesPresetChanges = {
  fields: {
    [STREET_IMAGES_FIELD_ID]: {
      type: STREET_IMAGES_FIELD_TYPE,
      label: 'Street-level images',
      keys: IMAGE_KEYS,
    },
  },
  universalFields: { add: [STREET_IMAGES_FIELD_ID] },
}
