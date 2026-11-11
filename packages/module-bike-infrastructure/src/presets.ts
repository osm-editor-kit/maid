/**
 * Presets for the bicycle infrastructure that TILDA recognises: one per category, and one per subcategory a mapper can
 * choose (along a road or on its own, advisory or exclusive lane). Each preset's tags are enough for TILDA's processing
 * to give its category; presets.test.ts checks that with `processBikelanes`. So the name in the inspector says what
 * TILDA will publish, and the map colour (groups.ts) matches it.
 *
 * Matching is by tags, one value per key (iD's matcher): a preset with more matching tags wins, so a footway with
 * `bicycle=yes` and `footway=sidewalk` is "Sidewalk, bicycles allowed" and not iD's Sidewalk. The subcategory that only
 * says TILDA cannot tell (`_adjoiningOrIsolated`) has no preset of its own beyond the category's: it is the category
 * without the sidepath tag. Road sides (`cycleway:right=lane`) are not presets: they are tags of the road, and the
 * TILDA section and the map show them.
 *
 * Names are messages (messages/*.json), read when the presets are made, so they follow the page's language. The
 * `terms` hold TILDA's German category names, so the search finds a preset by them in any language. The fields are those
 * of the iD preset the way otherwise is (`highway/cycleway`), read from the data the changes are applied to, so the
 * changes of other modules made before (the traffic sign field) come along; plus the sidepath field where the
 * subcategory depends on it.
 */
import type {
  FieldDefinition,
  PresetChanges,
  PresetData,
  PresetDefinition,
} from '@osm-editor-kit/maid-presets'
import { TILDA_LABELS } from '@tilda-geo/bicycle-infrastructure-tagging'
import { m } from './messages.ts'

/** The field of `is_sidepath`, which decides `_adjoining` or `_isolated`. iD has none. */
export const SIDEPATH_FIELD = 'bike_is_sidepath'

export const BIKE_FIELDS: Record<string, FieldDefinition> = {
  [SIDEPATH_FIELD]: {
    type: 'radio',
    label: 'Runs along a road',
    key: 'is_sidepath',
    options: [
      { value: 'yes', label: 'Yes, along a road' },
      { value: 'no', label: 'No, on its own' },
    ],
    geometry: ['line'],
  },
}

type BikePreset = {
  /** The preset id is `bicycle-infrastructure/<id>` */
  id: string
  /** The TILDA category the tags give */
  category: string
  tags: Record<string, string>
  geometry?: PresetDefinition['geometry']
  /** The iD preset whose fields the preset shows */
  base: string
  icon: string
  name: () => string
  /** With the sidepath field among the fields */
  sidepathField?: boolean
}

const CYCLEWAY = { highway: 'cycleway' }
const SHARED = { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'no' }
const SEGREGATED = { highway: 'path', bicycle: 'designated', foot: 'designated', segregated: 'yes' }
const FOOTWAY = { highway: 'footway', bicycle: 'yes' }
const ROAD = { highway: 'residential', bicycle_road: 'yes' }
const LANE = { highway: 'cycleway', cycleway: 'lane' }

/** The presets, in the order of TILDA's legend: bicycles alone, then with people on foot */
export const BIKE_PRESET_LIST: readonly BikePreset[] = [
  {
    id: 'cycleway/adjoining',
    category: 'cycleway_adjoining',
    tags: { ...CYCLEWAY, is_sidepath: 'yes' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_cycleway_adjoining(),
    sidepathField: true,
  },
  {
    id: 'cycleway/isolated',
    category: 'cycleway_isolated',
    tags: { ...CYCLEWAY, is_sidepath: 'no' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_cycleway_isolated(),
    sidepathField: true,
  },
  {
    id: 'cycleway/protected',
    category: 'cyclewayOnHighwayProtected',
    tags: { ...CYCLEWAY, is_sidepath: 'yes', 'separation:left': 'bollard' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_cycleway_protected(),
  },
  {
    id: 'lane',
    category: 'cyclewayOnHighway_advisoryOrExclusive',
    tags: LANE,
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_lane(),
  },
  {
    id: 'lane/exclusive',
    category: 'cyclewayOnHighway_exclusive',
    tags: { ...LANE, 'cycleway:lane': 'exclusive' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_lane_exclusive(),
  },
  {
    id: 'lane/advisory',
    category: 'cyclewayOnHighway_advisory',
    tags: { ...LANE, 'cycleway:lane': 'advisory' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_lane_advisory(),
  },
  {
    id: 'shared-lane',
    category: 'sharedMotorVehicleLane',
    tags: { ...CYCLEWAY, cycleway: 'shared_lane' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_shared_lane(),
  },
  {
    id: 'link',
    category: 'cyclewayLink',
    tags: { ...CYCLEWAY, cycleway: 'link' },
    base: 'highway/cycleway',
    icon: 'fas-biking',
    name: () => m.preset_link(),
  },
  {
    id: 'bicycle-road',
    category: 'bicycleRoad',
    tags: ROAD,
    base: 'highway/residential',
    icon: 'fas-biking',
    name: () => m.preset_bicycle_road(),
  },
  {
    id: 'bicycle-road/destination',
    category: 'bicycleRoad_vehicleDestination',
    tags: { ...ROAD, motor_vehicle: 'destination' },
    base: 'highway/residential',
    icon: 'fas-biking',
    name: () => m.preset_bicycle_road_destination(),
  },
  {
    id: 'segregated',
    category: 'footAndCyclewaySegregated_adjoiningOrIsolated',
    tags: SEGREGATED,
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_segregated(),
    sidepathField: true,
  },
  {
    id: 'segregated/adjoining',
    category: 'footAndCyclewaySegregated_adjoining',
    tags: { ...SEGREGATED, is_sidepath: 'yes' },
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_segregated_adjoining(),
    sidepathField: true,
  },
  {
    id: 'segregated/isolated',
    category: 'footAndCyclewaySegregated_isolated',
    tags: { ...SEGREGATED, is_sidepath: 'no' },
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_segregated_isolated(),
    sidepathField: true,
  },
  {
    id: 'shared',
    category: 'footAndCyclewayShared_adjoiningOrIsolated',
    tags: SHARED,
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_shared(),
    sidepathField: true,
  },
  {
    id: 'shared/adjoining',
    category: 'footAndCyclewayShared_adjoining',
    tags: { ...SHARED, is_sidepath: 'yes' },
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_shared_adjoining(),
    sidepathField: true,
  },
  {
    id: 'shared/isolated',
    category: 'footAndCyclewayShared_isolated',
    tags: { ...SHARED, is_sidepath: 'no' },
    base: 'highway/path/bicycle_foot',
    icon: 'temaki-pedestrian_and_cyclist',
    name: () => m.preset_shared_isolated(),
    sidepathField: true,
  },
  {
    id: 'footway',
    category: 'footwayBicycleYes_adjoiningOrIsolated',
    tags: FOOTWAY,
    base: 'highway/footway',
    icon: 'temaki-pedestrian',
    name: () => m.preset_footway(),
    sidepathField: true,
  },
  {
    id: 'footway/sidewalk',
    category: 'footwayBicycleYes_adjoining',
    tags: { ...FOOTWAY, footway: 'sidewalk' },
    base: 'highway/footway/sidewalk',
    icon: 'temaki-pedestrian',
    name: () => m.preset_footway_sidewalk(),
  },
  {
    id: 'footway/isolated',
    category: 'footwayBicycleYes_isolated',
    tags: { ...FOOTWAY, is_sidepath: 'no' },
    base: 'highway/footway',
    icon: 'temaki-pedestrian',
    name: () => m.preset_footway_isolated(),
    sidepathField: true,
  },
  {
    id: 'pedestrian',
    category: 'pedestrianAreaBicycleYes',
    tags: { highway: 'pedestrian', bicycle: 'yes' },
    geometry: ['line', 'area'],
    base: 'highway/pedestrian_line',
    icon: 'temaki-pedestrian',
    name: () => m.preset_pedestrian(),
  },
]

export function presetId(preset: Pick<BikePreset, 'id'>) {
  return `bicycle-infrastructure/${preset.id}`
}

/** TILDA's German name of a category, as a search term; HTML soft hyphens removed */
function tildaName(category: string) {
  return TILDA_LABELS.de[`category=${category}`]?.replaceAll('&shy;', '')
}

type FieldLists = { fields?: readonly string[]; moreFields?: readonly string[] }

/** The field lists of a preset of the data; empty when the data has no such preset */
function fieldListsOf(data: PresetData, id: string): FieldLists {
  const raw = data.presets[id]
  if (typeof raw !== 'object' || raw === null) return {}
  const { fields, moreFields } = raw as FieldLists
  return { fields, moreFields }
}

function definition(preset: BikePreset, data: PresetData): PresetDefinition {
  const base = fieldListsOf(data, preset.base)
  const fields = [...(base.fields ?? [])]
  if (preset.sidepathField && !fields.includes(SIDEPATH_FIELD)) fields.push(SIDEPATH_FIELD)
  const terms = ['bicycle', 'cycle', 'tilda', 'radinfrastruktur']
  const german = tildaName(preset.category)
  if (german) terms.push(german)
  return {
    get name() {
      return preset.name()
    },
    tags: preset.tags,
    addTags: preset.tags,
    geometry: preset.geometry ?? ['line'],
    icon: preset.icon,
    terms,
    fields,
    moreFields: [...(base.moreFields ?? [])],
  }
}

/**
 * The app's preset changes for the data they are applied to: `withChanges(data, bikePresetChanges(data))`, after the
 * traffic signs' changes, so the presets show their fields
 */
export function bikePresetChanges(data: PresetData): PresetChanges {
  return {
    fields: BIKE_FIELDS,
    presets: Object.fromEntries(
      BIKE_PRESET_LIST.map((preset) => [presetId(preset), definition(preset, data)]),
    ),
  }
}
