/**
 * The surface and smoothness field of roads, cycleways, paths and footways, as the Radnetz fork shows it (its WORKDOC
 * feature 24). One field replaces the schema's plain `surface` field and its `smoothness` field in these presets, so
 * the two tags have one home. The field id is ours (`surface_smoothness`); the keys are OSM's.
 *
 * Only the presets with a field list of their own are edited. Presets that take their list from another preset
 * (`{highway/primary}`, `{highway/residential}`: secondary, tertiary, unclassified, road) inherit the change; editing
 * them as well would show the field twice (the same note as in maid-module-traffic-signs).
 */
import type { PresetChanges } from '@osm-editor-kit/maid-presets'

/** The field type the module registers. Not an id-tagging-schema type: this module brings the field. */
export const SURFACE_SMOOTHNESS_FIELD_TYPE = 'surfaceSmoothness'

/** The field id in the preset lists */
export const SURFACE_SMOOTHNESS_FIELD_ID = 'surface_smoothness'

type SurfaceField = NonNullable<PresetChanges['fields']>[string]
type SurfacePresetEdit = NonNullable<PresetChanges['presetEdits']>[string]

/** The field both tags are written by. `keys` lists them; there is no single `key`. */
export const SURFACE_SMOOTHNESS_FIELD: SurfaceField = {
  type: SURFACE_SMOOTHNESS_FIELD_TYPE,
  label: 'Surface and smoothness',
  keys: ['surface', 'smoothness'],
  geometry: ['line'],
}

/**
 * The roads that have a field list of their own and show `surface` there (the same five as the traffic sign module).
 * The field takes the place of `surface` and sits before `structure`, which follows it in every one of these lists.
 * `smoothness` is in their more fields: it goes out of there.
 */
export const SURFACE_ROAD_PRESETS = [
  'highway/trunk',
  'highway/primary',
  'highway/residential',
  'highway/living_street',
  'highway/service',
] as const

/**
 * The paths with `surface` in their fields. `width` follows `surface` in each list, so the field takes its place
 * before `width`. Footways and paths have `smoothness` in their more fields; cycleways have it in their fields.
 */
export const SURFACE_PATH_PRESETS = ['highway/path', 'highway/footway'] as const
export const SURFACE_CYCLEWAY_PRESET = 'highway/cycleway'

const roadEdit: SurfacePresetEdit = {
  removeFields: ['surface'],
  addFields: [{ id: SURFACE_SMOOTHNESS_FIELD_ID, before: 'structure' }],
  removeMoreFields: ['smoothness'],
}

const pathEdit: SurfacePresetEdit = {
  removeFields: ['surface'],
  addFields: [{ id: SURFACE_SMOOTHNESS_FIELD_ID, before: 'width' }],
  removeMoreFields: ['smoothness'],
}

/** The cycleway lists `smoothness` among its fields, next to `surface`: both go, the field takes their place */
const cyclewayEdit: SurfacePresetEdit = {
  removeFields: ['surface', 'smoothness'],
  addFields: [{ id: SURFACE_SMOOTHNESS_FIELD_ID, before: 'width' }],
}

/**
 * The changes to the default presets: `withChanges(defaultPresetData, surfacePresetChanges)`. The changes can be
 * chained with other change sets (one `withChanges` per set): each set edits the lists as they are after the last.
 */
export const surfacePresetChanges: PresetChanges = {
  fields: { [SURFACE_SMOOTHNESS_FIELD_ID]: SURFACE_SMOOTHNESS_FIELD },
  presetEdits: {
    ...Object.fromEntries(SURFACE_ROAD_PRESETS.map((id) => [id, roadEdit])),
    ...Object.fromEntries(SURFACE_PATH_PRESETS.map((id) => [id, pathEdit])),
    [SURFACE_CYCLEWAY_PRESET]: cyclewayEdit,
  },
}
