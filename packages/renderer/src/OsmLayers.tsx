import type { FeatureCollection } from 'geojson'
import { Layer, Source } from 'react-map-gl/maplibre'
import { buildLayers, SOURCES, type LayerOptions } from './layers'

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
  const source = { ...SOURCE_OPTIONS, ...sourceOptions }
  return (
    <>
      <Source id={SOURCES.areas} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.lines} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.points} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.vertices} type="geojson" data={EMPTY} {...source} />
      <Source id={SOURCES.highlight} type="geojson" data={EMPTY} tolerance={0} maxzoom={source.maxzoom} />
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}
