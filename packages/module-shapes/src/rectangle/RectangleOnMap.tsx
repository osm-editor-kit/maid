// The preview of the rectangle being drawn: the wall after A and B, and the rectangle once the pointer gives it a depth.
// Registered on `map.content`; the mode (mode.ts) writes the preview to the store, this component only draws it.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, FeatureCollection } from 'geojson'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import type { Preview } from './state.ts'
import { useRectanglePreview } from './store.ts'

const SOURCE = 'shapes-rectangle-preview'
const COLOUR = '#2563eb'

/** The layers as react-map-gl takes them; the filter and the paint are JSON arrays of the style spec */
function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

const LAYERS: LayerProps[] = [
  asLayer({
    id: 'shapes-rectangle-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'rectangle'],
    paint: { 'fill-color': COLOUR, 'fill-opacity': 0.15 },
  }),
  asLayer({
    id: 'shapes-rectangle-outline',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'rectangle'],
    paint: { 'line-color': COLOUR, 'line-width': 2, 'line-dasharray': [2, 2] },
  }),
  asLayer({
    id: 'shapes-rectangle-wall',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'wall'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': COLOUR, 'line-width': 3 },
  }),
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
        <Layer key={(layer as { id: string }).id} {...asLayer({ ...layer, source: SOURCE })} />
      ))}
    </>
  )
}
