/**
 * The bicycle infrastructure of one way as GeoJSON features: TILDA's processing (`processBikelanes`) splits the way into
 * its centre line (`self`) and its road sides (`left`, `right`, of the `cycleway` or the `sidewalk`) and gives each its
 * category. Each part with infrastructure becomes one LineString on the way's own nodes; the side is a property, the
 * layer's `line-offset` moves it to its side of the road (as the parking module does). Pure: no MapLibre, no React.
 */
import { processBikelanes, type OsmTags } from '@tilda-geo/bicycle-infrastructure'
import type { Feature, LineString, Point } from 'geojson'
import { groupOf, subcategoryOf, type GroupId } from './groups.ts'

/** A way as the features need it: its id, its tags and its coordinates (lon, lat) */
export type BikeWay = {
  id: string
  tags: Readonly<Record<string, string | undefined>>
  coordinates: [number, number][]
}

export type Side = 'self' | 'left' | 'right'

/** What a feature carries for the layers. Optional ones are left out when they do not apply. */
export type BikeProperties = {
  /** `infra`: a part with bicycle infrastructure. `separate`: a road side whose cycleway is a way of its own. */
  kind: 'infra' | 'separate'
  wayId: string
  side: Side
  /** `sidewalk` for a sidewalk where bicycles are allowed: drawn further out than the cycleway of the same side */
  prefix?: 'cycleway' | 'sidewalk'
  /** The TILDA category, e.g. `cycleway_adjoining` */
  category?: string
  group?: GroupId
  colour?: string
  dashed?: boolean
  /**
   * For the paths of the categories with the sidepath question: `yes` runs along a road (`_adjoining`), `no` on its
   * own (`_isolated`), `unknown` when TILDA cannot tell (`_adjoiningOrIsolated`). Left out for the other categories.
   */
  sidepath?: 'yes' | 'no' | 'unknown'
  /** The traffic sign of the part, as tagged (`DE:239,1022-10`); its image is drawn by the sign point (signFeature) */
  sign?: string
  /** `construction`, `temporary`, ... of TILDA: drawn lighter */
  lifecycle?: string
}

/** Highways TILDA looks at; any other way has no bicycle infrastructure and is not processed */
const HIGHWAY = 'highway'

const SIDEPATH: Record<string, BikeProperties['sidepath']> = {
  adjoining: 'yes',
  isolated: 'no',
  adjoiningOrIsolated: 'unknown',
}

/** The properties of a sign point: the sign's value and the side it stands on */
export type SignProperties = { kind: 'sign'; wayId: string; side: Side; sign: string }

/** The parts of a `traffic_sign` value that have an image: `DE:239,1022-10` → `DE:239`, `DE:1022-10` */
export function signParts(value: string): string[] {
  const parts: string[] = []
  // a value may hold signs of a country one after another (`DE:239,1022-10;DE:240`): the country carries over
  let country: string | undefined
  for (const group of value.split(';')) {
    for (const raw of group.split(',')) {
      const part = raw.trim().replace(/\[.*\]$/, '')
      if (part === '' || part === 'none' || part === 'no') continue
      const colon = part.indexOf(':')
      if (colon !== -1) {
        country = part.slice(0, colon)
        parts.push(part)
      } else if (country !== undefined) {
        parts.push(`${country}:${part}`)
      }
    }
  }
  return parts
}

const METERS_PER_DEGREE = 111_320
/** How far a sign of a road side stands from the centre line, in metres: beside the side line from zoom 18 */
export const SIGN_SIDE_METERS = 6

/**
 * Where the sign of a part stands: halfway along the way, moved `SIGN_SIDE_METERS` to its side for a road side (left of
 * the way's direction for `left`). Undefined for a line without length.
 */
export function signPoint(coordinates: readonly [number, number][], side: Side) {
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!
    const b = coordinates[i]!
    const scale = Math.cos((a[1] * Math.PI) / 180)
    const length = Math.hypot((b[0] - a[0]) * scale, b[1] - a[1])
    lengths.push(length)
    total += length
  }
  if (total === 0) return undefined
  let rest = total / 2
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!
    if (rest > length && i < lengths.length - 1) {
      rest -= length
      continue
    }
    const a = coordinates[i]!
    const b = coordinates[i + 1]!
    const t = length === 0 ? 0 : rest / length
    const lon = a[0] + (b[0] - a[0]) * t
    const lat = a[1] + (b[1] - a[1]) * t
    if (side === 'self' || length === 0) return [lon, lat] as [number, number]
    // the unit normal to the left of the segment, in metres east and north
    const scale = Math.cos((lat * Math.PI) / 180)
    const east = (b[0] - a[0]) * scale
    const north = b[1] - a[1]
    const norm = Math.hypot(east, north)
    const sign = side === 'left' ? 1 : -1
    const dEast = ((-north / norm) * sign * SIGN_SIDE_METERS) / METERS_PER_DEGREE
    const dNorth = ((east / norm) * sign * SIGN_SIDE_METERS) / METERS_PER_DEGREE
    return [lon + dEast / scale, lat + dNorth] as [number, number]
  }
  return undefined
}

export type BikeFeature = Feature<LineString, BikeProperties> | Feature<Point, SignProperties>

/**
 * The features of one way: one line per part with infrastructure, one per road side mapped as a way of its own, and a
 * point for each part that has a traffic sign
 */
export function bikeWayFeatures(way: BikeWay): BikeFeature[] {
  if (way.tags[HIGHWAY] === undefined || way.coordinates.length < 2) return []
  // the processing reads and changes its input: it gets a copy, the graph's tags stay as they are
  const tags: OsmTags = { ...way.tags }
  const out: BikeFeature[] = []
  for (const result of processBikelanes(tags)) {
    const side = result._side
    const prefix =
      result._prefix === 'sidewalk' || result._prefix === 'cycleway' ? result._prefix : undefined
    let props: BikeProperties | undefined
    if (result.category === 'separate_geometry' && side !== 'self') {
      props = { kind: 'separate', wayId: way.id, side }
    } else if (result._infrastructureExists) {
      const group = groupOf(result.category)
      if (group === undefined) continue
      props = {
        kind: 'infra',
        wayId: way.id,
        side,
        category: result.category,
        group: group.id,
        colour: group.colour,
        dashed: group.dashed,
      }
      const sidepath = SIDEPATH[subcategoryOf(result.category) ?? '']
      if (sidepath !== undefined) props.sidepath = sidepath
      if (result.traffic_sign && signParts(result.traffic_sign).length > 0)
        props.sign = result.traffic_sign
      if (result.lifecycle) props.lifecycle = result.lifecycle
    }
    if (props === undefined) continue
    if (prefix !== undefined && side !== 'self') props.prefix = prefix
    out.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'LineString', coordinates: way.coordinates },
    })
    const at = props.sign === undefined ? undefined : signPoint(way.coordinates, side)
    if (at !== undefined && props.sign !== undefined) {
      out.push({
        type: 'Feature',
        properties: { kind: 'sign', wayId: way.id, side, sign: props.sign },
        geometry: { type: 'Point', coordinates: at },
      })
    }
  }
  return out
}

/** What TILDA gives for these tags, as `side:category` in its order (for the fixture script and the tests) */
export function tildaCategories(tags: Readonly<Record<string, string>>): string[] {
  return processBikelanes({ ...tags }).map((result) => `${result._side}:${result.category}`)
}
