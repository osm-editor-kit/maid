// The cut on the map: the clicked line, the rubber band, the points and the chord (a GeoJSON source), and the status line.
// It only draws what the store holds; the mode (mode.ts) changes the store and the data.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import {
  useCutChord,
  useCutPoints,
  useCutPointer,
  useCutRefusal,
  useCutWayId,
} from './cut-store.ts'
import { cutShapes } from './line.ts'
import { hintText, refusalText } from './texts.ts'

const SOURCE = 'cut-preview'

/**
 * Orange and dashed while it is drawn, red and solid where it is the chord a cut makes (the same colours as the reroute's
 * old and new stretch).
 */
const LAYERS = [
  {
    id: 'cut-drawn',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'drawn'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ea580c', 'line-width': 3, 'line-dasharray': [2, 2] },
  } satisfies LayerProps,
  {
    id: 'cut-band',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'band'],
    paint: { 'line-color': '#ea580c', 'line-width': 2, 'line-dasharray': [1, 2] },
  } satisfies LayerProps,
  {
    id: 'cut-chord',
    type: 'line',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'chord'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#dc2626', 'line-width': 4 },
  } satisfies LayerProps,
  {
    id: 'cut-point',
    type: 'circle',
    source: SOURCE,
    filter: ['==', ['get', 'kind'], 'point'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#ea580c',
      'circle-stroke-width': 2,
    },
  } satisfies LayerProps,
]

export function CutOnMap(_props: MapContentProps) {
  const wayId = useCutWayId()
  const points = useCutPoints()
  const pointer = useCutPointer()
  const chord = useCutChord()
  const refusal = useCutRefusal()
  if (wayId === undefined) return null
  const shapes = cutShapes(points, pointer, chord)
  return (
    <>
      <Source id={SOURCE} type="geojson" data={shapes} />
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
      <div
        role="status"
        className="pointer-events-none absolute top-3 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        {refusal ? refusalText(refusal) : hintText()}
      </div>
    </>
  )
}
