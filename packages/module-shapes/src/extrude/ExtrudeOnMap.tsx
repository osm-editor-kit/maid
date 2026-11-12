// The extrude on the map: a handle on each side of the way, during a pull the way as it would be and the distance (a
// GeoJSON source), and the panel at the top centre with the hint, the toggle and Done, which is DOM inside the map as
// Resize's panel is. Registered on `map.content` (module.ts). It only draws what the store holds; the mode (mode.ts)
// changes the store, and the data when a pull ends.
import { device } from '@osm-editor-kit/maid-i18n'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { formatModifiers, isApplePlatform } from '@osm-editor-kit/maid-ui'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { formatMetres, m } from '../messages.ts'
import { GRIP_IMAGE, useHandleImages } from '../shared/handle-images.ts'
import { keepFromMap } from '../shared/keep-from-map.ts'
import {
  extrudeActions,
  useExtrudeMoveSide,
  useExtrudePull,
  useExtrudeWay,
} from './extrude-store.ts'
import { endExtrude } from './mode.ts'
import {
  EXTRUDE_SOURCE,
  extrudeShapes,
  HANDLE_HIT_LAYER,
  HANDLE_HIT_RADIUS,
  HANDLE_LAYER,
} from './shapes.ts'

const COLOUR = '#2563eb'

/**
 * The way as it would be lightly filled and blue, as Resize's preview; the handles white with a blue ring, as Resize's
 * edge handles; the distance in the rectangle's label style. The hit layer is invisible, wider than the handles, and
 * last. Children of the source, so they take its id.
 */
const LAYERS = [
  {
    id: 'extrude-preview-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'preview-fill'],
    paint: { 'fill-color': '#93c5fd', 'fill-opacity': 0.3 },
  } satisfies LayerProps,
  {
    id: 'extrude-preview-line',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'preview-line'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLOUR, 'line-width': 2 },
  } satisfies LayerProps,
  {
    id: 'extrude-guide',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'guide'],
    layout: { 'line-cap': 'round' },
    // the guides' look of the renderer (layers.ts, `guides`): dashed blue, as iD's
    paint: { 'line-color': '#2b8ff0', 'line-width': 1.5, 'line-dasharray': [4, 3] },
  } satisfies LayerProps,
  {
    id: 'extrude-distance',
    type: 'symbol',
    filter: ['==', ['get', 'kind'], 'distance'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Open Sans Semibold'],
      'text-size': 12,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-offset': [0, 1.6],
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': COLOUR, 'text-halo-width': 2 },
  } satisfies LayerProps,
  {
    // a grip along the side, not a round dot: dots are nodes (shared/handle-images.ts)
    id: HANDLE_LAYER,
    type: 'symbol',
    filter: ['==', ['get', 'kind'], 'handle'],
    layout: {
      'icon-image': GRIP_IMAGE,
      'icon-rotate': ['get', 'rotate'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  } satisfies LayerProps,
  {
    id: HANDLE_HIT_LAYER,
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'handle'],
    paint: { 'circle-radius': HANDLE_HIT_RADIUS, 'circle-opacity': 0 },
  } satisfies LayerProps,
]

export function ExtrudeOnMap({ editor, engine }: MapContentProps) {
  useHandleImages()
  const { way, sides } = useExtrudeWay()
  const pull = useExtrudePull()
  const moveSide = useExtrudeMoveSide()
  if (!way || !engine) return null
  const distance = pull ? formatMetres(Math.abs(pull.distance)) : undefined
  const data = extrudeShapes(way, sides, pull, distance)
  return (
    <>
      <Source id={EXTRUDE_SOURCE} type="geojson" data={data}>
        {LAYERS.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </Source>
      <div
        ref={keepFromMap}
        data-extrude-panel
        className="pointer-events-auto absolute top-3 left-1/2 z-30 w-80 -translate-x-1/2 rounded-xl bg-white p-3 text-sm text-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-medium">{m.extrude_title()}</h2>
          {distance !== undefined && (
            <span
              data-extrude-distance
              className="text-xs text-zinc-600 tabular-nums dark:text-zinc-300"
            >
              {pull && pull.distance < 0 ? m.extrude_in({ distance }) : m.extrude_out({ distance })}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {m.extrude_hint({ ...device() })}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-pressed={moveSide}
            onClick={() => extrudeActions().toggleMoveSide()}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-zinc-950/10 hover:bg-zinc-50 aria-pressed:bg-blue-50 aria-pressed:text-blue-700 aria-pressed:ring-blue-600/40 dark:ring-white/10 dark:hover:bg-zinc-700 dark:aria-pressed:bg-blue-950 dark:aria-pressed:text-blue-300"
          >
            <span>{m.extrude_hint_move()}</span>
            <kbd className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
              {formatModifiers('Shift', isApplePlatform())}
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => endExtrude({ editor, engine })}
            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {m.extrude_done()}
          </button>
        </div>
      </div>
    </>
  )
}
