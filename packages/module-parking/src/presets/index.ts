import type { PresetChanges } from '@osm-editor-kit/maid-presets'

/**
 * The app's preset changes: the parking fields on roads and the parking presets (the preset agent fills this).
 * Empty until then; the app's config applies it with `withChanges(data, parkingPresetChanges)`.
 */
export const parkingPresetChanges: PresetChanges = {}
