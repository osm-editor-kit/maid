/**
 * The whole street on the map: every lane road of the loaded data with its lanes at their widths, joined at junctions
 * (osm-lane-diagram `streetGeometry`). This file reads the editor's graph into the drawing's input and turns its output
 * into GeoJSON for MapLibre. Pure apart from a cache of cross-sections per tags object.
 *
 * A way's cross-section is the diagram's (`sceneBands`), so map, diagram and table show the same lanes. A road the
 * diagram has no lanes for (no lane tags and no width) gets an assumed one: one lane each way on main roads, a single
 * shared lane on residential and service roads, at widths after Lane Studio's (`geometry/layout.ts`), which follow
 * the usual design widths. Assumed lanes are marked, so the map can draw them muted.
 */
import {
  streetGeometry,
  type StreetGeometry,
  type StreetLane,
  type StreetWay,
} from '@osm-editor-kit/osm-lane-diagram/street'
import type { Feature, FeatureCollection } from 'geojson'
import type { Tags } from '../edit.ts'
import { isLaneRoad } from '../roads.ts'
import { osmNumber } from '../scene.ts'
import { TURN_ANGLE } from './arrows.ts'
import { sceneBands } from './scene-bands.ts'

/** What the overlay reads of an entity of the graph */
export type StreetEntity = {
  readonly id: string
  readonly tags: Tags
  readonly nodes?: readonly string[]
  readonly loc?: readonly [number, number] | readonly number[]
}

/** The lane width of a road without lane tags, by highway (metres; Lane Studio's defaults, rounded) */
const ASSUMED_LANE_WIDTH: Record<string, number> = {
  motorway: 3.5,
  motorway_link: 3.5,
  trunk: 3.5,
  trunk_link: 3.5,
  primary: 3.25,
  primary_link: 3.25,
  secondary: 3.25,
  secondary_link: 3.25,
  tertiary: 3,
  tertiary_link: 3,
  unclassified: 2.75,
  road: 2.75,
  busway: 3.25,
}
/** The carriageway of a road that is one shared lane (residential, living street, service) */
const SHARED_WIDTH: Record<string, number> = { residential: 5.5, living_street: 4.8, service: 3.5 }

function isOneway(tags: Tags): boolean {
  const oneway = tags.oneway?.toLowerCase()
  return (
    oneway === 'yes' ||
    oneway === '1' ||
    oneway === 'true' ||
    oneway === '-1' ||
    oneway === 'reverse' ||
    tags.junction === 'roundabout' ||
    tags.highway === 'motorway'
  )
}

function parseMetres(value: string | undefined): number | undefined {
  const match = value ? /^\s*(\d+(?:\.\d+)?)\s*m?\s*$/.exec(value) : null
  return match ? Number(match[1]) : undefined
}

/** The lanes a road without lane tags is drawn with */
export function assumedLanes(wayId: string, tags: Tags): StreetLane[] {
  const highway = tags.highway ?? ''
  const id = (direction: string, i: number) => `way/${osmNumber(wayId)}/assumed/${direction}/${i}`
  const width = parseMetres(tags.width)
  const oneway = isOneway(tags)
  const reverse = tags.oneway === '-1' || tags.oneway === 'reverse'
  const shared = SHARED_WIDTH[highway]
  if (shared !== undefined || oneway) {
    const w = width ?? (oneway ? (ASSUMED_LANE_WIDTH[highway] ?? 3.5) : shared!)
    const direction = oneway ? (reverse ? 'backward' : 'forward') : 'both_ways'
    return [{ id: id(direction, 0), left: -w / 2, right: w / 2, direction, kind: 'car' }]
  }
  const lane = width !== undefined ? width / 2 : (ASSUMED_LANE_WIDTH[highway] ?? 3)
  return [
    { id: id('backward', 0), left: -lane, right: 0, direction: 'backward', kind: 'car' },
    { id: id('forward', 0), left: 0, right: lane, direction: 'forward', kind: 'car' },
  ]
}

/** Cross-sections per tags object: a way's tags are a new object only when they change */
const sections = new WeakMap<object, { lanes: StreetLane[]; assumed: boolean }>()

export function crossSection(wayId: string, tags: Tags): { lanes: StreetLane[]; assumed: boolean } {
  const known = sections.get(tags)
  if (known) return known
  const bands = sceneBands(osmNumber(wayId), tags)
  const section =
    bands.length > 0
      ? {
          lanes: bands.map((band) => ({
            id: band.slotId,
            left: band.offsetMetres - band.widthMetres / 2,
            right: band.offsetMetres + band.widthMetres / 2,
            direction: band.direction,
            kind: band.kind,
            ...(band.turn === undefined ? {} : { turn: band.turn }),
          })),
          assumed: false,
        }
      : { lanes: assumedLanes(wayId, tags), assumed: true }
  sections.set(tags, section)
  return section
}

/** The street drawing of the given entities (the ways among them that are lane roads) */
export function streetOf(
  entities: Iterable<StreetEntity>,
  nodeOf: (id: string) => StreetEntity | undefined,
  origin?: readonly [number, number],
): { geometry: StreetGeometry; assumed: Set<string> } {
  const ways: StreetWay[] = []
  const assumed = new Set<string>()
  for (const entity of entities) {
    if (!entity.nodes || !entity.id.startsWith('w') || !isLaneRoad(entity.tags)) continue
    if (entity.tags.area === 'yes') continue
    const section = crossSection(entity.id, entity.tags)
    if (section.assumed) assumed.add(entity.id)
    ways.push({ id: entity.id, tags: entity.tags, nodes: entity.nodes, lanes: section.lanes })
  }
  const geometry = streetGeometry({
    ways,
    ...(origin ? { origin } : {}),
    loc: (id) => {
      const loc = nodeOf(id)?.loc
      return loc && loc.length >= 2 ? [loc[0]!, loc[1]!] : undefined
    },
  })
  return { geometry, assumed }
}

/** The features of one way (its lanes, lines, arrows) or one junction node (its surface and kerbs) */
export type StreetParts = { areas: Feature[]; lines: Feature[]; arrows: Feature[] }

const emptyParts = (): StreetParts => ({ areas: [], lines: [], arrows: [] })

function partsOf(map: Map<string, StreetParts>, id: string): StreetParts {
  let parts = map.get(id)
  if (!parts) {
    parts = emptyParts()
    map.set(id, parts)
  }
  return parts
}

/**
 * The drawing as GeoJSON, by what each feature belongs to: polygons (lanes, junctions), lines (lane lines, kerbs),
 * points (arrows, one per turn token). Every way and junction node of the drawing has an entry, empty or not.
 */
export function streetParts(
  geometry: StreetGeometry,
  assumed: ReadonlySet<string>,
): { byWay: Map<string, StreetParts>; byNode: Map<string, StreetParts> } {
  const byWay = new Map<string, StreetParts>()
  const byNode = new Map<string, StreetParts>()
  for (const junction of geometry.junctions) {
    const parts = partsOf(byNode, junction.nodeId)
    parts.areas.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...junction.ring, junction.ring[0]!]] },
      properties: { part: 'junction', nodeId: junction.nodeId },
    })
    for (const kerb of junction.kerbs) {
      parts.lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: kerb },
        properties: { kind: 'kerb', nodeId: junction.nodeId },
      })
    }
  }
  for (const lane of geometry.lanes) {
    partsOf(byWay, lane.wayId).areas.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...lane.ring, lane.ring[0]!]] },
      properties: {
        part: 'lane',
        wayId: lane.wayId,
        laneId: lane.laneId,
        kind: lane.kind,
        direction: lane.direction,
        assumed: assumed.has(lane.wayId),
        taper: lane.taper === true,
      },
    })
  }
  for (const line of geometry.lines) {
    partsOf(byWay, line.wayId).lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line.line },
      properties: { kind: line.kind, wayId: line.wayId, assumed: assumed.has(line.wayId) },
    })
  }
  for (const arrow of geometry.arrows) {
    for (const token of arrow.turn.split(';').map((t) => t.trim().toLowerCase())) {
      const angle = TURN_ANGLE[token]
      if (angle === undefined) continue
      partsOf(byWay, arrow.wayId).arrows.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: arrow.loc },
        properties: { rotate: arrow.bearing + angle, laneId: arrow.laneId, token },
      })
    }
  }
  return { byWay, byNode }
}

export type StreetCollections = { areas: FeatureCollection; lines: FeatureCollection; arrows: FeatureCollection }

/** Parts put together into one collection each; junctions first, so the lanes draw over them in one layer too */
export function collect(groups: Iterable<Iterable<StreetParts>>): StreetCollections {
  const areas: Feature[] = []
  const lines: Feature[] = []
  const arrows: Feature[] = []
  for (const group of groups) {
    for (const parts of group) {
      for (const f of parts.areas) areas.push(f)
      for (const f of parts.lines) lines.push(f)
      for (const f of parts.arrows) arrows.push(f)
    }
  }
  return {
    areas: { type: 'FeatureCollection', features: areas },
    lines: { type: 'FeatureCollection', features: lines },
    arrows: { type: 'FeatureCollection', features: arrows },
  }
}

/** The drawing as GeoJSON in one go */
export function streetFeatures(geometry: StreetGeometry, assumed: ReadonlySet<string>): StreetCollections {
  const { byWay, byNode } = streetParts(geometry, assumed)
  return collect([byNode.values(), byWay.values()])
}
