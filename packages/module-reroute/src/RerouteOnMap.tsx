import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
// The reroute on the map: the preview (a GeoJSON source), the panel over the map, and the module mode that takes the
// pointer while a reroute is under way, so nothing else on the map can be clicked or dragged meanwhile. Registered on
// `map.content`; it is the only part that needs the engine, which the app passes in.
//
// As in a route planner (Tobias, 2026-11-13): the route is a blue line with support points where it turns. A press on
// the line, or on a support point, drags the route away from there; only the stretch between the two support points
// around it is routed again. The drop writes it as one undo step, and what left and joined the route stays marked.
// Backspace takes out the last via point of an edit, Escape ends the mode.
import type { MaidEngine, MapContentProps, ModuleMode } from '@osm-editor-kit/maid-renderer'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { RerouteApply } from './apply-port.ts'
import { editAt, editOfAnchor, routeChain, type RouteChain } from './chain.ts'
import { wayLine } from './geometry.ts'
import { changedWays, previewShapes } from './preview-shapes.ts'
import {
  readReroute,
  rerouteActions,
  useRerouteCommitAsked,
  useRerouteLastChange,
  useRerouteSelected,
  viaIndexFor,
  type RouteChange,
  type ViaHandle,
} from './reroute-store.ts'
import { ReroutePanel } from './ReroutePanel.tsx'
import { requestOf } from './route.ts'
import { useReroute } from './use-reroute.ts'

const MODE_ID = 'reroute'
const SOURCE = 'reroute-preview'
const HANDLE_LAYER = 'reroute-handle'
const ROUTE_SOURCE = 'reroute-route'
const ROUTE_LINE_LAYER = 'reroute-route-line'
const ANCHOR_LAYER = 'reroute-route-anchor'
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

/**
 * The route as the mode shows it: the whole line in blue, wide enough to be pressed, with its support points; under
 * it, the last edit's change in the colours of the edits display (orange dashed: left the route; green: joined it).
 */
const ROUTE_LAYERS: LayerProps[] = [
  asLayer({
    id: 'reroute-route-gone',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'gone'],
    paint: { 'line-color': '#ff7e2e', 'line-width': 5, 'line-dasharray': [2, 1.5] },
  }),
  asLayer({
    id: 'reroute-route-joined',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'joined'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#85ff67', 'line-width': 14, 'line-opacity': 0.85 },
  }),
  asLayer({
    id: ROUTE_LINE_LAYER,
    type: 'line',
    filter: ['==', ['get', 'kind'], 'route'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 6, 'line-opacity': 0.9 },
  }),
  asLayer({
    id: ANCHOR_LAYER,
    type: 'circle',
    filter: ['==', ['get', 'kind'], 'anchor'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'end'], true], 5, 6],
      'circle-color': ['case', ['==', ['get', 'end'], true], '#1e3a8a', '#ffffff'],
      'circle-stroke-color': '#2563eb',
      'circle-stroke-width': 2.5,
    },
  }),
]

/** The route's line per graph and relation, made once: the mode's handlers and the map read it */
const chains = new WeakMap<Graph, Map<OsmRelation, RouteChain>>()
function chainOf(graph: Graph, relation: OsmRelation): RouteChain {
  let byRelation = chains.get(graph)
  if (!byRelation) {
    byRelation = new Map()
    chains.set(graph, byRelation)
  }
  let chain = byRelation.get(relation)
  if (!chain) {
    chain = routeChain(graph, relation)
    byRelation.set(relation, chain)
  }
  return chain
}

/** The route's line, its support points and the last change, as GeoJSON for one source */
function routeShapes(graph: Graph, chain: RouteChain, change: RouteChange | undefined) {
  const features: object[] = []
  const line = (coordinates: number[][], properties: object) =>
    features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } })
  for (const id of change?.removed ?? []) {
    const coordinates = wayLine(graph, id)
    if (coordinates.length > 1) line(coordinates, { kind: 'gone' })
  }
  for (const id of change?.added ?? []) {
    const coordinates = wayLine(graph, id)
    if (coordinates.length > 1) line(coordinates, { kind: 'joined' })
  }
  let piece: number[][] = []
  for (const point of chain.points) {
    if (point.gapBefore && piece.length > 1) line(piece, { kind: 'route', handle: 'route' })
    if (point.gapBefore) piece = []
    piece.push([point.loc[0], point.loc[1]])
  }
  if (piece.length > 1) line(piece, { kind: 'route', handle: 'route' })
  chain.anchors.forEach((position, which) => {
    const point = chain.points[position]!
    const end =
      which === 0 ||
      which === chain.anchors.length - 1 ||
      point.gapBefore === true ||
      chain.points[position + 1]?.gapBefore === true
    features.push({
      type: 'Feature',
      properties: { kind: 'anchor', end, ...(!end && { handle: `anchor-${which}` }) },
      geometry: { type: 'Point', coordinates: [point.loc[0], point.loc[1]] },
    })
  })
  return { type: 'FeatureCollection', features } as const
}

function handleOf(name: string): ViaHandle | undefined {
  if (name === 'start' || name === 'end') return name
  return /^via-\d+$/.test(name) ? (name as ViaHandle) : undefined
}

/**
 * The mode for one relation. Its handlers write to the store; the exit ends the reroute only while the store still
 * holds this relation, so an exit that comes late (after another reroute began) does not clear the new one. `chain`
 * reads the route's line on the data as it is at the press.
 */
function modeFor(relationId: EntityID, chain: () => RouteChain | undefined): ModuleMode {
  // the handle a press started: a press on the route or a support point makes an edit whose via point it drags; a
  // press on the edit's new path adds a via point. The drag's callbacks keep naming what was pressed.
  let dragged: ViaHandle | undefined
  const moveHandle = (name: string, lon: number, lat: number) => {
    const handle = dragged ?? handleOf(name)
    if (handle) rerouteActions.moveVia(handle, { lon, lat })
  }
  const startDrag = (name: string, lon: number, lat: number) => {
    dragged = undefined
    if (name === 'route' || name.startsWith('anchor-')) {
      const line = chain()
      if (!line) return
      const edit =
        name === 'route' ? editAt(line, lon, lat) : editOfAnchor(line, Number(name.slice(7)))
      if (!edit) return
      rerouteActions.edit(edit)
      dragged = 'via-0'
    } else if (name === 'line') {
      const { start, end, vias } = readReroute()
      if (!start || !end) return
      const point = { lon, lat }
      const index = viaIndexFor([start, ...vias, end], point)
      rerouteActions.addVia(index, point)
      dragged = `via-${index}`
    }
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
    cursor: 'default',
    // the mode holds only the route relation: an undo (the panel's, or the keys) takes back a drop and the mode stays
    staysOnUndo: true,
    handleLayers: [HANDLE_LAYER, ANCHOR_LAYER, ...LINE_LAYERS, ROUTE_LINE_LAYER],
    onKey: (key) => {
      if (key !== 'Backspace' || readReroute().vias.length === 0) return false
      rerouteActions.removeVia()
      return true
    },
    onDragStart: (name, lon, lat) => startDrag(name, lon, lat),
    onDrag: (name, lon, lat) => {
      pending = { name, lon, lat }
      if (frame === undefined) frame = requestAnimationFrame(flush)
    },
    onDragEnd: (name, lon, lat) => {
      cancelFrame()
      moveHandle(name, lon, lat)
      dragged = undefined
      // the drop writes the edit (RerouteOnMap), as a route planner takes a dragged route at once
      if (readReroute().start) rerouteActions.drop()
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
  const { relationId, relation, preview, graph } = useReroute(editor, readOnly)
  const selected = useRerouteSelected()
  const selection = useSelection(engine)
  const commitAsked = useRerouteCommitAsked()
  const lastChange = useRerouteLastChange()
  const handled = useRef(commitAsked)

  // a reroute belongs to the route and what was selected when it began: a selection of something else ends it
  useEffect(() => {
    if (relationId === undefined || selection.length === 0) return
    if (
      !selection.includes(relationId) &&
      (selected === undefined || !selection.includes(selected))
    )
      rerouteActions.stop()
  }, [relationId, selected, selection])

  // the pointer goes to the reroute from the moment it begins until it ends
  useEffect(() => {
    if (!engine || relationId === undefined) return
    const chain = () => {
      const now = editor.history.staging.graph
      const entity = now.hasEntity(relationId)
      return entity instanceof OsmRelation ? chainOf(now, entity) : undefined
    }
    engine.enterModuleMode(modeFor(relationId, chain))
    return () => engine.exitModuleMode(MODE_ID)
  }, [engine, editor, relationId])

  // a drop writes the edit at once, as one undo step; an edit that changes nothing is dropped, one that cannot be
  // written stays with its reason (the panel says it)
  useEffect(() => {
    if (commitAsked === handled.current) return
    handled.current = commitAsked
    if (!preview?.plan?.ok) return
    const { removed, added } = changedWays(graph, preview)
    if (removed.length === 0 && added.length === 0 && preview.plan.splitWays.length === 0) {
      rerouteActions.discard()
      return
    }
    const request = requestOf(preview)
    if (!request) return
    const result = apply.apply(editor, request, readOnly)
    if (result.ok) rerouteActions.applied({ removed, added })
    else rerouteActions.failed(result.reason)
  }, [commitAsked, preview, graph, apply, editor, readOnly])

  const route = useMemo(
    () => (relation ? routeShapes(graph, chainOf(graph, relation), lastChange) : undefined),
    [graph, relation, lastChange],
  )
  const shapes = useMemo(
    () => (preview?.start ? previewShapes(graph, preview) : undefined),
    [graph, preview],
  )
  if (relationId === undefined || !preview || !route) return null
  // flat: each source, then its layers, which name it (react-map-gl skill: flat source and layer). The panel is HTML
  // in the map's corner (OverMap).
  return (
    <>
      <Source id={ROUTE_SOURCE} type="geojson" data={route as never} />
      {ROUTE_LAYERS.map((layer) => (
        <Layer key={layer.id} {...asLayer({ ...layer, source: ROUTE_SOURCE })} />
      ))}
      {shapes && <Source id={SOURCE} type="geojson" data={shapes} />}
      {shapes &&
        LAYERS.map((layer) => <Layer key={layer.id} {...asLayer({ ...layer, source: SOURCE })} />)}
      <OverMap>
        <ReroutePanel
          editor={editor}
          engine={engine}
          graph={graph}
          preview={preview}
          readOnly={readOnly}
        />
      </OverMap>
    </>
  )
}
