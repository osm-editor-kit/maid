/**
 * The parking fields: on a road (per side, `parking:left|right|both:*`) and on a separately mapped area, a
 * crossing and the rest. Values and key names come from the project's presets (parkraumprojekt.xml, value lists
 * `parking_values` … `crossing_side_values`) and the mapping decisions (project-decisions.md, 2.1 to
 * 2.10). English labels here; the German ones are in labels-de.ts.
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
import { sideKey } from '../sides.ts'

type Field = FieldDefinition

/** The options of a list of values, in this order. English labels default to the value. */
export function options(
  values: readonly string[],
  en: Readonly<Record<string, string>> = {},
): FieldOptions {
  return values.map((value) => ({ value, label: en[value] ?? value }))
}

// ---- value lists of parkraumprojekt.xml (the values only; labels are in labels-de.ts) ----

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

/** A field on a side: `parking:both:<suffix>` with the keys of left and right (no suffix: `parking:both`). */
function side(suffix: string | undefined, label: string, extra: Partial<Field> = {}): Field {
  return {
    type: 'directionalCombo',
    label,
    key: sideKey('both', suffix),
    keys: [sideKey('left', suffix), sideKey('right', suffix)],
    customValues: true,
    ...extra,
  }
}

/** A side field with a fixed list of values */
function sideList(
  suffix: string | undefined,
  label: string,
  values: readonly string[],
  extra: Partial<Field> = {},
): Field {
  return side(suffix, label, { customValues: false, options: options(values), ...extra })
}

/** A free-text side field (the conditional variants, width, capacity, zone, reasons) */
function sideText(suffix: string, label: string): Field {
  return side(suffix, label)
}

/** A plain combo on one key */
function combo(
  key: string,
  label: string,
  values: readonly string[],
  extra: Partial<Field> = {},
): Field {
  return { type: 'combo', label, key, customValues: false, options: options(values), ...extra }
}

/** A plain text field on one key */
function text(key: string, label: string): Field {
  return { type: 'text', label, key }
}

/**
 * The reasons for `parking:<side>=no` the documents use: curve (project-decisions D4), narrow (D7), construction
 * (qa-markings S5), structure (O3), dual_carriage (S15). Other reasons can be typed.
 */
export const NO_PARKING_REASONS = [
  'curve',
  'narrow',
  'construction',
  'structure',
  'dual_carriage',
] as const

/**
 * The restriction builder's field on a road. Its key is the `both` key; `keys` has the side keys and the
 * `:conditional` key of each spelling, which the builder writes too.
 */
function sideRestriction(label: string, values: readonly string[]): Field {
  const conditional = 'restriction:conditional'
  return {
    type: 'parkingRestriction',
    label,
    key: sideKey('both', 'restriction'),
    keys: [
      sideKey('left', 'restriction'),
      sideKey('right', 'restriction'),
      sideKey('both', conditional),
      sideKey('left', conditional),
      sideKey('right', conditional),
    ],
    customValues: false,
    options: options(values),
  }
}

/**
 * The side fields of a road. Ids are ours (`parking/side/…`); `parking/side/parking` and `parking/side/orientation`
 * keep iD's id, so the road presets' lists that name them stay valid.
 */
export const ROAD_SIDE_FIELDS = {
  // the position has no suffix: `parking:both`, `parking:left`, `parking:right`
  'parking/side/parking': sideList(undefined, 'Parking position', SIDE_PARKING_VALUES),
  'parking/side/orientation': sideList('orientation', 'Parking orientation', ORIENTATION_VALUES),
  'parking/side/restriction': sideRestriction('Parking restriction', RESTRICTION_VALUES),
  'parking/side/restriction_reason': sideText('restriction:reason', 'Restriction reason'),
  'parking/side/reason': side('reason', 'Reason for no parking', {
    options: options(NO_PARKING_REASONS),
  }),
  'parking/side/fee': sideList('fee', 'Parking fee', BOOL_VALUES),
  'parking/side/fee_conditional': sideText('fee:conditional', 'Parking fee (conditional)'),
  'parking/side/zone': sideText('zone', 'Parking zone'),
  'parking/side/maxstay': side('maxstay', 'Maximum stay', {
    snakeCase: false,
    options: options(MAXSTAY_VALUES),
  }),
  'parking/side/maxstay_conditional': sideText('maxstay:conditional', 'Maximum stay (conditional)'),
  'parking/side/markings': sideList('markings', 'Parking markings', BOOL_VALUES),
  'parking/side/access': sideList('access', 'Parking access', ACCESS_VALUES),
  'parking/side/access_conditional': sideText('access:conditional', 'Parking access (conditional)'),
  'parking/side/informal': sideList('informal', 'Informal (unpaved shoulder)', BOOL_VALUES),
  'parking/side/staggered': {
    type: 'check',
    label: 'Staggered parking (alternating sides)',
    key: sideKey('both', 'staggered'),
  },
  'parking/side/width': sideText('width', 'Parking width'),
  'parking/side/capacity': sideText('capacity', 'Parking capacity'),
  'parking/side/surface': sideList('surface', 'Parking surface', SURFACE_VALUES),
} satisfies Record<string, Field>

/** The fields of a separately mapped parking area (`Parkplatz`), its disabled bay and the rest of the area presets */
export const AREA_FIELDS = {
  'parking/area/parking': combo('parking', 'Parking type', PARKING_VALUES),
  'parking/area/surface': combo('surface', 'Surface', SURFACE_VALUES),
  'parking/area/fee': combo('fee', 'Fee', BOOL_VALUES),
  'parking/area/fee_conditional': text('fee:conditional', 'Fee (conditional)'),
  'parking/area/maxstay': combo('maxstay', 'Maximum stay', MAXSTAY_VALUES, { snakeCase: false }),
  'parking/area/maxstay_conditional': text('maxstay:conditional', 'Maximum stay (conditional)'),
  'parking/area/access': combo('access', 'Access', ACCESS_VALUES),
  'parking/area/access_conditional': text('access:conditional', 'Access (conditional)'),
  // the builder edits `restriction:conditional` too
  'parking/area/restriction': {
    type: 'parkingRestriction',
    label: 'Restriction',
    key: 'restriction',
    keys: ['restriction:conditional'],
    customValues: false,
    options: options(RESTRICTION_VALUES),
  },
  'parking/area/zone': text('zone', 'Zone'),
  'parking/area/markings': combo('markings', 'Markings', BOOL_VALUES),
  // The checkgroup of the XML: one combo per vehicle, whose only value is `designated`. A Maid check writes `yes`.
  ...Object.fromEntries(
    VEHICLE_KEYS.map((vehicle) => [
      `parking/area/vehicle/${vehicle}`,
      combo(vehicle, `Only ${vehicle} (signposted)`, ['designated']),
    ]),
  ),
} satisfies Record<string, Field>

/**
 * The fields of a Querungsstelle. The crossing type replaces iD's `crossing` field (same key) with the project's
 * values; markings, island and tactile paving are iD's own fields on the crossing presets, whose lists hold every
 * value of the project's. The three side fields are the project's additions.
 */
export const CROSSING_FIELDS = {
  crossing: combo('crossing', 'Crossing type', CROSSING_VALUES, { customValues: true }),
  'parking/crossing/kerb_extension': combo(
    'crossing:kerb_extension',
    'Kerb extension',
    CROSSING_SIDE_VALUES,
  ),
  'parking/crossing/buffer_marking': combo(
    'crossing:buffer_marking',
    'Buffer marking',
    CROSSING_SIDE_VALUES,
  ),
  'parking/crossing/buffer_protection': combo(
    'crossing:buffer_protection',
    'Buffer protection',
    CROSSING_SIDE_VALUES,
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
