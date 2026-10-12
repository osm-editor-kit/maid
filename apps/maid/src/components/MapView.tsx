import 'maplibre-gl/dist/maplibre-gl.css'
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
import { useState } from 'react'
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
import { addBaseImages, ensureImages } from '../images'
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
    addBaseImages(map)
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
  const release = () => {
    if (!dragging) return
    dragging = null
    setCursor('grab')
    void engine.endDrag()
  }
  const movePointer = (event: { point: Point; lngLat: { lng: number; lat: number } }) => {
    const { lng, lat } = event.lngLat
    // keys that act where the pointer is (paste, Space while drawing) read this
    engine.pointer = { point: event.point, lon: lng, lat, layers: interactive }
    if (dragging) engine.dragTo(dragging, lng, lat)
    else if (drawing) engine.draw.move(event.point, interactive)
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
   * feature that is not selected it selects that feature first; on open ground the menu only
   * has "Paste". Not while drawing or moving.
   */
  const openMenu = (point: Point, lngLat: { lng: number; lat: number }, screen: Point) => {
    if (mode !== 'browse') return
    const id = engine.pick(point, interactive)
    if (id && !selectedIds.includes(id)) select(id)
    else if (!id) select(null)
    setMenu({ x: screen.x, y: screen.y, lon: lngLat.lng, lat: lngLat.lat })
  }
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
      // the new point is selected, so the sidebar asks what it is
      const id = engine.addPoint(event.lngLat.lng, event.lngLat.lat)
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
      onMouseDown={press}
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
