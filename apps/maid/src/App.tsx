import 'maplibre-gl/dist/maplibre-gl.css'
import { dashPatterns, buildLayers, interactiveLayerIds, MaidEngine, OsmLayers, type LayerOptions } from '@maid/renderer'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { useState } from 'react'
import { Map, MapProvider, type MapLayerMouseEvent, type MapEvent, type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import { exposeBenchApi } from './bench'
import { readConfig } from './config'
import { addBaseImages, resolvePresetIcons } from './images'

const config = readConfig(window.location)

/** No basemap: the benchmark compares how editors draw OSM data, not imagery. */
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  glyphs: '/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1b1b1b' } }],
}

const engine = new MaidEngine({
  apiUrl: config.apiUrl,
  minDataZoom: config.minDataZoom,
  update: config.update,
  highlight: config.highlight,
  serialUpdates: config.serialUpdates,
})

let lastTileCheck = 0

export function App() {
  // Dash patterns are discovered as data arrives; the layers list them in their expressions.
  const [dashes, setDashes] = useState(() => new globalThis.Map(dashPatterns))
  engine.options.onStyleChange = () => setDashes(new globalThis.Map(dashPatterns))

  const [cursor, setCursor] = useState('grab')
  const camera = config.camera ?? { zoom: 17, lat: 52.389, lng: 13.4 }
  const options: LayerOptions = {
    fill: config.fill,
    highlight: config.highlight,
    labels: config.labels,
    icons: config.icons,
    lat: camera.lat,
    dashes,
  }
  const interactive = interactiveLayerIds(buildLayers(options))

  const handleLoad = (event: MapEvent) => {
    addBaseImages(event.target)
    resolvePresetIcons(event.target)
    engine.attach(event.target)
    exposeBenchApi(event.target, engine)
  }
  const handleMove = (_: ViewStateChangeEvent) => {
    // load while moving, but not on every frame
    const now = performance.now()
    if (now - lastTileCheck < 100) return
    lastTileCheck = now
    engine.loadVisibleTiles()
  }
  const handleMouseMove = (event: MapLayerMouseEvent) => {
    const id = engine.pick(event.point, interactive)
    engine.setHover(id)
    setCursor(id ? 'pointer' : 'grab')
  }
  const handleClick = (event: MapLayerMouseEvent) => {
    engine.setSelected(engine.pick(event.point, interactive))
  }

  return (
    <MapProvider>
      <Map
        id="mainMap"
        mapLib={maplibregl}
        initialViewState={{ longitude: camera.lng, latitude: camera.lat, zoom: camera.zoom - 1 }}
        mapStyle={EMPTY_STYLE}
        maxZoom={23}
        attributionControl={false}
        dragRotate={false}
        cursor={cursor}
        onLoad={handleLoad}
        onMove={handleMove}
        onMoveEnd={() => engine.loadVisibleTiles()}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      >
        <OsmLayers options={options} sourceOptions={{ tolerance: config.tolerance, maxzoom: config.sourceMaxZoom }} />
      </Map>
    </MapProvider>
  )
}
