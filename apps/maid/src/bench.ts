import type { MaidEngine } from '@maid/renderer'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { BenchApi } from '../../../tools/refs/bench-api'

/**
 * Maid's side of the contract in tools/refs/bench-api.d.ts. Also the debug handle for agents:
 * `window.__maid` gives the map and the engine.
 */
export function exposeBenchApi(map: MapLibreMap, engine: MaidEngine) {
  const api: BenchApi = {
    editor: 'maid',
    version: `maplibre-gl ${map.version}`,
    ready: () => Promise.resolve(),
    // OSM zoom (256px tiles) is MapLibre zoom plus one
    setCamera: ({ lng, lat, zoom }) => map.jumpTo({ center: [lng, lat], zoom: zoom - 1 }),
    getCamera: () => ({ lng: map.getCenter().lng, lat: map.getCenter().lat, zoom: map.getZoom() + 1 }),
    project: (lng, lat) => {
      const point = map.project([lng, lat])
      const rect = map.getContainer().getBoundingClientRect()
      return { x: rect.left + point.x, y: rect.top + point.y }
    },
    settled: () => engine.settled(),
    stats: () => engine.stats(),
    select: async (id) => {
      engine.setSelected(id)
      await new Promise<void>((resolve) => {
        const check = () => ((engine.selected()[0] ?? null) === id ? resolve() : requestAnimationFrame(check))
        check()
      })
    },
    selected: () => engine.selected(),
    hovered: () => engine.hovered(),
  }
  Object.assign(window, { __bench: api, __maid: { map, engine } })
}
