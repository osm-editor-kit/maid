import type { FeatureCollection } from 'geojson'
import { useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { BELOW_OSM_LAYER } from './extension-points'
import {
  ACTIVE_SOURCE,
  buildLayers,
  EDIT_SOURCES,
  SELECT_SOURCES,
  SOURCES,
  type LayerOptions,
} from './layers'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * GeoJSON source settings for editable data:
 * - `tolerance: 0`: no simplification, vertices must sit exactly on their lines
 * - `maxzoom`: tiles are cut up to this MapLibre zoom and overzoomed above it
 * - `promoteId`: OSM ids (w123) as feature ids, needed for diff updates and feature state
 */
const SOURCE_OPTIONS = { promoteId: 'id', tolerance: 0, maxzoom: 17, buffer: 64 } as const

type Props = {
  options: LayerOptions
  /** Overrides for experiments, e.g. { tolerance: 0.375 } */
  sourceOptions?: Partial<{ tolerance: number; maxzoom: number; buffer: number }>
}

/**
 * Declares the sources and layers for OSM data. The data itself is pushed by MaidEngine.
 * `data` stays the same empty collection on purpose, so React never re-sends data.
 */
export function OsmLayers({ options, sourceOptions }: Props) {
  const layers = buildLayers(options)
  // The source options are read once, when the map is made. react-map-gl calls `setData(data)` on a GeoJSON
  // source whenever one of its props changes, and that would empty the engine's features. Keying the sources on
  // their options would not help. react-map-gl removes a source on unmount, MapLibre refuses that while a layer
  // uses it, and the engine has no path that sends its features again to a new source. A changed option needs
  // a new map.
  const [source] = useState(() => ({ ...SOURCE_OPTIONS, ...sourceOptions }))
  return (
    <>
      <Source id={SOURCES.areas} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.lines} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.points} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.vertices} type="geojson" data={EMPTY} {...source} />
      <Source
        id={SOURCES.highlight}
        type="geojson"
        data={EMPTY}
        promoteId="id"
        tolerance={0}
        maxzoom={source.maxzoom}
      />
      {/* the hovered and selected points, a few features: the engine sets them (layers.ts ACTIVE_SOURCE) */}
      <Source id={ACTIVE_SOURCE} type="geojson" data={EMPTY} {...source} />
      {Object.values(EDIT_SOURCES).map((id) => (
        <Source key={id} id={id} type="geojson" data={EMPTY} {...source} />
      ))}
      {/* the selection's copies: drawn below the floor of the data, see layers.ts */}
      {Object.values(SELECT_SOURCES).map((id) => (
        <Source key={id} id={id} type="geojson" data={EMPTY} {...source} />
      ))}
      {/* draws nothing: the place in the stack where module backgrounds go, under the OSM data */}
      <Layer id={BELOW_OSM_LAYER} type="background" layout={{ visibility: 'none' }} />
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}
