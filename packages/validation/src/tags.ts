// Tag rules shared by the validators. The lists are copies of Rapid's `osm_rulesets.json5` (scope
// `osm`), because this package runs headless without Maid's schema: `entity.isInterestingTag()`
// returns true for every key when no schema is loaded.

export type Tags = Readonly<Record<string, string | undefined>>

/** Rapid's `connected_highway`: major, minor and path highway values. These are routable. */
const routableHighways = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'road',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
  'service',
  'track',
  'busway',
  'bus_guideway',
  'path',
  'footway',
  'cycleway',
  'bridleway',
  'pedestrian',
  'corridor',
  'elevator',
  'ladder',
  'steps',
  'via_ferrata',
])

/** Rapid's `connected_railway` */
export const railwayValues: ReadonlySet<string> = new Set([
  'rail',
  'light_rail',
  'tram',
  'subway',
  'monorail',
  'funicular',
  'miniature',
  'narrow_gauge',
  'disused',
  'preserved',
])

/** Rapid's `connected_waterway` */
export const waterwayValues: ReadonlySet<string> = new Set([
  'canal',
  'ditch',
  'drain',
  'fish_pass',
  'flowline',
  'river',
  'stream',
  'tidal_channel',
])

/** Rapid's `lifecycle_prefixes`: `building=proposed` is not a building yet */
export const lifecyclePrefixes: ReadonlySet<string> = new Set([
  'abandoned',
  'construction',
  'demolished',
  'destroyed',
  'dismantled',
  'disused',
  'intermittent',
  'obliterated',
  'planned',
  'proposed',
  'razed',
  'removed',
  'was',
])

/** Rapid's `uninteresting` ruleset: keys that say where data came from, not what it is */
const uninterestingKeys: readonly RegExp[] = [
  /^attribution$/,
  /^created_by$/,
  /^import_uuid$/,
  /^geobase:(datasetName|uuid)$/,
  /^KSJ2:(curve_id|lat|long)$/,
  /^lat(itude)?$/,
  /^lon(gitude)?$/,
  /^odbl(:note)?$/,
  /^source(_ref)?(:|$)/,
  /^tiger:/,
]

/** Rapid's `isRoutableHighway` test: a `highway` value that connects roads */
export function isRoutableHighway(value: string | undefined): boolean {
  return value !== undefined && routableHighways.has(value)
}

/** A tag that is set and not `no`: Rapid's `hasTag` */
export function hasTag(value: string | undefined): value is string {
  return value !== undefined && value !== 'no'
}

/** Whether a key is not in the `uninteresting` ruleset */
export function isInterestingKey(key: string): boolean {
  return !uninterestingKeys.some((pattern) => pattern.test(key))
}

/**
 * The keys that say what a feature is, as in Rapid's `hasDescriptiveTags`: interesting keys other
 * than `area` and the attribute keys (name, description, note, start_date and their `key:` variants).
 */
export function descriptiveKeys(tags: Tags): string[] {
  const attributeKeys = ['description', 'name', 'note', 'start_date']
  return Object.keys(tags).filter((key) => {
    if (key === 'area' || !isInterestingKey(key)) return false
    return !attributeKeys.some((attribute) => key === attribute || key.startsWith(attribute + ':'))
  })
}
