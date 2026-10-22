/**
 * The 3D view of the building levels as data: the rooms and floors of each level as extruded polygons, drawn by
 * LevelExtrusion.tsx. Pure: no engine and no map. The ways and locations are the parts of OsmWay and OsmNode read here.
 */
import { levelsOf } from '@osm-editor-kit/maid-levels'
import type { Feature, FeatureCollection, Polygon } from 'geojson'

/**
 * The height of one level in metres: the floor of level L is `(L - lowest) * LEVEL_HEIGHT` above the ground, where
 * `lowest` is the lowest level drawn. MapLibre extrudes nothing below 0 m, so the basement floors are lifted with the rest.
 */
export const LEVEL_HEIGHT = 4
/** A room's height in metres, from its floor to its top */
export const ROOM_HEIGHT = 3
/** A floor slab's height in metres (`indoor=area`, `indoor=corridor`): a thin plate, not a room */
export const SLAB_HEIGHT = 0.3
/** The width in metres of a flight of steps: its connector way is drawn as a strip this wide */
export const STAIR_WIDTH = 2
/** The number of slices a flight of steps is cut into along its way: one step each */
export const STEP_COUNT = 8

/** Metres per degree of latitude; a degree of longitude is this times the cosine of the latitude */
const METRES_PER_DEGREE = 111320

export type ExtrusionFeature = Feature<Polygon, ExtrusionProperties>
export type ExtrusionCollection = FeatureCollection<Polygon, ExtrusionProperties>

export type ExtrusionKind = 'room' | 'floor' | 'elevator' | 'stairs'

export type ExtrusionProperties = {
  /** Metres above ground where the feature starts */
  base: number
  /** Metres above ground where the feature ends */
  top: number
  kind: ExtrusionKind
  /** True when no level is chosen, or the feature is on the chosen level (a shaft: when it serves that level) */
  chosen: boolean
}

/** The parts of an OSM way that are read: its node ids (the first is the last when it is closed) and its tags */
export type WayLike = {
  readonly nodes: readonly string[]
  readonly tags: Readonly<Record<string, string>>
}

/** A location as [longitude, latitude] */
export type LocationOf = (node: string) => readonly [number, number] | undefined

/**
 * The extruded polygons of the indoor ways, per level each is on. A closed room or floor gets one feature per level; an
 * elevator shaft, and a stairwell on two or more levels, get one block from their lowest level to the top of their
 * highest. An open connector (steps, a conveyor or a ramp) on two or more levels is a flight of steps: STEP_COUNT slices
 * of a strip STAIR_WIDTH wide, climbing from the lower level to the higher. Ways with no level, a way with a node without
 * a location and an open way that is no connector are left out. While a level is chosen, the levels above it are left out
 * (a cut through the building), so the chosen level is the top one.
 */
export function extrusionOf(
  ways: Iterable<WayLike>,
  locationOf: LocationOf,
  chosenLevel: number | null,
): ExtrusionCollection {
  const features: ExtrusionFeature[] = []
  let lowest = 0

  for (const way of ways) {
    const kind = kindOf(way.tags, isClosed(way.nodes))
    if (kind === undefined) continue
    const levels = levelsOf(way.tags).levels
    if (levels.length === 0) continue

    if (kind === 'steps') {
      // a flight climbs between two levels: on one level there is nothing to climb
      if (levels.length < 2) continue
      const line = locationsOf(way.nodes, locationOf)
      if (line === undefined) continue
      lowest = Math.min(lowest, levels[0] ?? 0)
      features.push(...stepsOf(line, levels, way.tags.incline === 'down', chosenLevel))
      continue
    }

    const ring = locationsOf(way.nodes, locationOf)
    if (ring === undefined) continue
    const geometry: Polygon = { type: 'Polygon', coordinates: [ring] }

    lowest = Math.min(lowest, levels[0] ?? 0)
    // a shaft, and a stairwell on two or more levels: one block from the lowest level to the top of the highest
    if (kind === 'elevator' || (kind === 'stairs' && levels.length >= 2)) {
      const bottom = levels[0] ?? 0
      const highest = levels[levels.length - 1] ?? 0
      const serves = chosenLevel === null || levels.includes(chosenLevel)
      if (chosenLevel !== null && bottom > chosenLevel) continue
      features.push(
        featureOf(
          geometry,
          bottom * LEVEL_HEIGHT,
          // cut at the chosen level, as the levels above it are
          (chosenLevel === null ? highest : Math.min(highest, chosenLevel)) * LEVEL_HEIGHT +
            (kind === 'elevator' ? LEVEL_HEIGHT : ROOM_HEIGHT),
          kind,
          serves,
        ),
      )
      continue
    }

    const height = kind === 'floor' ? SLAB_HEIGHT : ROOM_HEIGHT
    for (const level of levels) {
      // a cut through the building: the levels above the chosen one are left out, so the chosen one is on top
      if (chosenLevel !== null && level > chosenLevel) continue
      const base = level * LEVEL_HEIGHT
      const chosen = chosenLevel === null || level === chosenLevel
      features.push(featureOf(geometry, base, base + height, kind, chosen))
    }
  }

  // lift everything so that the lowest level drawn stands on the ground (MapLibre draws nothing below 0 m)
  const lift = -lowest * LEVEL_HEIGHT
  if (lift > 0)
    for (const feature of features) {
      feature.properties.base += lift
      feature.properties.top += lift
    }
  return { type: 'FeatureCollection', features }
}

/**
 * What the way is drawn as, or undefined when it is not indoor. A closed way is a room, a floor, a stairwell or a shaft.
 * An open way is a flight of steps when it is a connector: steps, a conveyor or a ramp. An elevator wins over a stairwell,
 * a stairwell over a room, so that a tagged shaft is never drawn as a room.
 */
function kindOf(
  tags: Readonly<Record<string, string>>,
  closed: boolean,
): ExtrusionKind | 'steps' | undefined {
  if (!closed)
    return tags.highway === 'steps' || tags.conveying !== undefined || tags.ramp === 'yes'
      ? 'steps'
      : undefined
  if (tags.highway === 'elevator') return 'elevator'
  if (tags.stairs === 'yes' || tags.indoor === 'stairs' || tags.conveying !== undefined)
    return 'stairs'
  if (tags.indoor === 'room') return 'room'
  if (tags.indoor === 'area' || tags.indoor === 'corridor') return 'floor'
  return undefined
}

/** Closed: the first node is the last. Fewer than four nodes is no area (a triangle closes with four). */
function isClosed(nodes: readonly string[]): boolean {
  return nodes.length >= 4 && nodes[0] === nodes[nodes.length - 1]
}

/** The locations of the nodes in order, or undefined when one node has no location (the way is left out, not drawn short) */
function locationsOf(
  nodes: readonly string[],
  locationOf: LocationOf,
): [number, number][] | undefined {
  const locations: [number, number][] = []
  for (const node of nodes) {
    const at = locationOf(node)
    if (at === undefined) return undefined
    locations.push([at[0], at[1]])
  }
  return locations
}

/** One straight piece of a line in metres: where it starts along the line, and its unit direction */
type Piece = {
  readonly from: readonly [number, number]
  readonly dir: readonly [number, number]
  readonly start: number
}

/**
 * A flight of steps: the line as a strip STAIR_WIDTH wide, cut into STEP_COUNT slices of equal length along the way. The
 * slices climb from the base of the lower level to the base of the upper one, or of the chosen level when that is lower. A
 * flight with incline=down is the same flight from its other end: its first slice is the highest.
 */
function stepsOf(
  line: readonly (readonly [number, number])[],
  levels: readonly number[],
  down: boolean,
  chosenLevel: number | null,
): ExtrusionFeature[] {
  const origin = line[0]
  if (origin === undefined) return []
  const [lon0, lat0] = origin
  const perDegreeLon = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180)
  const toMetres = ([lon, lat]: readonly [number, number]): [number, number] => [
    (lon - lon0) * perDegreeLon,
    (lat - lat0) * METRES_PER_DEGREE,
  ]
  const toLocation = ([x, y]: readonly [number, number]): [number, number] => [
    lon0 + x / perDegreeLon,
    lat0 + y / METRES_PER_DEGREE,
  ]

  // the line in metres, without repeated nodes: a piece of no length has no direction
  const path: [number, number][] = []
  for (const node of line) {
    const point = toMetres(node)
    const previous = path[path.length - 1]
    if (previous === undefined || previous[0] !== point[0] || previous[1] !== point[1])
      path.push(point)
  }

  // the pieces of the line, each with the distance along the line where it starts
  const pieces: Piece[] = []
  let total = 0
  for (let i = 0; i + 1 < path.length; i++) {
    const from = path[i]
    const to = path[i + 1]
    if (from === undefined || to === undefined) continue
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = Math.hypot(dx, dy)
    pieces.push({ from, dir: [dx / length, dy / length], start: total })
    total += length
  }
  if (pieces.length === 0) return []

  // the two edges of the strip at a distance along the line: STAIR_WIDTH / 2 to either side of the line
  const edgesAt = (distance: number): [[number, number], [number, number]] | undefined => {
    let piece: Piece | undefined
    for (const candidate of pieces) {
      if (candidate.start <= distance) piece = candidate
    }
    if (piece === undefined) return undefined
    const along = distance - piece.start
    const x = piece.from[0] + piece.dir[0] * along
    const y = piece.from[1] + piece.dir[1] * along
    // the normal of the piece's direction, pointing left of the line
    const nx = -piece.dir[1] * (STAIR_WIDTH / 2)
    const ny = piece.dir[0] * (STAIR_WIDTH / 2)
    return [
      [x + nx, y + ny],
      [x - nx, y - ny],
    ]
  }

  const edges: [[number, number], [number, number]][] = []
  for (let k = 0; k <= STEP_COUNT; k++) {
    const edge = edgesAt((total * k) / STEP_COUNT)
    if (edge === undefined) return []
    edges.push(edge)
  }

  const lower = levels[0] ?? 0
  const upper = levels[levels.length - 1] ?? lower
  // a cut through the building: a flight that starts above the chosen level is left out, as a room is
  if (chosenLevel !== null && lower > chosenLevel) return []
  // the climb ends at the upper level, or at the chosen level when that is lower (a cut through the building)
  const climbTo = chosenLevel === null ? upper : Math.min(upper, chosenLevel)
  const base = lower * LEVEL_HEIGHT
  const rise = (climbTo - lower) * LEVEL_HEIGHT
  const chosen = chosenLevel === null || levels.includes(chosenLevel)

  const features: ExtrusionFeature[] = []
  for (let k = 0; k < STEP_COUNT; k++) {
    const near = edges[k]
    const far = edges[k + 1]
    if (near === undefined || far === undefined) continue
    const ring = [near[0], far[0], far[1], near[1], near[0]].map(toLocation)
    // slice k is the (k + 1)-th step of the climb; going down, the climb is read from the other end
    const step = down ? STEP_COUNT - k : k + 1
    const top = Math.max(base + SLAB_HEIGHT, base + (rise * step) / STEP_COUNT)
    features.push(featureOf({ type: 'Polygon', coordinates: [ring] }, base, top, 'stairs', chosen))
  }
  return features
}

function featureOf(
  geometry: Polygon,
  base: number,
  top: number,
  kind: ExtrusionKind,
  chosen: boolean,
): ExtrusionFeature {
  return { type: 'Feature', geometry, properties: { base, top, kind, chosen } }
}
