import 'maplibre-gl/dist/maplibre-gl.css'
import {
  buildLayers,
  dashPatterns,
  interactiveLayerIds,
  OsmLayers,
  type LayerOptions,
} from '@maid/renderer'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { useState } from 'react'
import {
  Map,
  type MapEvent,
  type MapLayerMouseEvent,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre'
import { exposeBenchApi } from '../bench'
import { config, engine } from '../editor'
import { addBaseImages, ensureImages } from '../images'
import { useCameraParam, useSelectedId } from '../url'

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

export function MapView() {
  const [cameraParam, setCameraParam] = useCameraParam()
  const [selectedId, setSelectedId] = useSelectedId()
  // Dash patterns are discovered as data arrives; the layers list them in their expressions.
  const [dashes, setDashes] = useState(() => new globalThis.Map(dashPatterns))
  const [cursor, setCursor] = useState('grab')

  // Start position: the `map` parameter, else iD's `#map=` hash, else a default.
  const [initialCamera] = useState(() => cameraParam ?? config.camera ?? FALLBACK_CAMERA)

  const options: LayerOptions = {
    fill: config.fill,
    highlight: config.highlight,
    labels: config.labels,
    icons: config.icons,
    pins: config.pins,
    editLayers: config.edit === 'split',
    lat: initialCamera.lat,
    dashes,
  }
  const interactive = interactiveLayerIds(buildLayers(options))

  const select = (id: string | null) => {
    engine.setSelected(id)
    void setSelectedId(id)
  }

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
    engine.setSelected(selectedId)
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
  const handleMouseDown = (event: MapLayerMouseEvent) => {
    const id = engine.pick(event.point, interactive)
    if (!engine.isVertex(id)) return
    event.preventDefault() // keeps MapLibre from panning the map with this drag
    dragging = id
    setCursor('grabbing')
  }
  const handleMouseUp = () => {
    if (!dragging) return
    dragging = null
    setCursor('grab')
    void engine.endDrag()
  }
  const handleMouseMove = (event: MapLayerMouseEvent) => {
    if (dragging) {
      engine.dragTo(dragging, event.lngLat.lng, event.lngLat.lat)
      return
    }
    const id = engine.pick(event.point, interactive)
    engine.setHover(id)
    setCursor(id ? 'pointer' : 'grab')
  }
  const handleClick = (event: MapLayerMouseEvent) => select(engine.pick(event.point, interactive))

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
      cursor={cursor}
      onLoad={handleLoad}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      <OsmLayers
        options={options}
        sourceOptions={{ tolerance: config.tolerance, maxzoom: config.sourceMaxZoom }}
      />
    </Map>
  )
}
