// The cut on the map: the clicked line, the rubber band, the points and the chord (a GeoJSON source), and the status line.
// It is registered on `map.content`; it binds the editor and the engine for the mode, which an operation cannot reach.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useEffect } from 'react'
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre'
import { cutShapes } from './line.ts'
import { bindCut } from './mode.ts'
import { useCut } from './store.ts'
import { hintText, refusalText } from './texts.ts'

const SOURCE = 'cut-preview'

/** The layers as react-map-gl takes them; the filter and the paint are JSON arrays of the style spec */
function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

/**
 * Orange and dashed while it is drawn, red and solid where it is the chord a cut makes (the same colours as the reroute's
 * old and new stretch).
 */
const LAYERS: LayerProps[] = [
  asLayer({
    id: 'cut-drawn',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'drawn'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ea580c', 'line-width': 3, 'line-dasharray': [2, 2] },
  }),
  asLayer({
    id: 'cut-band',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'band'],
    paint: { 'line-color': '#ea580c', 'line-width': 2, 'line-dasharray': [1, 2] },
  }),
  asLayer({
    id: 'cut-chord',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'chord'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#dc2626', 'line-width': 4 },
  }),
  asLayer({
    id: 'cut-point',
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'point'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#ea580c',
      'circle-stroke-width': 2,
    },
  }),
]

export function CutOnMap({ editor, engine }: MapContentProps) {
  // the mode works with this editor and engine from the moment the map has them until it goes
  useEffect(() => {
    if (!engine) return
    bindCut({ editor, engine })
    return () => bindCut(undefined)
  }, [editor, engine])

  const cut = useCut()
  if (cut.wayId === undefined) return null
  const shapes = cutShapes(cut.points, cut.pointer, cut.chord)
  return (
    <>
      <Source id={SOURCE} type="geojson" data={shapes} />
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...asLayer({ ...layer, source: SOURCE })} />
      ))}
      <div
        role="status"
        className="pointer-events-none absolute top-3 left-1/2 z-30 max-w-[90%] -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        {cut.refusal ? refusalText(cut.refusal) : hintText()}
      </div>
    </>
  )
}
