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
 * The extruded polygons of the closed ways with an indoor tag, one per level each is on. A room or floor gets one
 * feature per level; an elevator shaft gets one feature from its lowest level to the top of its highest. Ways with
 * no level, an open way and a way with a node without a location are left out. While a level is chosen, the levels above it
 * are left out (a cut through the building), so the chosen level is the top one.
 */
export function extrusionOf(
  ways: Iterable<WayLike>,
  locationOf: LocationOf,
  chosenLevel: number | null,
): ExtrusionCollection {
  const features: ExtrusionFeature[] = []
  let lowest = 0

  for (const way of ways) {
    const kind = kindOf(way.tags)
    if (kind === undefined || !isClosed(way.nodes)) continue
    const levels = levelsOf(way.tags).levels
    if (levels.length === 0) continue
    const ring = ringOf(way.nodes, locationOf)
    if (ring === undefined) continue
    const geometry: Polygon = { type: 'Polygon', coordinates: [ring] }

    lowest = Math.min(lowest, levels[0] ?? 0)
    if (kind === 'elevator') {
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
            LEVEL_HEIGHT,
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
 * What the way is drawn as, or undefined when it is not indoor. An elevator wins over a stairwell, a stairwell over a
 * room, so that a tagged shaft is never drawn as a room.
 */
function kindOf(tags: Readonly<Record<string, string>>): ExtrusionKind | undefined {
  if (tags.highway === 'elevator') return 'elevator'
  if (tags.stairs === 'yes' || tags.indoor === 'stairs') return 'stairs'
  if (tags.indoor === 'room') return 'room'
  if (tags.indoor === 'area' || tags.indoor === 'corridor') return 'floor'
  return undefined
}

/** Closed: the first node is the last. Fewer than four nodes is no area (a triangle closes with four). */
function isClosed(nodes: readonly string[]): boolean {
  return nodes.length >= 4 && nodes[0] === nodes[nodes.length - 1]
}

/** The ring of locations, or undefined when one node has no location (the way is left out, not drawn short) */
function ringOf(nodes: readonly string[], locationOf: LocationOf): [number, number][] | undefined {
  const ring: [number, number][] = []
  for (const node of nodes) {
    const at = locationOf(node)
    if (at === undefined) return undefined
    ring.push([at[0], at[1]])
  }
  return ring
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
