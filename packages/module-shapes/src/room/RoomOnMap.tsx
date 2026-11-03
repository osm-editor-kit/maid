// The preview of the room being drawn: the point on the wall, the line so far, the dashed guides to the walls, the
// room it makes and the labels (lengths, or why the room is refused). Registered on `map.content`; the mode (mode.ts)
// writes the preview to the store, this component only draws it.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, FeatureCollection } from 'geojson'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { type RoomPreview, useRoomPreview } from './room-store.ts'

const SOURCE = 'shapes-room-preview'
/** The blue of the drawing tools' previews (the rectangle's) */
const COLOUR = '#2563eb'
const REFUSED = '#dc2626'

/** The layers, each with the source it draws; the filter and the paint are JSON arrays of the style spec */
const LAYERS = [
  {
    id: 'shapes-room-fill',
    type: 'fill',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'room'],
    paint: { 'fill-color': COLOUR, 'fill-opacity': 0.15 },
  } satisfies LayerProps,
  {
    id: 'shapes-room-outline',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'room'],
    paint: { 'line-color': COLOUR, 'line-width': 2 },
  } satisfies LayerProps,
  {
    id: 'shapes-room-guide',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'guide'],
    paint: { 'line-color': COLOUR, 'line-width': 1.5, 'line-dasharray': [2, 2] },
  } satisfies LayerProps,
  {
    id: 'shapes-room-line',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'line'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLOUR, 'line-width': 3 },
  } satisfies LayerProps,
  {
    // the point on the wall where the room starts or ends with the next click
    id: 'shapes-room-wall-point',
    type: 'circle',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'wall'],
    paint: {
      'circle-radius': 6,
      'circle-color': COLOUR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  } satisfies LayerProps,
  {
    id: 'shapes-room-label',
    type: 'symbol',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'label'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 12,
      'text-offset': [0, -1.5],
      'text-max-width': 18,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': ['case', ['get', 'refused'], REFUSED, COLOUR],
      'text-halo-width': 2,
    },
  } satisfies LayerProps,
]

/** The preview as GeoJSON features, one `kind` per layer */
export function featuresOf(preview: RoomPreview): FeatureCollection {
  const features: Feature[] = []
  if (preview.room) {
    features.push({
      type: 'Feature',
      properties: { kind: 'room' },
      geometry: { type: 'Polygon', coordinates: [[...preview.room]] },
    })
  }
  for (const guide of preview.guides ?? []) {
    features.push({
      type: 'Feature',
      properties: { kind: 'guide' },
      geometry: { type: 'LineString', coordinates: [...guide] },
    })
  }
  if (preview.line && preview.line.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: [...preview.line] },
    })
  }
  if (preview.wallPoint) {
    features.push({
      type: 'Feature',
      properties: { kind: 'wall' },
      geometry: { type: 'Point', coordinates: [...preview.wallPoint] },
    })
  }
  for (const label of preview.labels ?? []) {
    features.push({
      type: 'Feature',
      properties: { kind: 'label', label: label.text, refused: label.refused === true },
      geometry: { type: 'Point', coordinates: [...label.at] },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function RoomOnMap(_props: MapContentProps) {
  const preview = useRoomPreview()
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
