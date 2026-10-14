// The React side: the map built with react-map-gl/maplibre the way the react-map-gl skill prescribes
// (MapProvider, <Map> with event props, flat <Source> and <Layer> siblings, uncontrolled camera by default).
import * as maplibregl from 'maplibre-gl'
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Layer, Map as ReactMap, MapProvider, Source } from 'react-map-gl/maplibre'
import {
  EMPTY,
  HOVER_FILTER_LAYER,
  HOVER_SOURCE,
  overrideOf,
  SOURCE_OPTIONS,
  STYLE_A,
  whenReady,
  ZOOM,
} from './shared.js'

// One store for everything the benchmark changes. A change from outside React goes through
// `flushSync`, so the render it causes finishes inside the call and its time is measured around the call.
let state = {}
const listeners = new Set()
const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

const subscribe = (listener) => store.subscribe(listener)
const getState = () => store.get()

/** What the map's event props call. Module level, so the handlers are the same functions on every render. */
const hooks = { load: undefined, mouse: 0, features: 0 }
const handleLoad = (event) => hooks.load?.(event.target)
const handleMove = (event) => store.set({ viewState: event.viewState })
const handleMouseMove = (event) => {
  hooks.mouse++
  hooks.features += event.features?.length ?? 0
}

function layersOf(config, override, hoverId) {
  return config.layers.map((layer) => {
    if (override && layer.id === config.target.id) return { ...layer, ...override }
    if (layer.id === HOVER_FILTER_LAYER) return { ...layer, filter: ['==', ['get', 'id'], hoverId] }
    return layer
  })
}

function dataOf(source, config, lineData, hoverData) {
  if (source.id === config.linesId && lineData) return lineData
  if (source.id === HOVER_SOURCE) return hoverData
  return source.data
}

/** As an app built with the React Compiler has it: a render of the parent that changes nothing reaches no <Layer> */
function LayersMemo({ config, override, lineData, hoverId, hoverData }) {
  const layers = layersOf(config, override, hoverId)
  return (
    <>
      {config.sources.map((source) => (
        <Source
          key={source.id}
          id={source.id}
          type="geojson"
          data={dataOf(source, config, lineData, hoverData)}
          {...SOURCE_OPTIONS}
        />
      ))}
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}

/** As an app without the compiler has it: every <Layer> renders again, with the same paint, layout and filter objects */
function LayersRerender({ config, override, lineData, hoverId, hoverData }) {
  'use no memo'
  const layers = layersOf(config, override, hoverId)
  return (
    <>
      {config.sources.map((source) => (
        <Source
          key={source.id}
          id={source.id}
          type="geojson"
          data={dataOf(source, config, lineData, hoverData)}
          {...SOURCE_OPTIONS}
        />
      ))}
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}

/** Two deep copies of the layer list per config, made once: a render gets new objects without paying for the copy */
const copies = new WeakMap()
function copiesOf(config) {
  if (!copies.has(config))
    copies.set(config, [structuredClone(config.layers), structuredClone(config.layers)])
  return copies.get(config)
}

/**
 * The worst case: every render gets a new layer list (new paint, layout and filter objects with the
 * same content), as a layer builder called in render does when one of its inputs changes.
 */
function LayersClone({ config, override, lineData, hoverId, hoverData, tick }) {
  'use no memo'
  const layers =
    override || hoverId
      ? structuredClone(layersOf(config, override, hoverId))
      : copiesOf(config)[tick % 2]
  return (
    <>
      {config.sources.map((source) => (
        <Source
          key={source.id}
          id={source.id}
          type="geojson"
          data={dataOf(source, config, lineData, hoverData)}
          {...SOURCE_OPTIONS}
        />
      ))}
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer} />
      ))}
    </>
  )
}

const LAYERS = { memo: LayersMemo, rerender: LayersRerender, clone: LayersClone }

function cameraProps(s) {
  // the documented controlled form: the view state spread into the props
  if (s.camera === 'controlled') return { ...s.viewState, onMove: handleMove }
  return { initialViewState: s.initial }
}

function BenchMap({ s }) {
  const Layers = LAYERS[s.layerMode]
  return (
    <ReactMap
      id="mainMap"
      mapLib={maplibregl}
      mapStyle={s.mapStyle}
      fadeDuration={0}
      attributionControl={false}
      interactiveLayerIds={s.mouse === 'interactive' ? s.config.interactiveIds : undefined}
      onMouseMove={s.mouse === 'none' ? undefined : handleMouseMove}
      onLoad={handleLoad}
      {...cameraProps(s)}
    >
      <Layers
        config={s.config}
        override={s.override}
        lineData={s.lineData}
        hoverId={s.hoverId}
        hoverData={s.hoverData}
        tick={s.tick}
        // 'memo': the component runs again on a tick, and the compiler's cache keeps its elements.
        // The other two take the whole state and render on every change, camera frames included.
        stamp={s.layerMode === 'memo' ? s.tick : s}
      />
    </ReactMap>
  )
}

function App() {
  const s = useSyncExternalStore(subscribe, getState)
  return (
    <MapProvider>
      <BenchMap s={s} />
    </MapProvider>
  )
}

/** Mounts the map and resolves once every layer is there and the map is idle */
export async function mountReact(container, config, options) {
  const view = { longitude: config.center[0], latitude: config.center[1], zoom: ZOOM }
  state = {
    config,
    layerMode: options.layerMode ?? 'memo',
    camera: options.camera ?? 'uncontrolled',
    mouse: options.mouse ?? 'none',
    mapStyle: STYLE_A,
    initial: view,
    viewState: view,
    tick: 0,
    override: null,
    lineData: null,
    hoverId: '',
    hoverData: EMPTY,
  }
  hooks.mouse = 0
  hooks.features = 0
  const created = new Promise((resolve) => {
    hooks.load = resolve
  })
  const root = createRoot(container)
  root.render(<App />)
  // `load` can come before the layers: react-map-gl adds them after the style has loaded
  const map = await created
  hooks.load = undefined
  if (map.getLayersOrder().length < config.layers.length + 1 || !map.loaded())
    await whenReady(map, config.layers.length)
  const sync = (patch) => flushSync(() => store.set(patch))
  return {
    map,
    destroy: () => root.unmount(),
    rerender: () => sync({ tick: state.tick + 1 }),
    setOverride: (kind, i) => sync({ override: overrideOf(config.target, kind, i) }),
    setLines: (collection) => sync({ lineData: collection }),
    hoverFilter: (id) => sync({ hoverId: id }),
    hoverData: (feature) => sync({ hoverData: { type: 'FeatureCollection', features: [feature] } }),
    swapStyle: (style) => sync({ mapStyle: style }),
    mouse: () => ({ events: hooks.mouse, features: hooks.features }),
  }
}
