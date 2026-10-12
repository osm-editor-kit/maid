/**
 * Tag classification, ported from iD (modules/svg/tag_classes.ts and modules/osm/tags.ts, ISC).
 * Returns the class names iD would put on an element, without the `tag-` prefix.
 */
import areaKeysJson from './generated/area-keys.json'

export type Tags = Record<string, string>

const AREA_KEYS = areaKeysJson as Record<string, Record<string, true>>

const PRIMARIES = [
  'building', 'highway', 'railway', 'waterway', 'aeroway', 'aerialway',
  'piste:type', 'boundary', 'power', 'amenity', 'natural', 'landuse',
  'leisure', 'military', 'place', 'man_made', 'route', 'attraction',
  'roller_coaster', 'building:part', 'indoor', 'climbing', 'cemetery',
] // prettier-ignore
const STATUSES = [
  'proposed', 'planned', 'construction', 'disused', 'abandoned', 'was',
  'dismantled', 'razed', 'demolished', 'destroyed', 'removed', 'intermittent',
] // prettier-ignore
const SECONDARIES = [
  'oneway', 'bridge', 'tunnel', 'ford', 'barrier',
  'surface', 'tracktype', 'footway', 'crossing', 'service', 'sport',
  'public_transport', 'location', 'parking', 'golf', 'type', 'leisure',
  'man_made', 'indoor', 'construction', 'proposed', 'bicycle', 'foot',
] // prettier-ignore
const PATH_HIGHWAYS = new Set([
  'path',
  'footway',
  'cycleway',
  'bridleway',
  'pedestrian',
  'corridor',
  'steps',
  'ladder',
])
const PAVED: Record<string, Set<string>> = {
  surface: new Set([
    'paved',
    'asphalt',
    'concrete',
    'chipseal',
    'concrete:lanes',
    'concrete:plates',
    'metal',
    'tiles',
  ]),
  tracktype: new Set(['grade1']),
}
const SEMIPAVED = new Set([
  'bricks', 'cobblestone', 'unhewn_cobblestone', 'sett', 'paving_stones',
  'grass_paver', 'metal_grid', 'fibre_reinforced_polymer_grate', 'wood',
]) // prettier-ignore
const VALID = /^[-_a-z0-9]+$/
// Every `${status}:${primary}` key (for example `disused:building`), with its rank in the order
// the status scan used to test them: status first, then primary. Built once, so a way is
// matched by walking its own keys (a few) instead of testing all 276 combinations per call.
const STATUS_PRIMARY_KEYS = new Map<string, { rank: number; status: string }>()
STATUSES.forEach((status, s) =>
  PRIMARIES.forEach((primary, p) =>
    STATUS_PRIMARY_KEYS.set(`${status}:${primary}`, { rank: s * PRIMARIES.length + p, status }),
  ),
)

export function tagClasses(t: Tags): string[] {
  const classes: string[] = []
  let primary: string | undefined
  let status: string | undefined

  for (const key of PRIMARIES) {
    const v = t[key]
    if (!v || v === 'no') continue
    const k = key.replace(':', '_')
    primary = k
    classes.push(k)
    if (STATUSES.includes(v)) status = v
    else classes.push(`${k}-${v}`)
    break
  }
  if (!primary) {
    // The earliest status:primary key the way has, in scan order.
    let found: { rank: number; status: string } | undefined
    for (const key in t) {
      const entry = STATUS_PRIMARY_KEYS.get(key)
      if (!entry || (found && found.rank < entry.rank)) continue
      const v = t[key]
      if (!v || v === 'no') continue
      found = entry
    }
    if (found) status = found.status
  }
  if (!status) {
    for (const k of STATUSES) {
      const v = t[k]
      if (!v || v === 'no') continue
      if (v === 'yes') status = k
      else if (primary && primary === v) status = k
      else if (!primary && PRIMARIES.includes(v)) {
        status = k
        primary = v
        classes.push(v)
      }
      if (status) break
    }
  }
  if (status) classes.push('status', `status-${status}`)

  for (const k of SECONDARIES) {
    const v = t[k]
    if (!v || v === 'no' || k === primary) continue
    classes.push(k, `${k}-${v}`)
  }

  if ((primary === 'highway' && !PATH_HIGHWAYS.has(t.highway!)) || primary === 'aeroway') {
    if (t.highway !== 'track') {
      let surface = 'paved'
      for (const k in t) {
        if (k in PAVED) surface = PAVED[k]!.has(t[k]!) ? 'paved' : 'unpaved'
        if (k === 'surface' && SEMIPAVED.has(t[k]!)) surface = 'semipaved'
      }
      classes.push(surface)
    } else if (!t.tracktype || !/^grade[1-5]$/.test(t.tracktype)) {
      classes.push('ungraded')
    }
  }
  if (
    t.wikidata ||
    t['flag:wikidata'] ||
    t['brand:wikidata'] ||
    t['network:wikidata'] ||
    t['operator:wikidata']
  ) {
    classes.push('wikidata')
  }
  return classes.filter((c) => VALID.test(`tag-${c}`))
}

const AREA_EXCEPTIONS: Record<string, Record<string, boolean>> = {
  highway: { elevator: true, rest_area: true, services: true },
  public_transport: { platform: true },
  railway: {
    platform: true,
    roundhouse: true,
    station: true,
    traverser: true,
    turntable: true,
    wash: true,
    ventilation_shaft: true,
  },
  waterway: { dam: true },
  amenity: { bicycle_parking: true },
  emergency: {
    yes: false,
    no: false,
    private: false,
    designated: false,
    destination: false,
    official: false,
  },
}

function removeLifecyclePrefix(key: string) {
  const colon = key.indexOf(':')
  if (colon < 0) return key
  return STATUSES.includes(key.slice(0, colon)) ? key.slice(colon + 1) : key
}

/** iD's osmWay.isArea */
export function isArea(tags: Tags | undefined, closed: boolean) {
  if (!tags) return false
  if (tags.area === 'yes') return true
  if (!closed || tags.area === 'no') return false
  for (const realKey in tags) {
    const key = removeLifecyclePrefix(realKey)
    const value = tags[realKey]!
    if (AREA_EXCEPTIONS[key]?.[value] === false) continue
    if (key in AREA_KEYS && !(value in AREA_KEYS[key]!)) return true
    if (AREA_EXCEPTIONS[key]?.[value]) return true
  }
  return false
}

const UNINTERESTING = /^(attribution|created_by|source|odbl|.*:source|source:.*|tiger:.*)$/

/** iD's hasInterestingTags */
export function hasInterestingTags(tags: Tags | undefined) {
  if (!tags) return false
  for (const k in tags) if (!UNINTERESTING.test(k)) return true
  return false
}

/** iD's osmWay.layer(): which stacking level a way is drawn on */
export function wayLayer(t: Tags) {
  if (t.layer !== undefined && isFinite(Number(t.layer)))
    return Math.max(-10, Math.min(Number(t.layer), 10))
  if (t.covered === 'yes') return -1
  if (t.location === 'overground') return 1
  if (t.location === 'underground') return -1
  if (t.location === 'underwater') return -10
  if (t.power === 'line') return 10
  if (t.power === 'minor_line') return 9
  if (t.aerialway) return 8
  if (t.bridge) return 1
  if (t.cutting) return -1
  if (t.tunnel) return -1
  if (t.waterway) return -1
  if (t.man_made === 'pipeline') return -10
  if (t.boundary) return -10
  return 0
}
