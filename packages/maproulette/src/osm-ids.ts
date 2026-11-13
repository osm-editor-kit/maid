/**
 * OSM entity ids in MapRoulette task data, in the short form `w123`, `n456`, `r789`: from titles like `w123@0`,
 * the long form `way/123`, nested properties, and the feature properties of MapRoulette V4 (`@id: "way/123"`, or a
 * numeric `osmid` with a type or a geometry type).
 */
import { asText } from './text.ts'

const TITLE_ID = /^([wnr])(\d+)(?:@\d+)?$/i
const LONG_ID = /\b(way|node|relation)\/(\d+)\b/gi
const SHORT_ID = /\b([wnr])(\d+)\b/gi
const TYPED_ID = /^(node|way|relation)\/(\d+)$/i
const TYPE_PREFIX: Record<string, string> = {
  way: 'w',
  node: 'n',
  relation: 'r',
  w: 'w',
  n: 'n',
  r: 'r',
}

const PREFERRED_KEYS = [
  'title',
  'name',
  '@id',
  '@osmId',
  '@type',
  'osm_type',
  'osmId',
  'osm_id',
  'osmid',
  'id',
  'identifier',
]

type Bag = Record<string, unknown>

function isBag(value: unknown): value is Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function addMatch(found: Set<string>, prefix: string, num: string | number): void {
  const p = TYPE_PREFIX[String(prefix).toLowerCase()]
  const n = String(num)
  if (!p || !/^\d+$/.test(n)) return
  found.add(`${p}${n}`)
}

function addFromString(found: Set<string>, raw: string): void {
  const s = raw.trim()
  if (!s) return
  const title = s.match(TITLE_ID)
  if (title) {
    addMatch(found, title[1] ?? '', title[2] ?? '')
    return
  }
  for (const m of s.matchAll(LONG_ID)) addMatch(found, m[1] ?? '', m[2] ?? '')
  for (const m of s.matchAll(SHORT_ID)) addMatch(found, m[1] ?? '', m[2] ?? '')
}

/** The OSM element type of a GeoJSON geometry type (MapRoulette V4) */
function inferOsmTypeFromGeometry(geomType: string | undefined): string | null {
  const types: Record<string, string> = {
    Point: 'node',
    LineString: 'way',
    MultiLineString: 'way',
    Polygon: 'way',
    MultiPolygon: 'relation',
  }
  return (geomType && types[geomType]) || null
}

/**
 * One entity id from the properties of a GeoJSON feature, by the rules of MapRoulette V4: a typed string
 * (`way/456` in `@id`, `id` or `osm_id`), else a positive number (`osmid`, `osm_id`, `@osmId`) with an explicit
 * `@type` or `osm_type`, else the type of the geometry. Returns `w123` or null.
 */
export function parseOsmEntityIdFromFeatureProperties(
  properties: Bag | null | undefined,
  geomType?: string,
): string | null {
  if (!isBag(properties)) return null

  const typedId = properties['@id'] || properties.id || properties.osm_id
  if (typedId && typeof typedId === 'string') {
    const match = typedId.trim().match(TYPED_ID)
    if (match) {
      const p = TYPE_PREFIX[(match[1] ?? '').toLowerCase()]
      return p ? `${p}${match[2]}` : null
    }
  }

  const numericId = properties.osmid ?? properties.osm_id ?? properties['@osmId']
  if (numericId !== null && numericId !== undefined && numericId !== '') {
    const num = Number(numericId)
    if (Number.isFinite(num) && num > 0) {
      const osmType = properties['@type'] || properties.osm_type
      if (osmType) {
        const type = asText(osmType).toLowerCase()
        if (type === 'node' || type === 'way' || type === 'relation')
          return `${TYPE_PREFIX[type]}${Math.trunc(num)}`
      }
      const inferred = inferOsmTypeFromGeometry(geomType)
      if (inferred) return `${TYPE_PREFIX[inferred]}${Math.trunc(num)}`
    }
  }
  return null
}

function collectFromGeometriesInto(found: Set<string>, geometries: unknown): void {
  if (!geometries) return
  let features: unknown[] = []
  if (Array.isArray(geometries)) {
    features = geometries
  } else if (isBag(geometries)) {
    if (Array.isArray(geometries.features)) features = geometries.features
    else if (geometries.type === 'Feature' || (geometries.properties && geometries.geometry))
      features = [geometries]
  }
  for (const feature of features) collectFromFeatureInto(found, feature, 0, false)
}

/** The V4 property parse, then a free-text walk of the properties (and, when asked, of the sibling keys) */
function collectFromFeatureInto(
  found: Set<string>,
  feature: unknown,
  depth: number,
  walkOtherKeys: boolean,
): void {
  if (!isBag(feature)) return
  const props = feature.properties
  const geom = feature.geometry
  const geomType = isBag(geom) && typeof geom.type === 'string' ? geom.type : undefined
  if (isBag(props)) {
    const id = parseOsmEntityIdFromFeatureProperties(props, geomType)
    if (id) found.add(id)
    walk(found, props, depth + 1)
  }
  if (!walkOtherKeys) return
  for (const key of Object.keys(feature)) {
    if (key === 'geometry' || key === 'geometries' || key === 'coordinates' || key === 'properties')
      continue
    walk(found, feature[key], depth + 1)
  }
}

function isGeoJsonFeature(obj: Bag): boolean {
  if (obj.type === 'Feature') return true
  // MapRoulette sometimes leaves out the type
  return !!(obj.properties && obj.geometry && typeof obj.geometry === 'object')
}

function walk(found: Set<string>, value: unknown, depth: number): void {
  if (value === null || value === undefined || depth > 5) return
  if (typeof value === 'string') {
    addFromString(found, value)
    return
  }
  // a bare number is not an OSM id: V4 needs a type
  if (typeof value === 'number') return
  if (Array.isArray(value)) {
    for (const item of value) walk(found, item, depth + 1)
    return
  }
  if (!isBag(value)) return
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    collectFromGeometriesInto(found, value)
    return
  }
  if (isGeoJsonFeature(value)) {
    collectFromFeatureInto(found, value, depth, true)
    return
  }
  // the well-known identity keys first, then everything else
  for (const key of PREFERRED_KEYS) if (key in value) walk(found, value[key], depth + 1)
  for (const key of Object.keys(value)) {
    if (key === 'coordinates' || key === 'geometry') continue
    if (key === 'geometries') {
      collectFromGeometriesInto(found, value[key])
      continue
    }
    walk(found, value[key], depth + 1)
  }
}

/** Entity ids of a FeatureCollection, a feature array or a single feature, by the V4 rules, from every feature */
export function collectOsmEntityIdsFromGeometries(geometries: unknown): string[] {
  const found = new Set<string>()
  collectFromGeometriesInto(found, geometries)
  return [...found]
}

/** The deduplicated entity ids (`w123`) found in any of the values */
export function collectOsmEntityIds(...values: unknown[]): string[] {
  const found = new Set<string>()
  for (const value of values) walk(found, value, 0)
  return [...found]
}

/** `w123` as `way/123` */
export function longFormOsmId(id: string): string {
  return String(id).replace(/^[wnr]/, (prefix) =>
    prefix === 'w' ? 'way/' : prefix === 'n' ? 'node/' : 'relation/',
  )
}

/** `w123`, `W123` or `way/123` as `way/123`; other text unchanged (trimmed) */
export function toLongFormOsmId(id: string): string {
  const trimmed = id.trim()
  const long = trimmed.match(/^(way|node|relation)\/(\d+)$/i)
  if (long) return `${(long[1] ?? '').toLowerCase()}/${long[2]}`
  const short = trimmed.match(/^([wnr])(\d+)$/i)
  if (short) return longFormOsmId(`${(short[1] ?? '').toLowerCase()}${short[2]}`)
  return trimmed
}

/** A piece of text: plain, or a reference to an OSM entity that a UI can make a link */
export type OsmReferenceToken =
  | { type: 'text'; text: string }
  | {
      type: 'osm'
      /** the id in the long form, `way/123` */ osmId: string
      /** the text as written */ label: string
    }

const REFERENCE = /(?<![/\w])(?:(way|node|relation)\/(\d+)|([wnr])(\d+))\b/gi
const BARE_URL = /(https?:\/\/\S+)/gi

/**
 * Split plain text into text and OSM references (`way/123` and `w123`). URLs are left alone. For text that is
 * already free of Markdown syntax (text nodes of the rendered instruction, not code blocks).
 */
export function splitOsmReferences(text: string): OsmReferenceToken[] {
  const tokens: OsmReferenceToken[] = []
  const pushText = (value: string) => {
    if (!value) return
    const last = tokens[tokens.length - 1]
    if (last && last.type === 'text') last.text += value
    else tokens.push({ type: 'text', text: value })
  }
  text.split(BARE_URL).forEach((part, i) => {
    if (i % 2 === 1) return pushText(part)
    let at = 0
    for (const m of part.matchAll(REFERENCE)) {
      pushText(part.slice(at, m.index))
      at = m.index + m[0].length
      const osmId = m[1] ? `${m[1].toLowerCase()}/${m[2]}` : toLongFormOsmId(m[0])
      tokens.push({ type: 'osm', osmId, label: m[0] })
    }
    pushText(part.slice(at))
  })
  return tokens
}
