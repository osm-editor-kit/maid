// The reroute on the map: the preview (a GeoJSON source) and the module mode that takes the pointer while a reroute is
// under way. Registered on `map.content`; it is the only part that needs the engine, which the app passes in.
import type { MaidEngine, MapContentProps, ModuleMode } from '@osm-editor-kit/maid-renderer'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre'
import { previewShapes } from './preview-shapes.ts'
import { readReroute, rerouteActions, type ViaHandle } from './reroute-store.ts'
import { useReroute } from './use-reroute.ts'

const MODE_ID = 'reroute'
const SOURCE = 'reroute-preview'
const HANDLE_LAYER = 'reroute-handle'
const EMPTY: readonly string[] = []
const noSubscribe = () => () => {}

/** The layers as react-map-gl takes them; the filter and the colour expressions are JSON arrays of the style spec */
function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

/** Under the route's own colours: the old stretch red and dashed, the new path blue, split points white, checks amber */
const LAYERS: LayerProps[] = [
  asLayer({
    id: 'reroute-old',
    type: 'line',
    filter: ['==', ['get', 'kind'], 'old'],
    paint: { 'line-color': '#dc2626', 'line-width': 4, 'line-dasharray': [2, 2] },
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
      'circle-radius': 8,
      'circle-color': ['case', ['==', ['get', 'snapped'], true], '#2563eb', '#94a3b8'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  }),
]

function handleOf(name: string): ViaHandle | undefined {
  return name === 'start' || name === 'end' ? name : undefined
}

/**
 * The mode for one relation. Its handlers write to the store; the exit ends the reroute only while the store still
 * holds this relation, so an exit that comes late (after another reroute began) does not clear the new one.
 */
function modeFor(relationId: EntityID): ModuleMode {
  const moveHandle = (name: string, lon: number, lat: number) => {
    const handle = handleOf(name)
    if (handle) rerouteActions.moveVia(handle, { lon, lat })
  }
  return {
    id: MODE_ID,
    cursor: 'crosshair',
    handleLayers: [HANDLE_LAYER],
    onClick: (lon, lat) => rerouteActions.click({ lon, lat }),
    onDrag: moveHandle,
    onDragEnd: moveHandle,
    onExit: () => {
      if (readReroute().relationId === relationId) rerouteActions.stop()
    },
  }
}

/** The engine's current selection, read again when it changes (the engine is not a React value) */
function useSelection(engine: MaidEngine | undefined): readonly string[] {
  return useSyncExternalStore(engine?.subscribe ?? noSubscribe, () => engine?.selection ?? EMPTY)
}

export function RerouteOnMap({ editor, engine }: MapContentProps) {
  const { relationId, preview, graph } = useReroute(editor)
  const selection = useSelection(engine)

  // a reroute belongs to the relation that is selected: another selection ends it
  useEffect(() => {
    if (relationId !== undefined && !selection.includes(relationId)) rerouteActions.stop()
  }, [relationId, selection])

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
  if (relationId === undefined || shapes === undefined) return null
  return (
    <Source id={SOURCE} type="geojson" data={shapes}>
      {LAYERS.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </Source>
  )
}
