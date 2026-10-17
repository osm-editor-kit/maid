// The preview of the rectangle being drawn: the wall after A and B, and the rectangle once the pointer gives it a depth.
// Registered on `map.content`; the mode (mode.ts) writes the preview to the store, this component only draws it.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Feature, FeatureCollection } from 'geojson'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { formatMetres } from '../messages.ts'
import { frameAt, toMetres, type Loc } from '../shared/metres.ts'
import { distance } from '../shared/vector.ts'
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
  {
    // the length of the wall and the depth, in metres on the ground: the tool measures as it draws
    id: 'shapes-rectangle-size',
    type: 'symbol',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'size'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 12,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': COLOUR, 'text-halo-width': 2 },
  } satisfies LayerProps,
]

/** A label at the middle of a side with its length on the ground, e.g. "5,0 m" in German */
function sizeLabel(a: Loc, b: Loc): Feature {
  const frame = frameAt([a, b])
  const metres = distance(toMetres(frame, a), toMetres(frame, b))
  return {
    type: 'Feature',
    properties: { kind: 'size', label: formatMetres(metres) },
    geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
  }
}

function featuresOf(preview: Preview): FeatureCollection {
  const features: Feature[] = []
  if (preview.wall) {
    features.push({
      type: 'Feature',
      properties: { kind: 'wall' },
      geometry: { type: 'LineString', coordinates: [...preview.wall] },
    })
    // the wall's length while it is drawn; once the rectangle has its depth, its own sides carry the labels
    if (!preview.rectangle) features.push(sizeLabel(preview.wall[0], preview.wall[1]))
  }
  if (preview.rectangle) {
    // the ring A, B, E, D, closed back at A
    const ring = [...preview.rectangle, preview.rectangle[0]!]
    features.push({
      type: 'Feature',
      properties: { kind: 'rectangle' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
    // the length on the wall A to B, the depth on the side B to E
    const [a, b, e] = preview.rectangle
    if (a && b) features.push(sizeLabel(a, b))
    if (b && e) features.push(sizeLabel(b, e))
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
