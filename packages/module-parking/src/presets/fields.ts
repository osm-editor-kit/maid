/**
 * The parking fields: on a road (per side, `parking:left|right|both:*`) and on a separately mapped area, a
 * crossing and the rest. Values and key names come from the project's presets (parkraumprojekt.xml, value lists
 * `parking_values` … `crossing_side_values`) and the mapping decisions (project-decisions.md, 2.1 to
 * 2.10). Labels are messages (../messages.ts): each label is a function, read when the presets are made, so the
 * fields show the page's language. Values are OSM values and stay as they are.
 *
 * Reused from iD (changed or kept): `parking/side/parking` and `parking/side/orientation` (directional combos of
 * the road presets; changed: options, order, labels), `crossing` (changed: the project's three values first; other
 * values can still be typed), `orientation/orientation_parking`, `capacity_parking` and the crossing presets' other
 * fields (kept as they are). All other fields are new: iD's `fee`, `access_simple`, `maxstay`, `surface` and `width`
 * are shared by many presets, so they are not replaced here.
 *
 * Field types: a side field is a `directionalCombo` (left and right rows, `both` read as both sides, as iD does).
 * `parkingRestriction` is the restriction builder's field type (../restriction). It edits the restriction and its
 * `:conditional` key together, so the conditional keys are in the field's `keys`: removing or reverting the field
 * takes them along. The other conditional variants are free text.
 *
 * Not here, on purpose:
 * - Berlin's zone numbers and LOR areas: a later Berlin config, not the general presets.
 * - `restriction:reason:conditional` (decision D16): no side key in the source; the restriction builder owns it.
 * - `position_values` of the XML (14 values): no item of the XML uses it, and `parking:SIDE` takes the road values.
 * - `surface` for `parking:SIDE` values: the decisions say `surface` is for off-street lots, not road sides.
 */
import type { FieldDefinition, FieldOptions } from '@osm-editor-kit/maid-presets'
import { m } from '../messages.ts'
import { sideKey } from '../sides.ts'

type Field = FieldDefinition

/** A text that is read when it is used: the page's language at that time */
export type Text = () => string

/** The label of each value of a list, by value. A value without one shows the value itself. */
export type ValueLabels = Readonly<Record<string, Text>>

/** The options of a list of values, in this order, with the labels of `labels` (read when the options are used) */
export function options(values: readonly string[], labels: ValueLabels = {}): FieldOptions {
  return values.map((value) => ({
    value,
    get label() {
      return labels[value]?.() ?? value
    },
  }))
}

// ---- value lists of parkraumprojekt.xml (the values only; their labels are the messages below) ----

export const BOOL_VALUES = ['yes', 'no'] as const
export const ACCESS_VALUES = ['yes', 'private', 'permissive', 'customers', 'no'] as const
export const PARKING_VALUES = ['street_side', 'lane', 'on_kerb', 'half_on_kerb'] as const
export const ORIENTATION_VALUES = ['parallel', 'diagonal', 'perpendicular'] as const
export const SURFACE_VALUES = [
  'asphalt',
  'concrete',
  'concrete:plates',
  'paving_stones',
  'sett',
  'compacted',
  'ground',
] as const
export const MAXSTAY_VALUES = [
  '5 minutes',
  '15 minutes',
  '30 minutes',
  '1 hour',
  '2 hours',
  '3 hours',
  '24 hours',
  '7 days',
] as const
export const RESTRICTION_VALUES = [
  'no_parking',
  'no_stopping',
  'loading_only',
  'charging_only',
] as const
export const CROSSING_VALUES = ['unmarked', 'marked', 'traffic_signals'] as const
export const CROSSING_SIDE_VALUES = ['both', 'left', 'right'] as const
/** Vehicle keys of the checkgroup of `Parkplatz`; each is ticked as `designated` */
export const VEHICLE_KEYS = [
  'motorcar',
  'motorcycle',
  'motorhome',
  'goods',
  'hgv',
  'hgv_articulated',
  'bus',
  'taxi',
  'disabled',
] as const
/**
 * The side values of `parking:SIDE`. The project's 2026-02 list is street_side, lane, on_kerb, half_on_kerb,
 * shoulder, no (decision D1); `separate` is the value of the hot buttons; `yes` is kept from iD as the lead asked.
 */
export const SIDE_PARKING_VALUES = [
  'lane',
  'street_side',
  'on_kerb',
  'half_on_kerb',
  'shoulder',
  'separate',
  'no',
  'yes',
] as const

// ---- the labels of the values (messages) ----

const PARKING_LABELS: ValueLabels = {
  lane: () => m.option_parking_lane(),
  street_side: () => m.option_parking_street_side(),
  on_kerb: () => m.option_parking_on_kerb(),
  half_on_kerb: () => m.option_parking_half_on_kerb(),
  shoulder: () => m.option_parking_shoulder(),
  separate: () => m.option_parking_separate(),
  no: () => m.option_parking_no(),
  yes: () => m.option_parking_yes(),
}
const ORIENTATION_LABELS: ValueLabels = {
  parallel: () => m.option_orientation_parallel(),
  diagonal: () => m.option_orientation_diagonal(),
  perpendicular: () => m.option_orientation_perpendicular(),
}
const BOOL_LABELS: ValueLabels = { yes: () => m.option_yes(), no: () => m.option_no() }
const SURFACE_LABELS: ValueLabels = {
  asphalt: () => m.option_surface_asphalt(),
  concrete: () => m.option_surface_concrete(),
  'concrete:plates': () => m.option_surface_concrete_plates(),
  paving_stones: () => m.option_surface_paving_stones(),
  sett: () => m.option_surface_sett(),
  compacted: () => m.option_surface_compacted(),
  ground: () => m.option_surface_ground(),
}
const MAXSTAY_LABELS: ValueLabels = {
  '5 minutes': () => m.option_maxstay_5_minutes(),
  '15 minutes': () => m.option_maxstay_15_minutes(),
  '30 minutes': () => m.option_maxstay_30_minutes(),
  '1 hour': () => m.option_maxstay_1_hour(),
  '2 hours': () => m.option_maxstay_2_hours(),
  '3 hours': () => m.option_maxstay_3_hours(),
  '24 hours': () => m.option_maxstay_24_hours(),
  '7 days': () => m.option_maxstay_7_days(),
}
const ACCESS_LABELS: ValueLabels = {
  yes: () => m.option_access_yes(),
  private: () => m.option_access_private(),
  permissive: () => m.option_access_permissive(),
  customers: () => m.option_access_customers(),
  no: () => m.option_access_no(),
}
const RESTRICTION_LABELS: ValueLabels = {
  no_parking: () => m.option_restriction_no_parking(),
  no_stopping: () => m.option_restriction_no_stopping(),
  loading_only: () => m.option_restriction_loading_only(),
  charging_only: () => m.option_restriction_charging_only(),
}
const CROSSING_LABELS: ValueLabels = {
  unmarked: () => m.option_crossing_unmarked(),
  marked: () => m.option_crossing_marked(),
  traffic_signals: () => m.option_crossing_traffic_signals(),
}
const CROSSING_SIDE_LABELS: ValueLabels = {
  both: () => m.option_side_both(),
  left: () => m.option_side_left(),
  right: () => m.option_side_right(),
}
/** The reasons for `parking:<side>=no` the documents use: curve (project-decisions D4), narrow (D7), construction
 * (qa-markings S5), structure (O3), dual_carriage (S15). Other reasons can be typed. */
export const NO_PARKING_REASONS = [
  'curve',
  'narrow',
  'construction',
  'structure',
  'dual_carriage',
] as const
const REASON_LABELS: ValueLabels = {
  curve: () => m.option_reason_curve(),
  narrow: () => m.option_reason_narrow(),
  construction: () => m.option_reason_construction(),
  structure: () => m.option_reason_structure(),
  dual_carriage: () => m.option_reason_dual_carriage(),
}

const VEHICLE_LABELS: Record<(typeof VEHICLE_KEYS)[number], Text> = {
  motorcar: () => m.field_vehicle_motorcar(),
  motorcycle: () => m.field_vehicle_motorcycle(),
  motorhome: () => m.field_vehicle_motorhome(),
  goods: () => m.field_vehicle_goods(),
  hgv: () => m.field_vehicle_hgv(),
  hgv_articulated: () => m.field_vehicle_hgv_articulated(),
  bus: () => m.field_vehicle_bus(),
  taxi: () => m.field_vehicle_taxi(),
  disabled: () => m.field_vehicle_disabled(),
}

/** A field on a side: `parking:both:<suffix>` with the keys of left and right (no suffix: `parking:both`). */
function side(suffix: string | undefined, label: Text, extra: Partial<Field> = {}): Field {
  return {
    type: 'directionalCombo',
    get label() {
      return label()
    },
    key: sideKey('both', suffix),
    keys: [sideKey('left', suffix), sideKey('right', suffix)],
    customValues: true,
    ...extra,
  }
}
/** A side field with a fixed list of values */
function sideList(
  suffix: string | undefined,
  label: Text,
  values: readonly string[],
  labels: ValueLabels,
  extra: Partial<Field> = {},
): Field {
  return side(suffix, label, { customValues: false, options: options(values, labels), ...extra })
}
/** A free-text side field (the conditional variants, width, capacity, zone, reasons) */
function sideText(suffix: string, label: Text): Field {
  return side(suffix, label)
}
/** A plain combo on one key */
function combo(
  key: string,
  label: Text,
  values: readonly string[],
  labels: ValueLabels,
  extra: Partial<Field> = {},
): Field {
  return {
    type: 'combo',
    get label() {
      return label()
    },
    key,
    customValues: false,
    options: options(values, labels),
    ...extra,
  }
}
/** A plain text field on one key */
function text(key: string, label: Text): Field {
  return {
    type: 'text',
    get label() {
      return label()
    },
    key,
  }
}
/**
 * The restriction builder's field on a road. Its key is the `both` key; `keys` has the side keys and the
 * `:conditional` key of each spelling, which the builder writes too.
 */
function sideRestriction(label: Text, values: readonly string[], labels: ValueLabels): Field {
  const conditional = 'restriction:conditional'
  return {
    type: 'parkingRestriction',
    get label() {
      return label()
    },
    key: sideKey('both', 'restriction'),
    keys: [
      sideKey('left', 'restriction'),
      sideKey('right', 'restriction'),
      sideKey('both', conditional),
      sideKey('left', conditional),
      sideKey('right', conditional),
    ],
    customValues: false,
    options: options(values, labels),
  }
}

/**
 * The side fields of a road. Ids are ours (`parking/side/…`); `parking/side/parking` and `parking/side/orientation`
 * keep iD's id, so the road presets' lists that name them stay valid.
 */
export const ROAD_SIDE_FIELDS = {
  // the position has no suffix: `parking:both`, `parking:left`, `parking:right`
  'parking/side/parking': sideList(
    undefined,
    () => m.field_side_parking(),
    SIDE_PARKING_VALUES,
    PARKING_LABELS,
  ),
  'parking/side/orientation': sideList(
    'orientation',
    () => m.field_side_orientation(),
    ORIENTATION_VALUES,
    ORIENTATION_LABELS,
  ),
  'parking/side/restriction': sideRestriction(
    () => m.field_side_restriction(),
    RESTRICTION_VALUES,
    RESTRICTION_LABELS,
  ),
  'parking/side/restriction_reason': sideText('restriction:reason', () =>
    m.field_side_restriction_reason(),
  ),
  'parking/side/reason': side('reason', () => m.field_side_reason(), {
    options: options(NO_PARKING_REASONS, REASON_LABELS),
  }),
  'parking/side/fee': sideList('fee', () => m.field_side_fee(), BOOL_VALUES, BOOL_LABELS),
  'parking/side/fee_conditional': sideText('fee:conditional', () => m.field_side_fee_conditional()),
  'parking/side/zone': sideText('zone', () => m.field_side_zone()),
  'parking/side/maxstay': side('maxstay', () => m.field_side_maxstay(), {
    snakeCase: false,
    options: options(MAXSTAY_VALUES, MAXSTAY_LABELS),
  }),
  'parking/side/maxstay_conditional': sideText('maxstay:conditional', () =>
    m.field_side_maxstay_conditional(),
  ),
  'parking/side/markings': sideList(
    'markings',
    () => m.field_side_markings(),
    BOOL_VALUES,
    BOOL_LABELS,
  ),
  'parking/side/access': sideList(
    'access',
    () => m.field_side_access(),
    ACCESS_VALUES,
    ACCESS_LABELS,
  ),
  'parking/side/access_conditional': sideText('access:conditional', () =>
    m.field_side_access_conditional(),
  ),
  'parking/side/informal': sideList(
    'informal',
    () => m.field_side_informal(),
    BOOL_VALUES,
    BOOL_LABELS,
  ),
  'parking/side/staggered': {
    type: 'check',
    get label() {
      return m.field_side_staggered()
    },
    key: sideKey('both', 'staggered'),
  },
  'parking/side/width': sideText('width', () => m.field_side_width()),
  'parking/side/capacity': sideText('capacity', () => m.field_side_capacity()),
  'parking/side/surface': sideList(
    'surface',
    () => m.field_side_surface(),
    SURFACE_VALUES,
    SURFACE_LABELS,
  ),
} satisfies Record<string, Field>

/** The fields of a separately mapped parking area (`Parkplatz`), its disabled bay and the rest of the area presets */
export const AREA_FIELDS = {
  'parking/area/parking': combo(
    'parking',
    () => m.field_area_parking(),
    PARKING_VALUES,
    PARKING_LABELS,
  ),
  'parking/area/surface': combo(
    'surface',
    () => m.field_area_surface(),
    SURFACE_VALUES,
    SURFACE_LABELS,
  ),
  'parking/area/fee': combo('fee', () => m.field_area_fee(), BOOL_VALUES, BOOL_LABELS),
  'parking/area/fee_conditional': text('fee:conditional', () => m.field_area_fee_conditional()),
  'parking/area/maxstay': combo(
    'maxstay',
    () => m.field_area_maxstay(),
    MAXSTAY_VALUES,
    MAXSTAY_LABELS,
    {
      snakeCase: false,
    },
  ),
  'parking/area/maxstay_conditional': text('maxstay:conditional', () =>
    m.field_area_maxstay_conditional(),
  ),
  'parking/area/access': combo('access', () => m.field_area_access(), ACCESS_VALUES, ACCESS_LABELS),
  'parking/area/access_conditional': text('access:conditional', () =>
    m.field_area_access_conditional(),
  ),
  // the builder edits `restriction:conditional` too
  'parking/area/restriction': {
    type: 'parkingRestriction',
    get label() {
      return m.field_area_restriction()
    },
    key: 'restriction',
    keys: ['restriction:conditional'],
    customValues: false,
    options: options(RESTRICTION_VALUES, RESTRICTION_LABELS),
  },
  'parking/area/zone': text('zone', () => m.field_area_zone()),
  'parking/area/markings': combo(
    'markings',
    () => m.field_area_markings(),
    BOOL_VALUES,
    BOOL_LABELS,
  ),
  // The checkgroup of the XML: one combo per vehicle, whose only value is `designated`. A Maid check writes `yes`.
  ...Object.fromEntries(
    VEHICLE_KEYS.map((vehicle) => [
      `parking/area/vehicle/${vehicle}`,
      combo(vehicle, VEHICLE_LABELS[vehicle], ['designated'], {}),
    ]),
  ),
} satisfies Record<string, Field>

/**
 * The fields of a Querungsstelle. The crossing type replaces iD's `crossing` field (same key) with the project's
 * values; markings, island and tactile paving are iD's own fields on the crossing presets, whose lists hold every
 * value of the project's. The three side fields are the project's additions.
 */
export const CROSSING_FIELDS = {
  crossing: combo('crossing', () => m.field_crossing(), CROSSING_VALUES, CROSSING_LABELS, {
    customValues: true,
  }),
  'parking/crossing/kerb_extension': combo(
    'crossing:kerb_extension',
    () => m.field_crossing_kerb_extension(),
    CROSSING_SIDE_VALUES,
    CROSSING_SIDE_LABELS,
  ),
  'parking/crossing/buffer_marking': combo(
    'crossing:buffer_marking',
    () => m.field_crossing_buffer_marking(),
    CROSSING_SIDE_VALUES,
    CROSSING_SIDE_LABELS,
  ),
  'parking/crossing/buffer_protection': combo(
    'crossing:buffer_protection',
    () => m.field_crossing_buffer_protection(),
    CROSSING_SIDE_VALUES,
    CROSSING_SIDE_LABELS,
  ),
} satisfies Record<string, Field>

/** The fields the crossing presets get in addition to iD's */
export const CROSSING_EXTRA_FIELDS = [
  'parking/crossing/kerb_extension',
  'parking/crossing/buffer_marking',
  'parking/crossing/buffer_protection',
] as const

/** The area fields iD's Parking Lot gets under "Add field": the ones whose key it has no field for */
export const AREA_EXTRA_FIELDS = [
  'orientation/orientation_parking',
  'parking/area/restriction',
  'parking/area/zone',
  'parking/area/markings',
  'parking/area/fee_conditional',
  'parking/area/maxstay_conditional',
  'parking/area/access_conditional',
] as const

/** Every field this module adds or changes, by id */
export const PARKING_FIELDS: Record<string, Field> = {
  ...ROAD_SIDE_FIELDS,
  ...AREA_FIELDS,
  ...CROSSING_FIELDS,
}

/**
 * The fields a road shows first: the position, orientation, restriction, fee, zone, maximum stay and markings in that
 * order, before the road's own fields. The rest of the side fields are under "Add field" (moreFields).
 */
export const ROAD_PROMINENT_FIELDS = [
  'parking/side/parking',
  'parking/side/orientation',
  'parking/side/restriction',
  'parking/side/fee',
  'parking/side/zone',
  'parking/side/maxstay',
  'parking/side/markings',
] as const

/** The side fields that stay under "Add field" on a road */
export const ROAD_MORE_FIELDS = [
  'parking/side/restriction_reason',
  'parking/side/reason',
  'parking/side/fee_conditional',
  'parking/side/maxstay_conditional',
  'parking/side/access',
  'parking/side/access_conditional',
  'parking/side/informal',
  'parking/side/staggered',
  'parking/side/width',
  'parking/side/capacity',
  'parking/side/surface',
] as const
