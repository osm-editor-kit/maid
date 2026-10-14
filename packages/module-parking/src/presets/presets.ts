/**
 * The parking presets: the items of parkraumprojekt.xml, and the road presets that show the side fields.
 *
 * Matching is by tags, one value per key (iD's matcher), so an item of the XML maps to presets as follows:
 * - `Parkplatz` matches any `amenity=parking` area and offers four `parking` values. Here it is one preset per value
 *   (`parking=street_side`, `lane`, `on_kerb`, `half_on_kerb`), all with the same fields, so the fields stay when the
 *   value changes. The one for `street_side` keeps the id of iD's Street-side Parking, which has the same tags: a
 *   second preset with the same tags would tie with it and never be chosen. A car park (`amenity=parking` alone, or
 *   `parking=surface`) stays iD's Parking Lot, which gets the project's fields under "Add field".
 * - `Behindertenparkplatz`, `Tiefgarageneinfahrt` and `Hindernis` have tags of their own.
 * - `Einfahrt` (`highway=service` + `service=driveway`), `Abgesenkter Bordstein` (`barrier=kerb` + `kerb=lowered`) and
 *   `Querungsstelle` (`highway=crossing`) are iD's presets with the same tags. They are not replaced: the XML items
 *   have no fields a mapper would miss in iD's, and replacing them took iD's fields, match scores and geometry away
 *   (a crossing is a vertex of a road, never a free point). The crossings get the project's three extra fields.
 *
 * JOSM's `node` is a point and a vertex in Maid, `way` a line, `closedway` an area.
 *
 * Names are messages (../messages.ts), read when the presets are made, so they follow the page's language. The `terms`
 * (search words) keep the German words of the XML, so the search finds them in either language. Fixed tags of the XML are
 * `addTags`.
 *
 * Berlin-specific: nothing here (zones, LOR areas). The fixed tags `access=no` and `disabled=private` of the
 * Behindertenparkplatz are taken as written; the mapping team lists the personal disabled bay as open
 * (qa-markings-obstacles-process.md S28; josm-setup-presets-styles.md 2.6), so this preset may change.
 */
import type { PresetDefinition, PresetEdit } from '@osm-editor-kit/maid-presets'
import { m } from '../messages.ts'
import {
  AREA_EXTRA_FIELDS,
  CROSSING_EXTRA_FIELDS,
  PARKING_VALUES,
  ROAD_MORE_FIELDS,
  ROAD_PROMINENT_FIELDS,
  VEHICLE_KEYS,
} from './fields.ts'

/** The area fields the Parkplatz (separately mapped parking area) shows. `restriction` edits its `:conditional` too. */
const PARKPLATZ_FIELDS = [
  'parking/area/parking',
  'orientation/orientation_parking',
  'parking/area/surface',
  'capacity_parking',
  'parking/area/fee',
  'parking/area/fee_conditional',
  'parking/area/maxstay',
  'parking/area/maxstay_conditional',
  'parking/area/access',
  'parking/area/access_conditional',
  'parking/area/restriction',
  'parking/area/zone',
  'parking/area/markings',
]

/** The id of the Parkplatz preset of a `parking` value. `street_side` is iD's id (see the file comment). */
export function parkplatzId(value: (typeof PARKING_VALUES)[number]) {
  return value === 'street_side' ? 'amenity/parking/street-side' : `parking/area/${value}`
}

/** The names of the Parkplatz presets: messages, read when the presets are made (the page's language) */
const PARKPLATZ_NAMES: Record<(typeof PARKING_VALUES)[number], () => string> = {
  street_side: () => m.preset_parkplatz_street_side(),
  lane: () => m.preset_parkplatz_lane(),
  on_kerb: () => m.preset_parkplatz_on_kerb(),
  half_on_kerb: () => m.preset_parkplatz_half_on_kerb(),
}

/** Parkplatz (JOSM: closedway, mapped separately): one preset per `parking` value */
const PARKPLATZ_PRESETS: Record<string, PresetDefinition> = Object.fromEntries(
  PARKING_VALUES.map((value) => [
    parkplatzId(value),
    {
      get name() {
        return PARKPLATZ_NAMES[value]()
      },
      tags: { amenity: 'parking', parking: value },
      addTags: { amenity: 'parking', parking: value },
      geometry: ['area'],
      icon: 'temaki-car_parked',
      terms: [
        'parking area',
        'parking bay',
        'street parking',
        'Parkplatz',
        'Parkbucht',
        'Parkfläche',
        'Straßenparken',
        'separat erfasst',
      ],
      fields: PARKPLATZ_FIELDS,
      moreFields: VEHICLE_KEYS.map((vehicle) => `parking/area/vehicle/${vehicle}`),
    } satisfies PresetDefinition,
  ]),
)

/** The presets this module adds, and the one default preset it replaces (iD's Street-side Parking), by id */
export const PARKING_PRESETS: Record<string, PresetDefinition> = {
  ...PARKPLATZ_PRESETS,
  // Behindertenparkplatz mit Ausweisnummer (JOSM: closedway). Fixed tags: access=no, disabled=private, the sign.
  // The match score lets it win over the Parkplatz presets, which match the same area by `parking=*`.
  'parking/area/disabled_permit': {
    get name() {
      return m.preset_disabled_permit()
    },
    tags: { amenity: 'parking', disabled: 'private' },
    addTags: {
      amenity: 'parking',
      disabled: 'private',
      access: 'no',
      traffic_sign: 'DE:314,1044-11',
    },
    geometry: ['area'],
    matchScore: 1.2,
    icon: 'temaki-accessible_space',
    terms: [
      'disabled parking',
      'accessible parking',
      'Behindertenparkplatz',
      'Schwerbehindertenparkplatz',
      'Ausweisnummer',
      'Parkplatz Behinderte',
    ],
    fields: [
      'parking/area/parking',
      'orientation/orientation_parking',
      'parking/area/surface',
      'capacity_parking',
      'parking/area/markings',
    ],
  },
  // Tiefgarageneinfahrt (JOSM: node)
  'parking/entrance_underground': {
    get name() {
      return m.preset_underground_entrance()
    },
    tags: { amenity: 'parking_entrance', parking: 'underground' },
    addTags: { amenity: 'parking_entrance', parking: 'underground' },
    geometry: ['point', 'vertex'],
    icon: 'temaki-car_structure',
    terms: [
      'parking garage entrance',
      'underground parking entrance',
      'Tiefgarageneinfahrt',
      'Tiefgarage',
      'Einfahrt Tiefgarage',
    ],
    fields: ['parking/area/access', 'parking/area/access_conditional'],
  },
  // Hindernis im Parkbereich (JOSM: node, way, closedway)
  'parking/obstacle': {
    get name() {
      return m.preset_obstacle()
    },
    tags: { 'obstacle:parking': 'yes' },
    addTags: { 'obstacle:parking': 'yes' },
    geometry: ['point', 'vertex', 'line', 'area'],
    icon: 'temaki-bollard',
    terms: [
      'obstacle',
      'parking obstacle',
      'Hindernis',
      'Parkhindernis',
      'Hindernis im Parkbereich',
    ],
    fields: [],
  },
}

/** The roads that show the side fields. Trunk roads and links are left out: parking on them is not mapped. */
export const PARKING_ROADS = [
  'highway/primary',
  'highway/residential',
  'highway/living_street',
  'highway/service',
] as const

/**
 * The road presets' edit. A parking editor shows the parking fields first: the prominent side fields go before the
 * road's own fields (name, one way, speed limit, lanes, surface), in the order of ROAD_PROMINENT_FIELDS. Position and
 * orientation are in the schema's `moreFields` and move from there; the rest of the side fields are added to
 * `moreFields`. Unclassified, tertiary, secondary and road take these lists from residential and primary in the schema
 * (`{highway/…}` references), so they show the change too.
 */
export const ROAD_PRESET_EDIT: PresetEdit = {
  addFields: ROAD_PROMINENT_FIELDS.map((id) => ({ id, before: 'name' })),
  removeMoreFields: ['parking/side/parking', 'parking/side/orientation'],
  addMoreFields: [...ROAD_MORE_FIELDS],
}

/** iD's crossing presets on a road's vertex. `informal` has no `highway=crossing` of its own and is left out. */
export const CROSSING_PRESETS = [
  'highway/crossing',
  'highway/crossing/unmarked',
  'highway/crossing/uncontrolled',
  'highway/crossing/marked',
  'highway/crossing/zebra',
  'highway/crossing/traffic_signals',
] as const

/**
 * The names of three of iD's presets, which have the tags of the XML's items under the project's names (Einfahrt,
 * Abgesenkter Bordstein, Querungsstelle). iD's English names are the English here; the messages hold every language.
 */
const IDS_NAMES: Record<string, () => string> = {
  'highway/service/driveway': () => m.preset_driveway(),
  'barrier/kerb/lowered': () => m.preset_lowered_kerb(),
  'highway/crossing': () => m.preset_crossing(),
}

/** The edits to presets of the data, by id: the roads, the crossings (the project's three extra fields), the car park, and the names above */
export const PARKING_PRESET_EDITS: Record<string, PresetEdit> = (() => {
  const edits: Record<string, PresetEdit> = {
    ...Object.fromEntries(PARKING_ROADS.map((id) => [id, ROAD_PRESET_EDIT])),
    ...Object.fromEntries(
      CROSSING_PRESETS.map((id) => [
        id,
        { addFields: [...CROSSING_EXTRA_FIELDS] } satisfies PresetEdit,
      ]),
    ),
    // iD's Parking Lot: what the project tags on a parking area, shown once it has a value or picked under "Add field"
    'amenity/parking': { addMoreFields: [...AREA_EXTRA_FIELDS] },
  }
  for (const [id, name] of Object.entries(IDS_NAMES)) {
    edits[id] = {
      ...edits[id],
      get name() {
        return name()
      },
    }
  }
  return edits
})()
