/**
 * Which nodes iD draws as an address (a rounded plaque with the house number, not a pin), and
 * the text on the plaque. Rules copied from iD: osm/tags.ts (osmIsInterestingTag) and
 * svg/labels.js (isAddressPoint, nonPrimaryKeys) at the pinned commit.
 */

/** iD's uninterestingKeys and uninterestingKeyRegex: keys that never make a node a point */
const UNINTERESTING_KEYS = new Set([
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
const UNINTERESTING_KEY =
  /^(source(_ref)?|at_bev|geobase|hcpaogis|KSJ2|mvdgis|nvdb|nysgissam|tiger):|:(identifier|ref|ref_id|id)$/

/** iD's nonPrimaryKeys and nonPrimaryKeysRegex: ignored when deciding whether a node is an address */
const NON_PRIMARY_KEYS = new Set([
  'building:flats',
  'check_date',
  'fixme',
  'layer',
  'level',
  'note',
  'start_date',
  'ele',
])
const NON_PRIMARY_KEY = /^(ref|survey|note|([^:]+:|old_|alt_)addr):/

/**
 * iD's isAddressPoint: at least one primary key, and every primary key is `addr:*`.
 * `source=*` and friends do not count, so `addr:*` + `source` is still an address.
 */
export function isAddressTags(tags: Readonly<Record<string, string>>) {
  let primary = 0
  for (const key of Object.keys(tags)) {
    if (UNINTERESTING_KEYS.has(key) || UNINTERESTING_KEY.test(key)) continue
    if (NON_PRIMARY_KEYS.has(key) || NON_PRIMARY_KEY.test(key)) continue
    if (!key.startsWith('addr:')) return false
    primary++
  }
  return primary > 0
}

/**
 * The text iD puts on the plaque: `addr:housename` first, then `addr:housenumber` (iD's
 * utilDisplayName with isMapLabel; the unit and the street are never shown on the map).
 * Empty when the node has neither, iD still draws an empty plaque for it.
 */
export function addressLabel(tags: Readonly<Record<string, string>>) {
  return tags['addr:housename'] || tags['addr:housenumber'] || ''
}
