import { matches } from './filters'
import type { Filter, Geometry, Tags } from './types'

/*
 * iD's feature categories as Maid's default filters, ported from iD's renderer/features.js
 * (`defineRule` calls). Ids and English names are iD's (data/core.yaml, `feature:`).
 *
 * iD evaluates every rule and an object can belong to several categories. Maid takes the first
 * filter in this list that matches, so the order below decides which category an object gets.
 * It is chosen so that the first match is the category iD's rules would give it, including
 * iD's own exclusions (a road is never rail, a building is never landuse, and so on).
 *
 * Geometry: iD gives vertices no category at all; a vertex takes the state of its ways, which is
 * the caller's job. Every default filter therefore names its geometries and leaves out `vertex`.
 * Where iD restricts a rule to one geometry (points, landuse, boundaries, others), so does this.
 */

/** Everything iD categorises: all but vertices */
const objects: Geometry[] = ['point', 'line', 'area', 'relation']
/** Ways, closed or not */
const ways: Geometry[] = ['line', 'area']

const trafficHighways = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'busway',
]
const serviceHighways = ['service', 'road', 'track']
const pathHighways = ['path', 'footway', 'cycleway', 'bridleway', 'steps', 'ladder', 'pedestrian']
const trafficSet: ReadonlySet<string> = new Set(trafficHighways)
const serviceSet: ReadonlySet<string> = new Set(serviceHighways)
const pathSet: ReadonlySet<string> = new Set(pathHighways)

function isRoadOrPath(highway: string | undefined) {
  return (
    highway !== undefined &&
    (trafficSet.has(highway) || serviceSet.has(highway) || pathSet.has(highway))
  )
}

/** iD's osmLifecyclePrefixes (modules/osm/tags.ts) */
const lifecycleWords = [
  'proposed',
  'planned',
  'construction',
  'disused',
  'abandoned',
  'was',
  'dismantled',
  'razed',
  'demolished',
  'destroyed',
  'removed',
  'intermittent',
]
const lifecycleSet: ReadonlySet<string> = new Set(lifecycleWords)

/** `disused:shop`, `construction:railway` and so on: the key starts with a lifecycle word and a colon */
function hasLifecyclePrefix(key: string) {
  const colon = key.indexOf(':')
  if (colon < 0) return false
  for (const word of lifecycleWords) {
    if (colon === word.length && key.startsWith(word)) return true
  }
  return false
}

/**
 * iD's `past_future`: any value or key is a lifecycle word, and the object is not a road or path.
 * Data cannot say "a value or a key prefix is one of these words", so this is a function. It
 * loops over the keys without allocating, because it runs for every object.
 */
function isPastFuture(tags: Tags) {
  if (isRoadOrPath(tags.highway)) return false
  for (const key in tags) {
    const value = tags[key]
    if (value !== undefined && lifecycleSet.has(value)) return true
    if (hasLifecyclePrefix(key)) return true
  }
  return false
}

/** iD's `isAddressPoint` (modules/svg/labels.js) and the key lists it uses (modules/osm/tags.ts) */
const uninterestingKeys: ReadonlySet<string> = new Set([
  'attribution',
  'created_by',
  'import_uuid',
  'lat',
  'latitude',
  'lon',
  'longitude',
  'source',
  'source_ref',
  'odbl',
  'odbl:note',
])
const uninterestingKeyRegex =
  /^(source(_ref)?|at_bev|geobase|hcpaogis|KSJ2|mvdgis|nvdb|nysgissam|tiger):|:(identifier|ref|ref_id|id)$/
const nonPrimaryKeys: ReadonlySet<string> = new Set([
  'building:flats',
  'check_date',
  'fixme',
  'layer',
  'level',
  'note',
  'start_date',
  'ele',
])
const nonPrimaryKeyRegex = /^(ref|survey|note|([^:]+:|old_|alt_)addr):/

/**
 * iD's address point: at least one interesting key, and every interesting key starts with `addr:`.
 * Data cannot say "every key starts with a prefix", so this is a function.
 */
function isAddressPoint(tags: Tags) {
  let found = false
  for (const key in tags) {
    if (uninterestingKeys.has(key) || uninterestingKeyRegex.test(key)) continue
    if (nonPrimaryKeys.has(key) || nonPrimaryKeyRegex.test(key)) continue
    if (!key.startsWith('addr:')) return false
    found = true
  }
  return found
}

/**
 * iD's `boundaries`: a line with `boundary=*`, or a relation with `type=boundary`, that is not also
 * a road, path, waterway, railway, landuse, natural, building or power object. The geometry pairing
 * and the exclusions cannot be said as one data rule, so this is a function. The exclusions are
 * also guarded by the order of the list; they are kept here so the filter means what iD means.
 */
function isBoundary(tags: Tags, geometry: Geometry) {
  const boundaryObject =
    (geometry === 'line' && !!tags.boundary) ||
    (geometry === 'relation' && tags.type === 'boundary')
  if (!boundaryObject) return false
  return (
    !isRoadOrPath(tags.highway) &&
    !tags.waterway &&
    !tags.railway &&
    !tags.landuse &&
    !tags.natural &&
    !tags.building &&
    !tags.power
  )
}

/**
 * iD's `aerialways`: any `aerialway` value except `yes` (the generic way) and `station`. Data would
 * need every other value listed, so this is a function.
 */
function isAerialway(tags: Tags) {
  return !!tags.aerialway && tags.aerialway !== 'yes' && tags.aerialway !== 'station'
}

// The more specific categories come first; the first match decides (see the note at the top).

/** Lifecycle tags. Roads and paths are excluded by the function. */
export const pastFuture: Filter = {
  id: 'past_future',
  label: 'Past/Future Features',
  match: isPastFuture,
  geometry: objects,
  state: 'editable',
}

/** Points with only address tags. Points only. */
export const addressPoints: Filter = {
  id: 'address_points',
  label: 'Address Points',
  match: isAddressPoint,
  geometry: ['point'],
  state: 'editable',
}

export const buildingParts: Filter = {
  id: 'building_parts',
  label: 'Building Parts',
  match: { 'building:part': '*' },
  geometry: objects,
  state: 'editable',
}

export const indoor: Filter = {
  id: 'indoor',
  label: 'Indoor Features',
  match: [{ indoor: '*' }, { indoormark: '*' }],
  geometry: objects,
  state: 'editable',
}

export const pistes: Filter = {
  id: 'pistes',
  label: 'Pistes',
  match: { 'piste:type': '*' },
  geometry: objects,
  state: 'editable',
}

export const aerialways: Filter = {
  id: 'aerialways',
  label: 'Aerial Features',
  match: isAerialway,
  geometry: objects,
  state: 'editable',
}

export const power: Filter = {
  id: 'power',
  label: 'Power Features',
  match: { power: '*' },
  geometry: objects,
  state: 'editable',
}

export const water: Filter = {
  id: 'water',
  label: 'Water Features',
  match: [
    { waterway: '*' },
    { natural: ['water', 'coastline', 'bay'] },
    { landuse: ['pond', 'basin', 'reservoir', 'salt_pond'] },
  ],
  geometry: objects,
  state: 'editable',
}

/*
 * The roads come before rail and boundaries: iD leaves road-tagged objects out of rail, and
 * a line with boundary and road tags is a road.
 */
export const trafficRoads: Filter = {
  id: 'traffic_roads',
  label: 'Traffic Roads',
  match: { highway: trafficHighways },
  geometry: objects,
  state: 'editable',
}

export const serviceRoads: Filter = {
  id: 'service_roads',
  label: 'Service Roads',
  match: { highway: serviceHighways },
  geometry: objects,
  state: 'editable',
}

export const paths: Filter = {
  id: 'paths',
  label: 'Paths',
  match: { highway: pathHighways },
  geometry: objects,
  state: 'editable',
}

/** iD's `rail`: a railway or a railway landuse, but not on a road or path, and not `railway=disused` and the like */
function isRail(tags: Tags) {
  return (
    (!!tags.railway || tags.landuse === 'railway') &&
    !isRoadOrPath(tags.highway) &&
    !(tags.railway !== undefined && lifecycleSet.has(tags.railway))
  )
}

export const rail: Filter = {
  id: 'rail',
  label: 'Rail Features',
  match: isRail,
  geometry: objects,
  state: 'editable',
}

/*
 * Buildings come before boundaries (iD leaves building-tagged objects out of boundaries) and
 * before landuse (iD leaves buildings out of landuse). Lifecycle values such as
 * `building=construction` are caught by past_future before this filter.
 */
/** iD's `buildings`: a building value other than `no` and not a lifecycle word, or a building parking */
function isBuilding(tags: Tags) {
  return (
    (!!tags.building && tags.building !== 'no' && !lifecycleSet.has(tags.building)) ||
    tags.parking === 'multi-storey' ||
    tags.parking === 'sheds' ||
    tags.parking === 'carports' ||
    tags.parking === 'garage_boxes'
  )
}

export const buildings: Filter = {
  id: 'buildings',
  label: 'Buildings',
  match: isBuilding,
  geometry: objects,
  state: 'editable',
}

export const boundaries: Filter = {
  id: 'boundaries',
  label: 'Boundaries',
  match: isBoundary,
  geometry: ['line', 'relation'],
  state: 'editable',
}

/** iD's `osmLanduseTags`: any landuse, leisure or natural value, and these amenities */
const landuseAmenities: ReadonlySet<string> = new Set([
  'bicycle_parking',
  'college',
  'grave_yard',
  'hospital',
  'marketplace',
  'motorcycle_parking',
  'parking',
  'place_of_worship',
  'prison',
  'school',
  'university',
])

function hasLanduseTag(tags: Tags) {
  return (
    !!tags.landuse ||
    !!tags.leisure ||
    !!tags.natural ||
    (tags.amenity !== undefined && landuseAmenities.has(tags.amenity))
  )
}

/** Objects that iD leaves out of landuse, because they have their own category */
const notLanduse: readonly Filter[] = [buildings, buildingParts, indoor, water, pistes]

/*
 * iD's `landuse`: an area with a landuse tag that is not a building, building part, indoor, water
 * or piste. Area only, as in iD. A function, because the exclusions are other filters.
 */
function isLanduse(tags: Tags, geometry: Geometry) {
  return hasLanduseTag(tags) && !notLanduse.some((filter) => matches(filter, tags, geometry))
}

export const landuse: Filter = {
  id: 'landuse',
  label: 'Landuse Features',
  match: isLanduse,
  geometry: ['area'],
  state: 'editable',
}

/** Points that are not address points. Address points come before, so this is the rest. */
export const points: Filter = {
  id: 'points',
  label: 'Points',
  match: '*',
  geometry: ['point'],
  state: 'editable',
}

/** Lines and areas that no other filter matched. Last, so it only catches what is left. */
export const others: Filter = {
  id: 'others',
  label: 'Other Features',
  match: '*',
  geometry: ways,
  state: 'editable',
}

/** iD's categories, all editable, in the order that gives iD's result under first match */
export const defaultFilters: Filter[] = [
  pastFuture,
  addressPoints,
  buildingParts,
  indoor,
  pistes,
  aerialways,
  power,
  water,
  trafficRoads,
  serviceRoads,
  paths,
  rail,
  buildings,
  boundaries,
  landuse,
  points,
  others,
]
