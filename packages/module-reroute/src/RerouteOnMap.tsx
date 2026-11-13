// The reroute on the map: the preview (a GeoJSON source), the panel over the map, and the module mode that takes the
// pointer while a reroute is under way, so nothing else on the map can be clicked or dragged meanwhile. Registered on
// `map.content`; it is the only part that needs the engine, which the app passes in.
//
// As in a route planner: the start and the end are handles on the route's own ways, a press on the new path drags a
// via point out of it, a click adds a via point, Backspace takes the last one out and Escape ends the reroute.
import type { MaidEngine, MapContentProps, ModuleMode } from '@osm-editor-kit/maid-renderer'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { RerouteApply } from './apply-port.ts'
import { previewShapes } from './preview-shapes.ts'
import {
  readReroute,
  rerouteActions,
  useRerouteSelected,
  viaIndexFor,
  type ViaHandle,
} from './reroute-store.ts'
import { ReroutePanel } from './ReroutePanel.tsx'
import { useReroute } from './use-reroute.ts'

const MODE_ID = 'reroute'
const SOURCE = 'reroute-preview'
const HANDLE_LAYER = 'reroute-handle'
/** The new path's layers: a press on them drags a new via point out of the line */
const LINE_LAYERS = ['reroute-new', 'reroute-same']
const EMPTY: readonly string[] = []
const noSubscribe = () => () => {}

/** The layers as react-map-gl takes them; the filter and the colour expressions are JSON arrays of the style spec */
function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

/**
 * The colours of the map's edits display (renderer layers.ts EDIT_COLOUR) where the route changes: the stretch as it is
 * orange and dashed (what the new path does not cover leaves the route), the new path on ways that join the route green
 * with a blue core, on ways that stay blue. Split points white, points to check amber.
 */
const LAYERS: LayerProps[] = [
  asLayer({
    id: 'reroute-old',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'old'],
    paint: { 'line-color': '#ff7e2e', 'line-width': 5, 'line-dasharray': [2, 1.5] },
  }),
  asLayer({
    id: 'reroute-new-casing',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'new'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#85ff67', 'line-width': 12, 'line-opacity': 0.85 },
  }),
  asLayer({
    id: 'reroute-same',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'same'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 6 },
  }),
  asLayer({
    id: 'reroute-new',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'new'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 6 },
  }),
  asLayer({
    id: 'reroute-split',
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'split'],
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#1e293b',
      'circle-stroke-width': 2,
    },
  }),
  asLayer({
    id: 'reroute-review',
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'review'],
    paint: {
      'circle-radius': 6,
      'circle-color': '#f59e0b',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  }),
  asLayer({
    id: HANDLE_LAYER,
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'handle'],
    paint: {
      'circle-radius': ['case', ['in', 'via', ['get', 'handle']], 6, 8],
      'circle-color': ['case', ['==', ['get', 'snapped'], true], '#2563eb', '#94a3b8'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  }),
]

function handleOf(name: string): ViaHandle | undefined {
  if (name === 'start' || name === 'end') return name
  return /^via-\d+$/.test(name) ? (name as ViaHandle) : undefined
}

/**
 * The mode for one relation. Its handlers write to the store; the exit ends the reroute only while the store still
 * holds this relation, so an exit that comes late (after another reroute began) does not clear the new one.
 */
function modeFor(relationId: EntityID): ModuleMode {
  // a press on the new path makes a via point there and drags it: the drag's callbacks keep naming `line`
  let lineVia: ViaHandle | undefined
  const moveHandle = (name: string, lon: number, lat: number) => {
    const handle = name === 'line' ? lineVia : handleOf(name)
    if (handle) rerouteActions.moveVia(handle, { lon, lat })
  }
  const startLineDrag = (lon: number, lat: number) => {
    const { start, end, vias } = readReroute()
    if (!start || !end) return
    const point = { lon, lat }
    const index = viaIndexFor([start, ...vias, end], point)
    rerouteActions.addVia(index, point)
    lineVia = `via-${index}`
  }
  // A drag moves the handle at most once per animation frame: each move finds the route again, so the pointer's
  // moves between two frames are not all answered. The drop is never delayed (it cancels the frame).
  let pending: { name: string; lon: number; lat: number } | undefined
  let frame: number | undefined
  const cancelFrame = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    pending = undefined
  }
  const flush = () => {
    frame = undefined
    if (pending) moveHandle(pending.name, pending.lon, pending.lat)
    pending = undefined
  }
  return {
    id: MODE_ID,
    cursor: 'crosshair',
    handleLayers: [HANDLE_LAYER, ...LINE_LAYERS],
    onClick: (lon, lat) => rerouteActions.click({ lon, lat }),
    onKey: (key) => {
      if (key !== 'Backspace' || readReroute().vias.length === 0) return false
      rerouteActions.removeVia()
      return true
    },
    onDragStart: (name, lon, lat) => {
      lineVia = undefined
      if (name === 'line') startLineDrag(lon, lat)
    },
    onDrag: (name, lon, lat) => {
      pending = { name, lon, lat }
      if (frame === undefined) frame = requestAnimationFrame(flush)
    },
    onDragEnd: (name, lon, lat) => {
      cancelFrame()
      moveHandle(name, lon, lat)
      lineVia = undefined
    },
    onExit: () => {
      cancelFrame()
      if (readReroute().relationId === relationId) rerouteActions.stop()
    },
  }
}

/** The engine's current selection, read again when it changes (the engine is not a React value) */
function useSelection(engine: MaidEngine | undefined): readonly string[] {
  return useSyncExternalStore(engine?.subscribe ?? noSubscribe, () => engine?.selection ?? EMPTY)
}

/** The pointer events a panel over the map keeps from the map (MapLibre and the map view listen on its container) */
const KEPT_EVENTS = [
  'pointerdown',
  'mousedown',
  'touchstart',
  'click',
  'dblclick',
  'wheel',
  'contextmenu',
]

/**
 * HTML over the map, in its top left corner: a frame of its own in the map's container, so it sits on the map whatever
 * the panels beside it do. The events stop at the frame, so a click on a button is no click on the map. React listens
 * on the frame itself (it is the portal's container), and a listener on the same element still runs after a stop.
 */
function OverMap({ children }: { children: ReactNode }) {
  const { current: map } = useMap()
  const [frame] = useState(() => {
    if (typeof document === 'undefined') return undefined
    const element = document.createElement('div')
    element.className = 'absolute top-3 left-3 z-10 w-[min(24rem,calc(100%-1.5rem))] cursor-auto'
    return element
  })
  const container = map?.getContainer()
  useEffect(
    function placeFrame() {
      if (!frame || !container) return
      const stop = (event: Event) => event.stopPropagation()
      for (const name of KEPT_EVENTS) frame.addEventListener(name, stop)
      container.append(frame)
      return () => {
        for (const name of KEPT_EVENTS) frame.removeEventListener(name, stop)
        frame.remove()
      }
    },
    [frame, container],
  )
  if (!frame) return null
  return createPortal(children, frame)
}

export type RerouteOnMapProps = MapContentProps & { apply: RerouteApply }

export function RerouteOnMap({ editor, engine, apply }: RerouteOnMapProps) {
  const readOnly = useCallback((id: EntityID) => engine?.isReadOnly(id) ?? false, [engine])
  const { relationId, preview, graph } = useReroute(editor, readOnly)
  const selected = useRerouteSelected()
  const selection = useSelection(engine)

  // a reroute belongs to what was selected when it began (the way of the edit menu, or the relation): another
  // selection ends it
  useEffect(() => {
    if (relationId !== undefined && selected !== undefined && !selection.includes(selected))
      rerouteActions.stop()
  }, [relationId, selected, selection])

  // the pointer goes to the reroute from the moment it begins until it ends
  useEffect(() => {
    if (!engine || relationId === undefined) return
    engine.enterModuleMode(modeFor(relationId))
    return () => engine.exitModuleMode(MODE_ID)
  }, [engine, relationId])

  const shapes = useMemo(
    () => (preview && relationId !== undefined ? previewShapes(graph, preview) : undefined),
    [graph, preview, relationId],
  )
  if (relationId === undefined || shapes === undefined || !preview) return null
  // flat: the source, then its layers, which name it (react-map-gl skill: flat source and layer). The panel is HTML in
  // the map's corner (OverMap).
  return (
    <>
      <Source id={SOURCE} type="geojson" data={shapes} />
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...asLayer({ ...layer, source: SOURCE })} />
      ))}
      <OverMap>
        <ReroutePanel
          editor={editor}
          graph={graph}
          preview={preview}
          apply={apply}
          readOnly={readOnly}
        />
      </OverMap>
    </>
  )
}
