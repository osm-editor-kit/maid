// The cut on the map: the line with its points and midpoints, the pieces it would make (a GeoJSON source), and the panel at
// the top centre, which is DOM inside the map as Divide's panel is. Registered on `map.content` (module.ts). It only draws
// what the store holds; the mode (mode.ts) changes the store and the data.
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { m } from '../messages.ts'
import { keepFromMap } from '../shared/keep-from-map.ts'
import { useCutPieces, useCutPoints, useCutRefusal, useCutWayId } from './cut-store.ts'
import {
  CUT_SOURCE,
  cutShapes,
  HANDLE_HIT_RADIUS,
  MIDPOINT_HIT_LAYER,
  MIDPOINT_LAYER,
  MIDPOINT_RADIUS,
  POINT_HIT_LAYER,
  POINT_LAYER,
  POINT_RADIUS,
} from './line.ts'
import { applyCut } from './mode.ts'
import { hintText, refusalText } from './texts.ts'

/**
 * The line's colours: the line solid and orange; the points white with a blue ring, as the map's active vertices; the
 * midpoints smaller and semi-transparent, so they read as the places a point can be added; the pieces blue, dashed and
 * lightly filled (as Divide's preview).
 */
const LAYERS = [
  {
    id: 'cut-piece-fill',
    type: 'fill',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'piece'],
    paint: { 'fill-color': '#93c5fd', 'fill-opacity': 0.3 },
  } satisfies LayerProps,
  {
    id: 'cut-piece-line',
    type: 'line',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'piece'],
    paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [2, 2] },
  } satisfies LayerProps,
  {
    id: 'cut-line',
    type: 'line',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'line'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ea580c', 'line-width': 3 },
  } satisfies LayerProps,
  {
    id: MIDPOINT_LAYER,
    type: 'circle',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'midpoint'],
    paint: {
      'circle-radius': MIDPOINT_RADIUS,
      'circle-color': '#ffffff',
      'circle-opacity': 0.6,
      'circle-stroke-color': '#2563eb',
      'circle-stroke-opacity': 0.6,
      'circle-stroke-width': 1.5,
    },
  } satisfies LayerProps,
  {
    id: POINT_LAYER,
    type: 'circle',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'point'],
    paint: {
      'circle-radius': POINT_RADIUS,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#2563eb',
      'circle-stroke-width': 2.5,
    },
  } satisfies LayerProps,
  // the hit areas: invisible, wider than the dots, and last so that a point is taken before a midpoint under it
  {
    id: MIDPOINT_HIT_LAYER,
    type: 'circle',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'midpoint'],
    paint: { 'circle-radius': HANDLE_HIT_RADIUS, 'circle-opacity': 0 },
  } satisfies LayerProps,
  {
    id: POINT_HIT_LAYER,
    type: 'circle',
    source: CUT_SOURCE,
    filter: ['==', ['get', 'kind'], 'point'],
    paint: { 'circle-radius': HANDLE_HIT_RADIUS, 'circle-opacity': 0 },
  } satisfies LayerProps,
]

export function CutOnMap({ editor, engine }: MapContentProps) {
  const wayId = useCutWayId()
  const points = useCutPoints()
  const pieces = useCutPieces()
  const refusal = useCutRefusal()
  if (wayId === undefined || points === undefined || !engine) return null
  return (
    <>
      <Source id={CUT_SOURCE} type="geojson" data={cutShapes(points, pieces)} />
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
      <div
        ref={keepFromMap}
        data-cut-panel
        className="pointer-events-auto absolute top-3 left-1/2 z-30 w-72 -translate-x-1/2 rounded-xl bg-white p-3 text-sm text-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        <h2 className="font-medium">{m.cut_title()}</h2>
        {refusal ? (
          <p role="alert" className="mt-2 text-amber-700 dark:text-amber-400">
            {refusalText(refusal)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{hintText()}</p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={refusal !== undefined}
            onClick={() => applyCut({ editor, engine }, wayId)}
            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
          >
            {m.cut_apply()}
          </button>
        </div>
      </div>
    </>
  )
}
