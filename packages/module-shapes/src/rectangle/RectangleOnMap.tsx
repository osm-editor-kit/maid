// The preview of the rectangle being drawn: the wall after A and B, and the rectangle once the pointer gives it a depth.
// Registered on `map.content`; the mode (mode.ts) writes the preview to the store, this component only draws it.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, FeatureCollection } from 'geojson'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { useRectanglePreview } from './rectangle-store.ts'
import type { Preview } from './state.ts'

const SOURCE = 'shapes-rectangle-preview'
const COLOUR = '#2563eb'

/** The layers, each with the source it draws; the filter and the paint are JSON arrays of the style spec */
const LAYERS = [
  {
    id: 'shapes-rectangle-fill',
    type: 'fill',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'rectangle'],
    paint: { 'fill-color': COLOUR, 'fill-opacity': 0.15 },
  } satisfies LayerProps,
  {
    id: 'shapes-rectangle-outline',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'rectangle'],
    paint: { 'line-color': COLOUR, 'line-width': 2, 'line-dasharray': [2, 2] },
  } satisfies LayerProps,
  {
    id: 'shapes-rectangle-wall',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'wall'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': COLOUR, 'line-width': 3 },
  } satisfies LayerProps,
]

function featuresOf(preview: Preview): FeatureCollection {
  const features: Feature[] = []
  if (preview.wall) {
    features.push({
      type: 'Feature',
      properties: { kind: 'wall' },
      geometry: { type: 'LineString', coordinates: [...preview.wall] },
    })
  }
  if (preview.rectangle) {
    // the ring A, B, E, D, closed back at A
    const ring = [...preview.rectangle, preview.rectangle[0]!]
    features.push({
      type: 'Feature',
      properties: { kind: 'rectangle' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function RectangleOnMap(_props: MapContentProps) {
  const preview = useRectanglePreview()
  // flat: the source, then its layers, which name it (react-map-gl skill: flat source and layer)
  return (
    <>
      <Source id={SOURCE} type="geojson" data={featuresOf(preview)} />
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}
