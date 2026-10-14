// The page of the react-map-gl benchmark. `?mode=react` builds the map with react-map-gl/maplibre,
// `?mode=raw` with plain maplibre-gl. Both expose the same `window.__rmgl`, which tools/bench/rmgl/run.ts drives.
import 'maplibre-gl/dist/maplibre-gl.css'
import { setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 loads its worker from a URL: the same lines as apps/maid/src/main.tsx
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { mountRaw } from './raw-driver.js'
import { mountReact } from './react-driver.jsx'
import {
  loadInputs,
  makeConfig,
  movedLines,
  nextIdle,
  nextRender,
  panAndZoom,
  PIXEL,
  sleep,
  STYLE_A,
  STYLE_B,
  whenReady,
} from './shared.js'

setWorkerUrl(workerUrl)

const mode = new URLSearchParams(location.search).get('mode') === 'raw' ? 'raw' : 'react'
const container = document.querySelector('#root')
const now = () => performance.now()

let driver
let config
let imageCount = 0
let renders = 0

/** One step of a scenario: the time the call blocks, the time to the next frame, the time to idle */
async function step(samples, apply) {
  const { map } = driver
  const start = now()
  const rendered = nextRender(map)
  apply()
  samples.sync.push(now() - start)
  await rendered
  samples.toRender.push(now() - start)
  if (!map.loaded() || map.isMoving()) await nextIdle(map)
  samples.toIdle.push(now() - start)
}
const newSamples = () => ({ sync: [], toRender: [], toIdle: [] })

window.__rmgl = {
  mode,
  /** Builds the map and returns the time until every layer is there and the map is idle (ms) */
  async mount(options = {}) {
    config = makeConfig(options)
    const start = now()
    driver = await (mode === 'raw' ? mountRaw : mountReact)(container, config, options)
    const ms = now() - start
    if (options.count) {
      // each <Layer> calls map.getLayer once per render (layer.js): that is how its renders are counted
      const { map } = driver
      const getLayer = map.getLayer.bind(map)
      map.getLayer = (id) => {
        renders++
        return getLayer(id)
      }
    }
    return ms
  },
  unmount() {
    driver?.destroy()
    driver = undefined
  },
  counts: () => ({ sources: config.sources.length, layers: config.layers.length }),
  /** With `mount({ count: true })`: calls of map.getLayer since the last call of this, on the React side the renders of <Layer> */
  layerRenders() {
    const count = renders
    renders = 0
    return count
  },
  /**
   * A render of the parent that changes nothing, `n` times in batches of 20: ms per render, one value per batch.
   * Batches, because the browser's clock has a step of 0.1 ms and one render is shorter than that.
   */
  rerender(n) {
    const times = []
    for (let b = 0; b < Math.max(1, Math.round(n / 20)); b++) {
      const start = now()
      for (let i = 0; i < 20; i++) driver.rerender()
      times.push((now() - start) / 20)
    }
    return times
  },
  /** One layer's paint, filter or visibility changes, `n` times */
  async props(kind, n) {
    const samples = newSamples()
    for (let i = 0; i < n; i++) await step(samples, () => driver.setOverride(kind, i))
    return samples
  },
  /**
   * One line of about 10,000 moves, `n` times at 10 Hz. `features: 'shared'` keeps the other feature objects
   * (an immutable update), `'fresh'` makes every feature object new (a collection that is built again).
   */
  async data(how, n, features = 'shared') {
    const samples = newSamples()
    const index = config.lines.features.length - 1
    for (let i = 0; i < n; i++) {
      // making the new collection is the app's work on every side: not timed
      const next = movedLines(config.lines, index, i + 1)
      const moved = next.moved
      const collection = features === 'fresh' ? structuredClone(next.collection) : next.collection
      const start = now()
      await step(samples, () => driver.setLines(collection, moved, how))
      await sleep(Math.max(0, 100 - (now() - start)))
    }
    return samples
  },
  /** The highlight moves to another line, `n` times: by feature state, by a filter, or by a source of its own */
  async hover(how, n) {
    const samples = newSamples()
    const { map } = driver
    let last
    for (let i = 0; i < n; i++) {
      const feature = config.lines.features[(i * 37) % config.lines.features.length]
      const { id } = feature.properties
      await step(samples, () => {
        if (how === 'filter') return driver.hoverFilter(id)
        if (how === 'data') return driver.hoverData(feature)
        if (last !== undefined)
          map.setFeatureState({ source: config.linesId, id: last }, { hover: false })
        map.setFeatureState({ source: config.linesId, id }, { hover: true })
      })
      last = id
    }
    return samples
  },
  /** The style is swapped for another, `n` times: ms until every layer is back and the map is idle */
  async style(how, n) {
    const times = []
    for (let i = 0; i < n; i++) {
      const start = now()
      const ready = whenReady(driver.map, config.layers.length)
      driver.swapStyle(i % 2 === 0 ? STYLE_B : STYLE_A, how)
      await ready
      times.push(now() - start)
    }
    return times
  },
  /** An image is added to the style, `n` times: MapLibre fires `styledata` for each */
  async images(n) {
    const samples = newSamples()
    for (let i = 0; i < n; i++)
      await step(samples, () => driver.map.addImage(`bench-${imageCount++}`, PIXEL))
    return samples
  },
  /** `n` images added in one task, as a burst of on-demand images comes in: ms until the map is idle again */
  async imageBurst(n) {
    const { map } = driver
    const start = now()
    const rendered = nextRender(map)
    for (let i = 0; i < n; i++) map.addImage(`bench-${imageCount++}`, PIXEL)
    const sync = now() - start
    await rendered
    if (!map.loaded()) await nextIdle(map)
    // the timers react-map-gl's <Source> sets on styledata
    await sleep(50)
    return { sync, total: now() - start - 50 }
  },
  camera: () => panAndZoom(driver.map, config.center),
  /**
   * `n` mousemove events on the map's canvas, one every `interval` ms, in a zigzag over the middle of the map.
   * Dispatched in the page: Playwright's mouse needs a round trip per event, which caps the rate near 30 a second.
   */
  async pointer(n, interval) {
    const canvas = driver.map.getCanvas()
    const box = canvas.getBoundingClientRect()
    const start = now()
    for (let i = 0; i < n; i++) {
      const clientX = box.left + 240 + ((i * 7) % (box.width - 480))
      const clientY = box.top + 150 + ((i * 3) % (box.height - 300))
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }))
      await sleep(interval)
    }
    const seconds = (now() - start) / 1000
    await sleep(100)
    return { ...driver.mouse(), seconds }
  },
  mouse: () => driver.mouse(),
}

await loadInputs()
window.__rmgl.ready = true
