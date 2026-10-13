import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, LineString } from 'geojson'
import type { ReactNode } from 'react'

/** A way as the side features need it: its id, its tags and its coordinates (lon, lat) */
export type ParkingSideWay = {
  id: string
  tags: Readonly<Record<string, string | undefined>>
  coordinates: [number, number][]
}

/**
 * The features drawn for one road's parking: per side, a line offset from the road's centre line with the
 * side's values as properties (`wayId`, `side`: 'left' | 'right', and the parking tags of that side).
 * Pure. A stub: returns no features until the lens agent fills it in.
 */
export function parkingSideFeatures(way: ParkingSideWay): Feature<LineString>[] {
  void way
  return []
}

/**
 * Draws parkingSideFeatures of the loaded ways. Registered on `map.content`, the renderer's extension point for a
 * module that draws on the map itself (a component inside the map with its own `<Source>` and `<Layer>`; notes and
 * data layers do the same). Renders nothing until the lens agent fills it in.
 */
export function ParkingSidesOnMap(props: MapContentProps): ReactNode {
  void props
  return null
}
