/**
 * The GeoJSON features the parking map draws, one kind per JOSM rule group (see layers.ts for the look). Pure: no
 * MapLibre, no React. The side features are the core of it (parkingSideFeatures); the others are the separately mapped
 * areas, lowered kerbs, direction arrows and obstacles of the JOSM style.
 *
 * Coordinates are the way's own nodes as [lon, lat]. Lines are never offset here: the offset is the layer's
 * `line-offset`, so a feature keeps the road's centre line and the properties say which side it is.
 */
import type { Feature, LineString, Point, Position } from 'geojson'
import { readSide, type RealSide } from '../sides.ts'
import { areaCategory, hasSideTags, sideCategory, type CategoryId } from './categories.ts'

/** The two sides a road has: `both` is the shorthand for them and is never a side of its own */
const REAL_SIDES: readonly RealSide[] = ['left', 'right']

/** A way as the features need it: its id, its tags and its coordinates (lon, lat) */
export type ParkingWay = {
  id: string
  tags: Readonly<Record<string, string | undefined>>
  coordinates: [number, number][]
}

/** The highway classes of the JOSM direction-arrow style, and the roads the missing-parking check looks at */
export const PARKING_HIGHWAYS: readonly string[] = [
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'pedestrian',
  'road',
]

export type ParkingFeatureKind =
  | 'side'
  | 'area'
  | 'kerb'
  | 'arrow'
  | 'obstacle-way'
  | 'obstacle-node'

export type ParkingFeatureOptions = {
  /** Also draw a dashed grey line on each side of a road with no parking tag on that side (the mappers' gap check) */
  showMissing?: boolean
}

/** The properties of a side feature. Optional ones are left out when the tag is not set. */
export type SideProperties = {
  kind: 'side'
  wayId: string
  side: RealSide
  category: CategoryId
  /** Conditional restriction, or the gap check: drawn dashed */
  dashed: boolean
  restrictionConditional: boolean
  position?: string
  orientation?: string
  restriction?: string
  fee?: string
  markings?: string
  informal?: string
}

export type AreaProperties = {
  kind: 'area'
  wayId: string
  /** Which side of the outline the strip lies on: the inside (clockwise ring: right, anticlockwise: left) */
  strip: 'left' | 'right'
  category: CategoryId
  parking?: string
}

export type LineProperties = {
  kind: 'kerb' | 'arrow' | 'obstacle-way'
  wayId: string
  highway?: string
}
export type PointProperties = { kind: 'obstacle-node'; wayId: string }

const setIf = <T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) => {
  if (value !== undefined) target[key] = value as T[K]
}

/**
 * The side features of one road: one LineString per real side (`:both` gives both) that has parking tags, with the
 * centre line as its geometry and the side's values as properties. With `showMissing`, a road from PARKING_HIGHWAYS
 * also gets a `not_mapped` feature for each side without any tag. Roads without any parking tag give none otherwise.
 */
export function parkingSideFeatures(
  way: ParkingWay,
  options: ParkingFeatureOptions = {},
): Feature<LineString, SideProperties>[] {
  if (way.coordinates.length < 2) return []
  const missingRoad =
    options.showMissing === true && PARKING_HIGHWAYS.includes(way.tags.highway ?? '')
  const out: Feature<LineString, SideProperties>[] = []
  for (const side of REAL_SIDES) {
    const mapped = hasSideTags(way.tags, side)
    if (!mapped && !missingRoad) continue
    const props: SideProperties = {
      kind: 'side',
      wayId: way.id,
      side,
      category: mapped ? (sideCategory(way.tags, side) ?? 'parked') : 'not_mapped',
      dashed: !mapped || readSide(way.tags, side, 'restriction:conditional') !== undefined,
      restrictionConditional: readSide(way.tags, side, 'restriction:conditional') !== undefined,
    }
    if (mapped) {
      setIf(props, 'position', readSide(way.tags, side))
      setIf(props, 'orientation', readSide(way.tags, side, 'orientation'))
      setIf(props, 'restriction', readSide(way.tags, side, 'restriction'))
      setIf(props, 'fee', readSide(way.tags, side, 'fee'))
      setIf(props, 'markings', readSide(way.tags, side, 'markings'))
      setIf(props, 'informal', readSide(way.tags, side, 'informal'))
    }
    out.push({
      type: 'Feature',
      properties: props,
      geometry: { type: 'LineString', coordinates: way.coordinates },
    })
  }
  return out
}

/** Twice the signed area of a ring (shoelace). Positive when the ring runs anticlockwise on a north-up map. */
export function ringArea2(coordinates: readonly Position[]) {
  let sum = 0
  for (let i = 0; i + 1 < coordinates.length; i++) {
    const a = coordinates[i]
    const b = coordinates[i + 1]
    if (!a || !b) continue
    sum += a[0]! * b[1]! - b[0]! * a[1]!
  }
  return sum
}

/**
 * A separately mapped parking area (`amenity=parking`, closed) with the file's category: a strip along the inside of
 * its outline. The ring is kept as it is; the layer offsets the strip to the right for a clockwise ring and to the
 * left for an anticlockwise one, so the strip is always inside.
 */
export function parkingAreaFeature(way: ParkingWay): Feature<LineString, AreaProperties>[] {
  if (way.tags.amenity !== 'parking') return []
  const ring = way.coordinates
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (ring.length < 4 || !first || !last || first[0] !== last[0] || first[1] !== last[1]) return []
  const category = areaCategory(way.tags)
  if (category === undefined) return []
  const props: AreaProperties = {
    kind: 'area',
    wayId: way.id,
    strip: ringArea2(ring) < 0 ? 'right' : 'left',
    category,
  }
  setIf(props, 'parking', way.tags.parking)
  return [
    { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: ring } },
  ]
}

/** A lowered kerb line (`barrier=kerb` with `kerb=lowered`): the way itself */
export function kerbFeature(way: ParkingWay): Feature<LineString, LineProperties>[] {
  if (way.tags.barrier !== 'kerb' || way.tags.kerb !== 'lowered' || way.coordinates.length < 2)
    return []
  return [
    {
      type: 'Feature',
      properties: { kind: 'kerb', wayId: way.id },
      geometry: { type: 'LineString', coordinates: way.coordinates },
    },
  ]
}

/** A road that gets direction arrows (the 11 highway classes of the JOSM style) */
export function arrowFeature(way: ParkingWay): Feature<LineString, LineProperties>[] {
  const highway = way.tags.highway
  if (highway === undefined || !PARKING_HIGHWAYS.includes(highway) || way.coordinates.length < 2)
    return []
  return [
    {
      type: 'Feature',
      properties: { kind: 'arrow', wayId: way.id, highway },
      geometry: { type: 'LineString', coordinates: way.coordinates },
    },
  ]
}

/** A way that is an obstacle to parking (`obstacle:parking=yes`): drawn as a black halo under the other features */
export function obstacleWayFeature(way: ParkingWay): Feature<LineString, LineProperties>[] {
  if (way.tags['obstacle:parking'] !== 'yes' || way.coordinates.length < 2) return []
  return [
    {
      type: 'Feature',
      properties: { kind: 'obstacle-way', wayId: way.id },
      geometry: { type: 'LineString', coordinates: way.coordinates },
    },
  ]
}

/** A node that is an obstacle to parking */
export function obstacleNodeFeature(
  id: string,
  tags: ParkingWay['tags'],
  lonLat: Position,
): Feature<Point, PointProperties>[] {
  if (tags['obstacle:parking'] !== 'yes') return []
  return [
    {
      type: 'Feature',
      properties: { kind: 'obstacle-node', wayId: id },
      geometry: { type: 'Point', coordinates: lonLat },
    },
  ]
}

/** Every parking feature of one way, in the order the layers stack them (the layers decide the drawing order) */
export function parkingWayFeatures(
  way: ParkingWay,
  options: ParkingFeatureOptions = {},
): Feature[] {
  return [
    ...obstacleWayFeature(way),
    ...parkingAreaFeature(way),
    ...parkingSideFeatures(way, options),
    ...kerbFeature(way),
    ...arrowFeature(way),
  ]
}
