import 'maplibre-gl/dist/maplibre-gl.css'
import { NOTES_LAYER_IDS } from '@osm-editor-kit/maid-module-notes'
import { streetImageryClick } from '@osm-editor-kit/maid-module-street-imagery'
import {
  buildLayers,
  dashPatterns,
  interactiveLayerIds,
  ModuleLayers,
  OsmLayers,
  type MaidEngine,
  type LayerOptions,
} from '@osm-editor-kit/maid-renderer'
import { useBearing, useSettings } from '@osm-editor-kit/maid-ui'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import {
  Map,
  type MapEvent,
  type MapLayerMouseEvent,
  type MapTouchEvent,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import { exposeBenchApi } from '../bench'
import { drawClick } from '../drawing'
import { addPointWithFavourite, giveFavouriteTagsToNode } from '../favourites'
import { backgroundSourceOnMap } from '../imagery-used'
import { installMarkerImages } from '../images'
import { preloadAfterFirstSettle } from '../lazy-chunks'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { dropStack, setStack } from '../stack'
import { normaliseBearing } from '../url/bearing'
import { useCameraParam } from '../url/state'
import { moveSource, shouldStoreMove, startCamera } from '../url/view'
import { FavouriteHint } from './FavouriteHint'
import { MapContextMenu, type MenuPlace } from './MapContextMenu'
import { MeasureLoupe } from './MeasureLoupe'
import { StackPicker } from './StackPicker'

/** No basemap: the benchmark compares how editors draw OSM data, not imagery. */
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  glyphs: '/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000' } }],
}

const FALLBACK_CAMERA = { zoom: 17, lat: 52.389, lng: 13.4 }
/** The last position is stored once the map has rested this long, not on every move (ms) */
const LAST_VIEW_DELAY = 1000

let lastTileCheck = 0
/** The vertex that is being dragged, if any. Not React state: it changes on every pointer event. */
let dragging: string | null = null
/** When a click last went to the drawing tool or to a measure: the double click that follows is not for the map */
let lastDrawClick = 0
let zoomGuardTimer: ReturnType<typeof setTimeout> | undefined
/** The timer of a long press and where the finger went down */
let longPress: ReturnType<typeof setTimeout> | undefined
let pressedAt: { x: number; y: number } | undefined

type Point = { x: number; y: number }

/** A keyboard in a text field keeps its own keys, as the editor's shortcuts do */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

/**
 * Where the menu key opens the edit menu: the middle of the selection on screen, as iD opens it
 * at the pointer, which a key does not have. With nothing selected, the middle of the map.
 */
/**
 * The engine is made outside React and these are its settable fields. They are set here, in functions
 * of their own, because the engine comes from a hook now and the React Compiler does not accept a
 * write to a value a hook returned inside a component.
 */
function setEngineHooks(
  engine: MaidEngine,
  hooks: Pick<MaidEngine['options'], 'onStyleChange' | 'prepare'>,
) {
  engine.options.onStyleChange = hooks.onStyleChange
  engine.options.prepare = hooks.prepare
}
function setEnginePointer(engine: MaidEngine, pointer: MaidEngine['pointer']) {
  engine.pointer = pointer
}

function keyMenuPlace(engine: MaidEngine) {
  const map = engine.map
  if (!map) return null
  const locs: [number, number][] = []
  for (const id of engine.selection) {
    if (id.startsWith('n')) {
      const loc = engine.data.node(id)?.loc
      if (loc) locs.push(loc)
    } else if (id.startsWith('w')) {
      for (const n of new Set<string>(engine.data.way(id)?.nodes ?? [])) {
        const loc = engine.data.node(n)?.loc
        if (loc) locs.push(loc)
      }
    }
  }
  const centre = map.getCenter()
  const [lon, lat] = locs.length
    ? [
        locs.reduce((sum, l) => sum + l[0], 0) / locs.length,
        locs.reduce((sum, l) => sum + l[1], 0) / locs.length,
      ]
    : [centre.lng, centre.lat]
  const point = map.project([lon, lat])
  const box = map.getCanvas().getBoundingClientRect()
  return {
    x: box.left + point.x,
    y: box.top + point.y,
    lon,
    lat,
    ground: engine.selection.length === 0,
  }
}

export function MapView() {
  const shell = useShell()
  const { config, editor, engine } = shell
  const [cameraParam, setCameraParam] = useCameraParam()
  const { ids: selectedIds, select } = useSelection()
  // Dash patterns are discovered as data arrives; the layers list them in their expressions.
  const [dashes, setDashes] = useState(() => new globalThis.Map(dashPatterns))
  const [cursor, setCursor] = useState('grab')
  const mode = useEngine((e) => e.mode)
  const measuring = useEngine((e) => e.measuring)
  const selectionOnly = useEngine((e) => e.selectionOnly)
  const [zoomGuard, setZoomGuard] = useState(false)
  const [menu, setMenu] = useState<MenuPlace | null>(null)
  // the magnifier of a measure is drawn with the background: none without one (MeasureLoupe). `?loupe=blank`
  // draws it with an empty style, for the browser check, which has no imagery (the imagery module is off there)
  const [blankLoupe] = useState(
    () => new URLSearchParams(window.location.search).get('loupe') === 'blank',
  )
  const background = measuring ? backgroundSourceOnMap(editor) : undefined
  // a stack's pill is for a plain click in browse mode: a draw, a move, a rotation or a measure ends it
  useEffect(() => {
    if (mode !== 'browse' || measuring) dropStack()
  }, [mode, measuring])

  // what the last position needs to know about the moves of the map (view.ts)
  const loaded = useRef(false)
  const resized = useRef(false)
  const storeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Start position: the `map` parameter (or iD's `#map=` hash), else the last position, else a default.
  const [initialCamera] = useState(() =>
    startCamera({
      url: cameraParam ?? config.camera,
      stored: useSettings.getState().lastView,
      fallback: FALLBACK_CAMERA,
    }),
  )

  const options: LayerOptions = {
    fill: config.fill,
    labels: config.labels,
    icons: config.icons,
    pins: config.pins,
    lat: initialCamera.lat,
    dashes,
    selectionOnly,
    selectTwins: useEngine((e) => e.selectTwins),
  }
  const interactive = interactiveLayerIds(buildLayers(options))
  const drawing = mode === 'draw-line' ? 'line' : mode === 'draw-area' ? 'area' : undefined

  const handleLoad = (event: MapEvent) => {
    const map = event.target
    loaded.current = true
    useBearing.setState({ bearing: map.getBearing() })
    // Marker images are made when MapLibre asks for them, while it lays out a tile (see images.ts): no `prepare`
    installMarkerImages(map)
    setEngineHooks(engine, {
      onStyleChange: () => setDashes(new globalThis.Map(dashPatterns)),
    })
    engine.attach(map)
    engine.setSelected(selectedIds)
    exposeBenchApi(shell, map, { select })
    // the chunks for the inspector, the panels and the dock: after the first view is drawn, in idle time
    void preloadAfterFirstSettle(engine)
  }
  const handleMove = (_: ViewStateChangeEvent) => {
    // load while moving, but not on every frame
    const now = performance.now()
    if (now - lastTileCheck < 100) return
    lastTileCheck = now
    engine.loadVisibleTiles()
  }
  // the compass shows while the map is turned, and its needle turns with the map
  const handleRotate = (event: ViewStateChangeEvent) => {
    useBearing.setState({ bearing: event.viewState.bearing })
  }
  const handleResize = () => {
    resized.current = true
  }
  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    engine.loadVisibleTiles()
    const { zoom, latitude, longitude, bearing } = event.viewState
    const turn = normaliseBearing(bearing)
    // OSM zoom (256px tiles) is MapLibre zoom plus one; the turn is in the URL when it is not zero
    void setCameraParam({ zoom: zoom + 1, lat: latitude, lng: longitude, bearing: turn })
    // the last position: the person's moves, stored once the map rests (view.ts). Storage keeps OSM zoom.
    const source = moveSource({
      loaded: loaded.current,
      gesture: event.originalEvent !== undefined,
      resized: resized.current,
    })
    resized.current = false
    if (!shouldStoreMove(source)) return
    clearTimeout(storeTimer.current)
    storeTimer.current = setTimeout(
      () =>
        useSettings.getState().setLastView({
          lng: longitude,
          lat: latitude,
          zoom: zoom + 1,
          bearing: turn,
        }),
      LAST_VIEW_DELAY,
    )
  }
  // --- pointer: the same for the mouse and for one finger ---

  const press = (event: { point: Point; preventDefault: () => void }) => {
    if (mode !== 'browse' || engine.measuring) return
    // a midpoint handle of the selected way: the press starts a handle drag, which adds a node on first move
    if (engine.pressMidpoint(event.point)) {
      event.preventDefault()
      setStack(null)
      setCursor('grabbing')
      return
    }
    const id = engine.pick(event.point, interactive)
    if (!engine.isDraggable(id)) return
    event.preventDefault() // keeps MapLibre from panning the map with this drag
    dragging = id
    // the pill is for the place of a click: a dragged node leaves it behind
    setStack(null)
    setCursor('grabbing')
  }
  /**
   * Alt or Control with a press on open map turns the map, as in Rapid. The press is taken, so that
   * MapLibre does not pan with the drag. On a Mac Control is also the right click: its press turns
   * the map, and the edit menu does not open for it (handleContextMenu). A press on a feature is
   * left to press(): Alt drags a node free there, and Control opens the menu.
   */
  const startTurnOnOpenMap = (event: MapLayerMouseEvent) => {
    const { altKey, ctrlKey } = event.originalEvent
    if (!altKey && !ctrlKey) return false
    if (mode !== 'browse' || engine.measuring) return false
    if (engine.pick(event.point, interactive) || engine.midpointAt(event.point)) return false
    event.preventDefault()
    engine.startTurn(event.point)
    setCursor('grabbing')
    return true
  }
  /**
   * Only the primary button starts a drag. A right click, or Control and a click on a Mac, opens
   * the edit menu: a preventDefault on their press would stop MapLibre from sending the
   * contextmenu event, so the menu would not open on a point, a vertex or a node of a line.
   */
  const handleMouseDown = (event: MapLayerMouseEvent) => {
    if (event.originalEvent.button !== 0) return
    if (startTurnOnOpenMap(event)) return
    if (!event.originalEvent.ctrlKey) press(event)
  }
  const release = () => {
    if (engine.turning) {
      engine.endTurn()
      setCursor('grab')
      return
    }
    if (!dragging && !engine.pressingHandle) return
    dragging = null
    setCursor('grab')
    // a connection leaves the node that survives selected, as iD does
    void engine.endDrag().then((result) => {
      if (result.selected) select(result.selected)
    })
  }
  const movePointer = (event: {
    point: Point
    lngLat: { lng: number; lat: number }
    originalEvent: MouseEvent | TouchEvent
  }) => {
    const { lng, lat } = event.lngLat
    // keys that act where the pointer is (paste, Space while drawing) read this
    setEnginePointer(engine, { point: event.point, lon: lng, lat, layers: interactive })
    // a turn with the mouse takes the pointer's moves, and nothing else
    if (engine.turning) {
      engine.moveTurn(event.point)
      return
    }
    // a measure follows the pointer and takes nothing else
    if (engine.measuring) {
      engine.measureMove(lng, lat, 'touches' in event.originalEvent)
      return
    }
    if (engine.pressingHandle) {
      // the pressed handle becomes a node once the pointer has moved, and that node is dragged on
      engine.moveHandle(event.point, lng, lat, {
        point: event.point,
        layers: interactive,
        free: event.originalEvent.altKey,
      })
      setCursor(engine.dragRefusal ? 'not-allowed' : 'grabbing')
    } else if (dragging) {
      // the dragged node snaps to what is under the pointer, unless Alt is held
      engine.dragTo(dragging, lng, lat, {
        point: event.point,
        layers: interactive,
        free: event.originalEvent.altKey,
      })
      setCursor(engine.dragRefusal ? 'not-allowed' : 'grabbing')
    } else if (drawing) engine.draw.move(event.point, interactive)
    else if (mode === 'move' || mode === 'rotate') engine.transform.move(lng, lat)
  }
  const handleMouseMove = (event: MapLayerMouseEvent) => {
    // a handle press whose release was not seen on the map (the button went up off it) ends here: no node is made by a hover
    // a turn whose release was not seen on the map ends here too
    if ((engine.pressingHandle || engine.turning) && event.originalEvent.buttons === 0) release()
    movePointer(event)
    if (
      dragging ||
      engine.pressingHandle ||
      engine.turning ||
      mode !== 'browse' ||
      engine.measuring
    )
      return
    const id = engine.pick(event.point, interactive)
    engine.setHover(id)
    setCursor(engine.midpointAt(event.point) ? 'cell' : id ? 'pointer' : 'grab')
  }
  /**
   * A right click, or a long press on a touch screen, opens the edit menu, as in iD: on a
   * feature that is not selected it selects that feature first, and a feature in the
   * selection keeps the selection. On open ground nothing is selected or cleared: the menu
   * only has "Paste", and without anything to paste there is no menu. Not while drawing or
   * moving. The pick is the one of a click: same layers, same tolerance.
   */
  const openMenu = (point: Point, lngLat: { lng: number; lat: number }, screen: Point) => {
    if (mode !== 'browse' || engine.measuring) return
    const ids = engine.pickAll(point, interactive)
    const id = ids[0] ?? null
    if (id && !selectedIds.includes(id)) select(id)
    if (ids.length > 1) setStack({ lon: lngLat.lng, lat: lngLat.lat, ids })
    else setStack(null)
    setMenu({
      x: screen.x,
      y: screen.y,
      lon: lngLat.lng,
      lat: lngLat.lat,
      ground: !id,
      features: ids.length > 1 ? ids : undefined,
    })
  }
  // The menu key (iD's "ContextMenu" key) opens the menu for the selection. A window listener,
  // as the editor's other keys are; the menu's state lives here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' || isTyping(event.target)) return
      event.preventDefault() // not the browser's own menu
      if (engine.mode === 'browse') setMenu(keyMenuPlace(engine))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine.mode, engine])
  // Escape cancels a measure. It is taken in the capture phase on the window, so the editor's own
  // Escape (useShortcuts: it clears the selection) does not see it. The selection stays.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !engine.measuring) return
      event.preventDefault()
      event.stopPropagation()
      engine.cancelMeasure()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine.measuring, engine])
  const handleContextMenu = (event: MapLayerMouseEvent) => {
    event.originalEvent.preventDefault() // not the browser's own menu
    clearTimeout(longPress)
    // the Control press that turns the map on a Mac fires this event too: that press is a turn, not a menu
    if (engine.turning) return
    openMenu(event.point, event.lngLat, {
      x: event.originalEvent.clientX,
      y: event.originalEvent.clientY,
    })
  }
  // one finger drags a node; two fingers are the map's (pinch, pan)
  const handleTouchStart = (event: MapTouchEvent) => {
    clearTimeout(longPress)
    if (event.points.length !== 1 || engine.measuring) return
    press(event)
    // iOS sends no contextmenu event for a long press, so it is timed here (iD: 500 ms)
    const touch = event.originalEvent.touches[0]
    const { point, lngLat } = event
    if (touch) {
      const screen = { x: touch.clientX, y: touch.clientY }
      pressedAt = point
      longPress = setTimeout(() => {
        release()
        openMenu(point, lngLat, screen)
      }, 500)
    }
  }
  const handleTouchMove = (event: MapTouchEvent) => {
    // a finger that moves is dragging or panning, not pressing
    if (pressedAt && Math.hypot(event.point.x - pressedAt.x, event.point.y - pressedAt.y) > 5)
      clearTimeout(longPress)
    if (event.points.length === 1) movePointer(event)
  }
  const handleTouchEnd = () => {
    clearTimeout(longPress)
    release()
  }

  /** The double click that ends a drawing must not zoom the map afterwards */
  const guardZoom = () => {
    lastDrawClick = performance.now()
    setZoomGuard(true)
    // one timer: the guard ends 500 ms after the last click, not after the first
    clearTimeout(zoomGuardTimer)
    zoomGuardTimer = setTimeout(() => setZoomGuard(false), 500)
  }
  const handleClick = (event: MapLayerMouseEvent) => {
    // the click that MapLibre sends after a turn that moved is not a click: the selection stays
    if (performance.now() - engine.turnedAt < 300) return
    if (engine.measuring) {
      // the first click sets the start of the measure, the second ends it: nothing is selected
      guardZoom()
      engine.measureClick(event.lngLat.lng, event.lngLat.lat)
      return
    }
    if (mode === 'add-point') {
      // on a vertex or a point that is there, the click selects it: no second node at the same place
      // on a line, the new node is a vertex of that way (as iD does); anywhere else a point is added
      const on = engine.snapAt(event.point, interactive, new Set())
      if (on?.type === 'node') {
        // a favourite that started this mode tags the node that is there
        giveFavouriteTagsToNode({ editor, engine }, on.id)
        engine.setMode('browse')
        select(on.id)
        return
      }
      if (on?.type === 'way') {
        const id = engine.addNodeOn(on)
        giveFavouriteTagsToNode({ editor, engine }, id)
        engine.setMode('browse')
        select(id)
        return
      }
      // the new point is selected, so the sidebar asks what it is
      // a favourite that started this mode gives the point its tags
      const id = addPointWithFavourite({ engine }, event.lngLat.lng, event.lngLat.lat)
      engine.setMode('browse')
      select(id)
      return
    }
    if (drawing) {
      guardZoom()
      void drawClick(engine, select, drawing, event.point, interactive).then(
        (finished) => finished && guardZoom(),
      )
      return
    }
    if (mode === 'move' || mode === 'rotate') {
      // the click puts the selection down where it is now
      engine.transform.move(event.lngLat.lng, event.lngLat.lat)
      engine.setMode('browse')
      return
    }
    // a midpoint handle: a press on it that did not move added nothing, and the click changes nothing
    if (engine.midpointAt(event.point)) return
    // a photo or a note under the pointer takes the click: it opens, and no feature is selected
    if (streetImageryClick(event)) return
    const noteLayers = NOTES_LAYER_IDS.filter((layer) => event.target.getLayer(layer))
    if (
      noteLayers.length > 0 &&
      event.target.queryRenderedFeatures(event.point, { layers: noteLayers }).length > 0
    )
      return
    // all the features at the place: the first is what a click selects, as `pick` gives it
    const ids = engine.pickAll(event.point, interactive)
    const id = ids[0] ?? null
    // Shift adds a feature to the selection or takes it out, as in iD. Shift on open ground keeps the
    // selection (iD's behaviour/select.js: targeting nothing changes nothing with Shift); a plain click clears it.
    if (event.originalEvent.shiftKey) {
      if (id)
        select(
          selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
        )
      return
    }
    select(id)
    // several features here: the pill and the keys reach the others (stack.ts)
    setStack(ids.length > 1 ? { lon: event.lngLat.lng, lat: event.lngLat.lat, ids } : null)
  }
  const handleDblClick = (event: MapLayerMouseEvent) => {
    if (mode !== 'browse' || engine.measuring || performance.now() - lastDrawClick < 500) {
      event.preventDefault()
      return
    }
    // on the line of a way a double click adds a node there, as in iD; elsewhere it zooms
    const node = engine.insertNode(event.point, interactive)
    if (!node) return
    event.preventDefault()
    select(node)
  }

  return (
    <Map
      id="mainMap"
      mapLib={maplibregl}
      initialViewState={{
        longitude: initialCamera.lng,
        latitude: initialCamera.lat,
        zoom: initialCamera.zoom - 1,
        bearing: initialCamera.bearing ?? 0,
      }}
      mapStyle={EMPTY_STYLE}
      // OSM zoom 2, the world view: iD and Rapid stop there too (docs/research/zoom-study.md, D4)
      minZoom={1}
      maxZoom={23}
      fadeDuration={config.fade}
      attributionControl={false}
      // the turn is by the mouse (startTurnOnOpenMap), by two fingers and by N and Shift+arrows (useShortcuts)
      dragRotate={false}
      // no tilt, from any gesture or key: the maximum is flat
      maxPitch={0}
      pitchWithRotate={false}
      touchPitch={false}
      // the keys are the editor's (useShortcuts): MapLibre's would turn by 15 degrees, and tilt
      keyboard={false}
      cursor={mode === 'browse' && !measuring ? cursor : 'crosshair'}
      // Shift-drag is not MapLibre's box zoom here: Shift-click selects several features
      boxZoom={false}
      doubleClickZoom={mode === 'browse' && !measuring && !zoomGuard}
      onLoad={handleLoad}
      // the pill's place is the place of the click: a pan or a zoom ends the stack
      onMoveStart={dropStack}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onRotate={handleRotate}
      onResize={handleResize}
      onMouseDown={handleMouseDown}
      onMouseUp={release}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDblClick={handleDblClick}
    >
      <OsmLayers
        options={options}
        sourceOptions={{ tolerance: config.tolerance, maxzoom: config.sourceMaxZoom }}
      />
      <ModuleLayers editor={editor} />
      {/* with a menu open its marker is the count: the pill is not shown twice */}
      {!menu && <StackPicker />}
      <FavouriteHint />
      {measuring && (
        <div
          role="status"
          className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10"
        >
          Click two points to measure. Escape cancels.
        </div>
      )}
      {measuring && engine.map && (blankLoupe || background) && (
        <MeasureLoupe
          map={engine.map}
          source={background?.source}
          brightness={background?.brightness ?? 1}
        />
      )}
      {menu && <MapContextMenu place={menu} onClose={() => setMenu(null)} />}
    </Map>
  )
}
