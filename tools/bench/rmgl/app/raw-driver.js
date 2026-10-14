// The raw side: the same map with plain maplibre-gl calls.
import * as maplibregl from 'maplibre-gl'
import {
  HOVER_FILTER_LAYER,
  HOVER_SOURCE,
  overrideOf,
  SOURCE_OPTIONS,
  STYLE_A,
  whenReady,
  ZOOM,
} from './shared.js'

function addAll(map, config) {
  for (const source of config.sources)
    map.addSource(source.id, { type: 'geojson', data: source.data, ...SOURCE_OPTIONS })
  for (const layer of config.layers) map.addLayer(layer)
}

export async function mountRaw(container, config, options) {
  const map = new maplibregl.Map({
    container,
    style: STYLE_A,
    center: config.center,
    zoom: ZOOM,
    fadeDuration: 0,
    attributionControl: false,
  })
  const stats = { events: 0, features: 0 }
  const query = (point) => {
    stats.features += map.queryRenderedFeatures(point, { layers: config.interactiveIds }).length
  }
  if (options.mouse === 'plain') map.on('mousemove', () => stats.events++)
  if (options.mouse === 'every')
    map.on('mousemove', (event) => {
      stats.events++
      query(event.point)
    })
  if (options.mouse === 'throttled') {
    // one query per frame, for the last place of the pointer
    let pending
    map.on('mousemove', (event) => {
      stats.events++
      const waiting = pending !== undefined
      pending = event.point
      if (waiting) return
      requestAnimationFrame(() => {
        const point = pending
        pending = undefined
        query(point)
      })
    })
  }
  map.once('load', () => addAll(map, config))
  await whenReady(map, config.layers.length)

  const { target } = config
  return {
    map,
    destroy: () => map.remove(),
    rerender: () => {},
    setOverride(kind, i) {
      const next = overrideOf(target, kind, i)
      if (kind === 'paint') map.setPaintProperty(target.id, 'line-color', next.paint['line-color'])
      else if (kind === 'filter') map.setFilter(target.id, next.filter)
      else map.setLayoutProperty(target.id, 'visibility', next.layout.visibility)
    },
    setLines(collection, moved, how) {
      const source = map.getSource(config.linesId)
      if (how === 'updateData')
        void source.updateData({
          update: [{ id: moved.properties.id, newGeometry: moved.geometry }],
        })
      else void source.setData(collection)
    },
    hoverFilter: (id) => map.setFilter(HOVER_FILTER_LAYER, ['==', ['get', 'id'], id]),
    hoverData: (feature) =>
      void map.getSource(HOVER_SOURCE).setData({ type: 'FeatureCollection', features: [feature] }),
    swapStyle(style, how) {
      if (how === 'keep') {
        // the app's sources and layers go into the next style, and MapLibre's diff leaves them alone
        map.setStyle(style, {
          transformStyle: (previous, next) => ({
            ...next,
            sources: { ...next.sources, ...previous?.sources },
            layers: [
              ...next.layers,
              ...(previous?.layers ?? []).filter((l) => !next.layers.some((n) => n.id === l.id)),
            ],
          }),
        })
        return
      }
      map.setStyle(style, { diff: false })
      map.once('style.load', () => addAll(map, config))
    },
    mouse: () => stats,
  }
}
