// The resize on the map: the features as they would be, the box with its handles and its size (a GeoJSON source), and
// the panel at the top centre with the size, the two toggles and Apply, which is DOM inside the map as Cut's panel is.
// Registered on `map.content` (module.ts). It only draws what the store holds; the mode (mode.ts) changes the store, and
// the data when the resize is kept.
import { device } from '@osm-editor-kit/maid-i18n'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { formatModifiers, isApplePlatform } from '@osm-editor-kit/maid-ui'
import type { FeatureCollection } from 'geojson'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { formatNumber, m } from '../messages.ts'
import { keepFromMap } from '../shared/keep-from-map.ts'
import { heightOf, widthOf } from './box.ts'
import { applyResize, MODE_ID } from './mode.ts'
import {
  resizeActions,
  useResizeBox,
  useResizeExtent,
  useResizePreview,
  useResizeToggles,
} from './resize-store.ts'
import { movesFor } from './resize.ts'
import {
  boxShapes,
  CORNER_RADIUS,
  EDGE_RADIUS,
  HANDLE_HIT_LAYER,
  HANDLE_HIT_RADIUS,
  HANDLE_LAYER,
  previewShapes,
  RESIZE_SOURCE,
} from './shapes.ts'

const COLOUR = '#2563eb'

/**
 * The features as they would be lightly filled and blue, as Cut's and Divide's pieces, under the box; the box dashed and
 * blue, as the shapes' previews; the handles white with a blue ring, corners a little larger than
 * the edge handles; the size in the rectangle's label style. The hit layer is invisible, wider than the handles, and
 * last. Children of the source, so they take its id.
 */
const LAYERS = [
  {
    id: 'resize-preview-fill',
    type: 'fill',
    filter: ['==', ['get', 'kind'], 'preview-fill'],
    paint: { 'fill-color': '#93c5fd', 'fill-opacity': 0.3 },
  } satisfies LayerProps,
  {
    id: 'resize-preview-line',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'preview-line'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLOUR, 'line-width': 2 },
  } satisfies LayerProps,
  {
    id: 'resize-preview-point',
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'preview-point'],
    paint: { 'circle-radius': 4, 'circle-color': COLOUR },
  } satisfies LayerProps,
  {
    id: 'resize-outline',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'outline'],
    paint: { 'line-color': COLOUR, 'line-width': 1.5, 'line-dasharray': [3, 2] },
  } satisfies LayerProps,
  {
    id: 'resize-size',
    type: 'symbol',
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
  {
    id: HANDLE_LAYER,
    type: 'circle',
    filter: ['in', ['get', 'kind'], ['literal', ['corner', 'edge']]],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'kind'], 'corner'], CORNER_RADIUS, EDGE_RADIUS],
      'circle-color': '#ffffff',
      'circle-stroke-color': COLOUR,
      'circle-stroke-width': 2,
    },
  } satisfies LayerProps,
  {
    id: HANDLE_HIT_LAYER,
    type: 'circle',
    filter: ['in', ['get', 'kind'], ['literal', ['corner', 'edge']]],
    paint: { 'circle-radius': HANDLE_HIT_RADIUS, 'circle-opacity': 0 },
  } satisfies LayerProps,
]

/** A toggle of the panel: pressed or not, with the key that turns it round while a handle is dragged */
function Toggle(props: { label: string; keys: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onToggle}
      className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-zinc-950/10 hover:bg-zinc-50 aria-pressed:bg-blue-50 aria-pressed:text-blue-700 aria-pressed:ring-blue-600/40 dark:ring-white/10 dark:hover:bg-zinc-700 dark:aria-pressed:bg-blue-950 dark:aria-pressed:text-blue-300"
    >
      <span>{props.label}</span>
      <kbd className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
        {formatModifiers(props.keys, isApplePlatform())}
      </kbd>
    </button>
  )
}

export function ResizeOnMap({ editor, engine }: MapContentProps) {
  const box = useResizeBox()
  const extent = useResizeExtent()
  const preview = useResizePreview()
  const { proportional, centre } = useResizeToggles()
  if (!box || !extent || !preview || !engine) return null
  const size = m.resize_size({
    width: formatNumber(widthOf(extent)),
    height: formatNumber(heightOf(extent)),
  })
  const factor = m.resize_factor({
    width: formatNumber((100 * widthOf(extent)) / widthOf(box.extent), 0),
    height: formatNumber((100 * heightOf(extent)) / heightOf(box.extent), 0),
  })
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...previewShapes(preview, new Map(movesFor(box, extent))),
      ...boxShapes(box, extent, size).features,
    ],
  }
  return (
    <>
      <Source id={RESIZE_SOURCE} type="geojson" data={data}>
        {LAYERS.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </Source>
      <div
        ref={keepFromMap}
        data-resize-panel
        className="pointer-events-auto absolute top-3 left-1/2 z-30 w-80 -translate-x-1/2 rounded-xl bg-white p-3 text-sm text-zinc-800 shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-medium">{m.resize_title()}</h2>
          <span data-resize-size className="text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
            {size} · {factor}
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {m.resize_hint({ ...device() })}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Toggle
            label={m.resize_hint_proportional()}
            keys="Shift"
            pressed={proportional}
            onToggle={() => resizeActions().toggleProportional()}
          />
          <Toggle
            label={m.resize_hint_centre()}
            keys="Alt"
            pressed={centre}
            onToggle={() => resizeActions().toggleCentre()}
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => engine.exitModuleMode(MODE_ID)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/10 dark:hover:bg-zinc-700"
          >
            {m.resize_cancel()}
          </button>
          <button
            type="button"
            onClick={() => applyResize({ editor, engine })}
            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {m.resize_apply()}
          </button>
        </div>
      </div>
    </>
  )
}
