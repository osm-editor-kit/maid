import 'maplibre-gl/dist/maplibre-gl.css'
import { NOTES_LAYER_IDS } from '@osm-editor-kit/maid-module-notes'
import { streetImageryClick } from '@osm-editor-kit/maid-module-street-imagery'
import {
  buildLayers,
  dashPatterns,
  interactiveLayerIds,
  ModuleLayers,
  OsmLayers,
  type LayerOptions,
} from '@osm-editor-kit/maid-renderer'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import {
  Map,
  type MapEvent,
  type MapLayerMouseEvent,
  type MapTouchEvent,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import { exposeBenchApi } from '../bench'
import { drawClick } from '../drawing'
import { config, editor, engine, useEngine } from '../editor'
import { addPointWithFavourite, giveFavouriteTagsToNode } from '../favourites'
import { ensureImages } from '../images'
import { useSelection } from '../selection'
import { useCameraParam } from '../url/state'
import { MapContextMenu, type MenuPlace } from './MapContextMenu'

/** No basemap: the benchmark compares how editors draw OSM data, not imagery. */
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  glyphs: '/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#000' } }],
}

const FALLBACK_CAMERA = { zoom: 17, lat: 52.389, lng: 13.4 }

let lastTileCheck = 0
/** The vertex that is being dragged, if any. Not React state: it changes on every pointer event. */
let dragging: string | null = null
/** When a click last went to the drawing tool: the double click that follows is not for the map */
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
function keyMenuPlace(): MenuPlace | null {
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
  const [cameraParam, setCameraParam] = useCameraParam()
  const { ids: selectedIds, select } = useSelection()
  // Dash patterns are discovered as data arrives; the layers list them in their expressions.
  const [dashes, setDashes] = useState(() => new globalThis.Map(dashPatterns))
  const [cursor, setCursor] = useState('grab')
  const mode = useEngine((e) => e.mode)
  const [zoomGuard, setZoomGuard] = useState(false)
  const [menu, setMenu] = useState<MenuPlace | null>(null)

  // Start position: the `map` parameter, else iD's `#map=` hash, else a default.
  const [initialCamera] = useState(() => cameraParam ?? config.camera ?? FALLBACK_CAMERA)

  const options: LayerOptions = {
    fill: config.fill,
    labels: config.labels,
    icons: config.icons,
    pins: config.pins,
    lat: initialCamera.lat,
    dashes,
  }
  const interactive = interactiveLayerIds(buildLayers(options))
  const drawing = mode === 'draw-line' ? 'line' : mode === 'draw-area' ? 'area' : undefined

  const handleLoad = (event: MapEvent) => {
    const map = event.target
    engine.options.onStyleChange = () => setDashes(new globalThis.Map(dashPatterns))
    engine.options.prepare = (batch) => {
      const ids = new Set<string>()
      for (const f of batch.points)
        if (!f.properties?.addr) ids.add(`pin-${f.properties?.icon ?? 'none'}`)
      for (const f of batch.vertices) if (f.properties?.icon) ids.add(`icon-${f.properties.icon}`)
      return ensureImages(map, ids)
    }
    engine.attach(map)
    engine.setSelected(selectedIds)
    exposeBenchApi(map, engine, { select })
  }
  const handleMove = (_: ViewStateChangeEvent) => {
    // load while moving, but not on every frame
    const now = performance.now()
    if (now - lastTileCheck < 100) return
    lastTileCheck = now
    engine.loadVisibleTiles()
  }
  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    engine.loadVisibleTiles()
    const { zoom, latitude, longitude } = event.viewState
    // OSM zoom (256px tiles) is MapLibre zoom plus one
    void setCameraParam({ zoom: zoom + 1, lat: latitude, lng: longitude })
  }
  // --- pointer: the same for the mouse and for one finger ---

  const press = (event: { point: Point; preventDefault: () => void }) => {
    if (mode !== 'browse') return
    const id = engine.pick(event.point, interactive)
    if (!engine.isDraggable(id)) return
    event.preventDefault() // keeps MapLibre from panning the map with this drag
    dragging = id
    setCursor('grabbing')
  }
  /**
   * Only the primary button starts a drag. A right click, or Control and a click on a Mac, opens
   * the edit menu: a preventDefault on their press would stop MapLibre from sending the
   * contextmenu event, so the menu would not open on a point, a vertex or a node of a line.
   */
  const handleMouseDown = (event: MapLayerMouseEvent) => {
    if (event.originalEvent.button === 0 && !event.originalEvent.ctrlKey) press(event)
  }
  const release = () => {
    if (!dragging) return
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
    engine.pointer = { point: event.point, lon: lng, lat, layers: interactive }
    if (dragging) {
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
    movePointer(event)
    if (dragging || mode !== 'browse') return
    const id = engine.pick(event.point, interactive)
    engine.setHover(id)
    setCursor(id ? 'pointer' : 'grab')
  }
  /**
   * A right click, or a long press on a touch screen, opens the edit menu, as in iD: on a
   * feature that is not selected it selects that feature first, and a feature in the
   * selection keeps the selection. On open ground nothing is selected or cleared: the menu
   * only has "Paste", and without anything to paste there is no menu. Not while drawing or
   * moving. The pick is the one of a click: same layers, same tolerance.
   */
  const openMenu = (point: Point, lngLat: { lng: number; lat: number }, screen: Point) => {
    if (mode !== 'browse') return
    const id = engine.pick(point, interactive)
    if (id && !selectedIds.includes(id)) select(id)
    setMenu({ x: screen.x, y: screen.y, lon: lngLat.lng, lat: lngLat.lat, ground: !id })
  }
  // The menu key (iD's "ContextMenu" key) opens the menu for the selection. A window listener,
  // as the editor's other keys are; the menu's state lives here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' || isTyping(event.target)) return
      event.preventDefault() // not the browser's own menu
      if (engine.mode === 'browse') setMenu(keyMenuPlace())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const handleContextMenu = (event: MapLayerMouseEvent) => {
    event.originalEvent.preventDefault() // not the browser's own menu
    clearTimeout(longPress)
    openMenu(event.point, event.lngLat, {
      x: event.originalEvent.clientX,
      y: event.originalEvent.clientY,
    })
  }
  // one finger drags a node; two fingers are the map's (pinch, pan)
  const handleTouchStart = (event: MapTouchEvent) => {
    clearTimeout(longPress)
    if (event.points.length !== 1) return
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
    if (mode === 'add-point') {
      // on a vertex or a point that is there, the click selects it: no second node at the same place
      // on a line, the new node is a vertex of that way (as iD does); anywhere else a point is added
      const on = engine.snapAt(event.point, interactive, new Set())
      if (on?.type === 'node') {
        // a favourite that started this mode tags the node that is there
        giveFavouriteTagsToNode(on.id)
        engine.setMode('browse')
        select(on.id)
        return
      }
      if (on?.type === 'way') {
        const id = engine.addNodeOn(on)
        giveFavouriteTagsToNode(id)
        engine.setMode('browse')
        select(id)
        return
      }
      // the new point is selected, so the sidebar asks what it is
      // a favourite that started this mode gives the point its tags
      const id = addPointWithFavourite(event.lngLat.lng, event.lngLat.lat)
      engine.setMode('browse')
      select(id)
      return
    }
    if (drawing) {
      guardZoom()
      void drawClick(select, drawing, event.point, interactive).then(
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
    // a photo or a note under the pointer takes the click: it opens, and no feature is selected
    if (streetImageryClick(event)) return
    const noteLayers = NOTES_LAYER_IDS.filter((layer) => event.target.getLayer(layer))
    if (
      noteLayers.length > 0 &&
      event.target.queryRenderedFeatures(event.point, { layers: noteLayers }).length > 0
    )
      return
    const id = engine.pick(event.point, interactive)
    // Shift adds a feature to the selection or takes it out, as in iD
    if (event.originalEvent.shiftKey && id) {
      select(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id])
      return
    }
    select(id)
  }
  const handleDblClick = (event: MapLayerMouseEvent) => {
    if (mode !== 'browse' || performance.now() - lastDrawClick < 500) {
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
      }}
      mapStyle={EMPTY_STYLE}
      maxZoom={23}
      fadeDuration={config.fade}
      attributionControl={false}
      dragRotate={false}
      cursor={mode === 'browse' ? cursor : 'crosshair'}
      // Shift-drag is not MapLibre's box zoom here: Shift-click selects several features
      boxZoom={false}
      doubleClickZoom={mode === 'browse' && !zoomGuard}
      onLoad={handleLoad}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
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
      {menu && <MapContextMenu place={menu} onClose={() => setMenu(null)} />}
    </Map>
  )
}
