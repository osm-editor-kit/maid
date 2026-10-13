/**
 * The traffic sign fields of roads, cycleways, paths and footways, as the Radnetz fork shows them (its WORKDOC
 * features 2, 15 and 27). The field ids are new (`traffic_sign_*`), so the base `traffic_sign` field stays as it is
 * for the sign presets (`highway/traffic_sign`, `traffic_sign/*`).
 *
 * The way's sign is a field; the directions and the side keys of bike lanes and sidewalks are "more fields": they
 * show once they have a value, or when they are added under "Add field" (`fieldsFor` in maid-presets).
 */
import type { PresetChanges } from '@osm-editor-kit/maid-presets'

/** The field type the module registers. Not an id-tagging-schema type: this module brings the field. */
export const TRAFFIC_SIGN_FIELD_TYPE = 'trafficSign'

type SignField = NonNullable<PresetChanges['fields']>[string]
type SignPresetEdit = NonNullable<PresetChanges['presetEdits']>[string]

function signField(key: string, label: string) {
  return {
    type: TRAFFIC_SIGN_FIELD_TYPE,
    label,
    key,
    geometry: ['line'],
    snakeCase: false,
    caseSensitive: true,
  } satisfies SignField
}

/** Field id → definition. The ids are ours, the keys are OSM's. */
export const TRAFFIC_SIGN_FIELDS = {
  traffic_sign_way: signField('traffic_sign', 'Traffic Sign'),
  traffic_sign_forward: signField('traffic_sign:forward', 'Traffic Sign (Forward)'),
  traffic_sign_backward: signField('traffic_sign:backward', 'Traffic Sign (Backward)'),
  cycleway_left_traffic_sign: signField(
    'cycleway:left:traffic_sign',
    'Traffic Sign (Left Bike Lane)',
  ),
  cycleway_right_traffic_sign: signField(
    'cycleway:right:traffic_sign',
    'Traffic Sign (Right Bike Lane)',
  ),
  cycleway_both_traffic_sign: signField(
    'cycleway:both:traffic_sign',
    'Traffic Sign (Both Sides Bike Lane)',
  ),
  sidewalk_left_traffic_sign: signField(
    'sidewalk:left:traffic_sign',
    'Traffic Sign (Left Sidewalk)',
  ),
  sidewalk_right_traffic_sign: signField(
    'sidewalk:right:traffic_sign',
    'Traffic Sign (Right Sidewalk)',
  ),
  sidewalk_both_traffic_sign: signField(
    'sidewalk:both:traffic_sign',
    'Traffic Sign (Both Sides Sidewalk)',
  ),
} satisfies Record<string, SignField>

/**
 * The roads of the fork's feature 15 ("trunk … living_street, service") that have a field list of their own.
 * In the schema, secondary and tertiary take the list of primary (`{highway/primary}`) and unclassified that of
 * residential, so they show the change too; editing them as well would add every field twice.
 */
export const ROAD_PRESETS = [
  'highway/trunk',
  'highway/primary',
  'highway/residential',
  'highway/living_street',
  'highway/service',
] as const

/** Ways that are signed on their own: a bike path, a foot and cycle path, a footway */
export const PATH_PRESETS = ['highway/cycleway', 'highway/path', 'highway/footway'] as const

const DIRECTION_FIELDS = ['traffic_sign_forward', 'traffic_sign_backward'] as const
const SIDE_FIELDS = [
  'cycleway_left_traffic_sign',
  'cycleway_right_traffic_sign',
  'cycleway_both_traffic_sign',
  'sidewalk_left_traffic_sign',
  'sidewalk_right_traffic_sign',
  'sidewalk_both_traffic_sign',
] as const

/** A road: the way's sign, and its directions and the signs of its bike lanes and sidewalks */
const roadEdit: SignPresetEdit = {
  addFields: ['traffic_sign_way'],
  addMoreFields: [...DIRECTION_FIELDS, ...SIDE_FIELDS],
}

/** A path: the way's sign, and its directions */
const pathEdit: SignPresetEdit = {
  addFields: ['traffic_sign_way'],
  addMoreFields: [...DIRECTION_FIELDS],
}

/**
 * The changes to the default presets: `withChanges(defaultPresetData, trafficSignPresetChanges)`.
 * Field order: the way's sign goes last among the fields (the fork puts it after the width; not done here).
 */
export const trafficSignPresetChanges: PresetChanges = {
  fields: TRAFFIC_SIGN_FIELDS,
  presetEdits: {
    ...Object.fromEntries(ROAD_PRESETS.map((id) => [id, roadEdit])),
    ...Object.fromEntries(PATH_PRESETS.map((id) => [id, pathEdit])),
  },
}
