// What both sides of the comparison share: the style, the data, the layer sets and the waiting helpers.
// Nothing here knows whether React or plain MapLibre draws the map.

export const EMPTY = { type: 'FeatureCollection', features: [] }

/** Maid's GeoJSON source settings (packages/renderer/src/OsmLayers.tsx) */
export const SOURCE_OPTIONS = { promoteId: 'id', tolerance: 0, maxzoom: 17, buffer: 64 }

/** MapLibre zoom 16 is OSM zoom 17, the zoom Maid opens at */
export const ZOOM = 16

const style = (colour) => ({
  version: 8,
  // no paint transitions: a changed paint property is drawn once, not for 300 ms
  transition: { duration: 0, delay: 0 },
  glyphs: `${location.origin}/fonts/{fontstack}/{range}.pbf`,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': colour } }],
})
export const STYLE_A = style('#000')
export const STYLE_B = style('#101010')

export const HOVER_SOURCE = 'bench-hover'
export const HOVER_FILTER_LAYER = 'bench-hover-filter'
export const HOVER_DATA_LAYER = 'bench-hover-data'
const HOVER_PAINT = { 'line-color': '#ff0', 'line-width': 6 }

let inputs

/** Fetches the prepared files once (from this server only) */
export async function loadInputs() {
  const get = async (name) => (await fetch(`/data/${name}.json`)).json()
  const [meta, layers, areas, lines, points, vertices] = await Promise.all(
    ['meta', 'layers', 'areas', 'lines', 'points', 'vertices'].map(get),
  )
  inputs = { meta, layers, data: { areas, lines, points, vertices } }
  return inputs
}

/**
 * The sources and layers of one run.
 * - `set: 'maid'`: Maid's own 14 sources and 113 layers.
 * - `set: <number>`: that many layers on the four data sources, copies of Maid's data layers.
 * - `empty`: the sources have no features (the cost of the style alone).
 * - `hover`: adds the highlight source and the two highlight layers of the hover scenario.
 */
export function makeConfig({ set = 'maid', empty = false, hover = false } = {}) {
  const { meta, layers: all, data } = inputs
  const names = Object.keys(meta.dataSources)
  const dataOf = (id) => {
    const name = names.find((n) => meta.dataSources[n] === id)
    return name && !empty ? data[name] : EMPTY
  }
  let sourceIds = meta.sources
  let layers = all
  if (set !== 'maid') {
    sourceIds = Object.values(meta.dataSources)
    const base = all.filter((l) => sourceIds.includes(l.source) && l.layout?.visibility !== 'none')
    layers = []
    for (let i = 0; i < set; i++) {
      // fewer than the base: spread over it. More: copies with their own ids.
      const from =
        set <= base.length ? base[Math.floor((i * base.length) / set)] : base[i % base.length]
      const copy = Math.floor(i / base.length)
      layers.push(copy === 0 ? from : { ...from, id: `${from.id}~${copy}` })
    }
  }
  const sources = sourceIds.map((id) => ({ id, data: dataOf(id) }))
  if (hover) {
    const linesId = meta.dataSources.lines
    sources.push({ id: HOVER_SOURCE, data: EMPTY })
    layers = [
      ...layers,
      {
        id: HOVER_FILTER_LAYER,
        type: 'line',
        source: linesId,
        filter: ['==', ['get', 'id'], ''],
        paint: HOVER_PAINT,
      },
      { id: HOVER_DATA_LAYER, type: 'line', source: HOVER_SOURCE, paint: HOVER_PAINT },
    ]
  }
  return {
    center: meta.center,
    sources,
    layers,
    linesId: meta.dataSources.lines,
    lines: data.lines,
    interactiveIds: meta.interactiveIds.filter((id) => layers.some((l) => l.id === id)),
    /** A line layer that is drawn at the benchmark's zoom: the target of the prop changes */
    target: layers.find(
      (l) =>
        l.type === 'line' &&
        l.source === meta.dataSources.lines &&
        (l.minzoom ?? 0) <= ZOOM &&
        (l.maxzoom ?? 24) > ZOOM &&
        l.layout?.visibility !== 'none',
    ),
  }
}

/** The changed props of the target layer for step `i` of a prop-change run */
export function overrideOf(target, kind, i) {
  const odd = i % 2 === 1
  if (kind === 'paint')
    return { paint: { ...target.paint, 'line-color': odd ? '#00ff88' : '#ff0088' } }
  if (kind === 'filter') {
    const extra = ['!=', ['get', 'id'], odd ? 'a' : 'b']
    return { filter: target.filter ? ['all', target.filter, extra] : extra }
  }
  return { layout: { ...target.layout, visibility: odd ? 'visible' : 'none' } }
}

/** The lines with feature `index` moved a little: a new collection, as a React app would make one */
export function movedLines(lines, index, step) {
  const feature = lines.features[index]
  const shift = (c) => (typeof c[0] === 'number' ? [c[0] + step * 1e-5, c[1]] : c.map(shift))
  const moved = {
    ...feature,
    geometry: { ...feature.geometry, coordinates: shift(feature.geometry.coordinates) },
  }
  const features = lines.features.slice()
  features[index] = moved
  return { collection: { type: 'FeatureCollection', features }, moved }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The map has every layer and nothing left to load. Counts the style's own background layer. */
export function whenReady(map, layerCount) {
  return new Promise((resolve) => {
    const check = () => {
      if (map.getLayersOrder().length < layerCount + 1 || !map.loaded()) return
      map.off('idle', check)
      resolve()
    }
    map.on('idle', check)
  })
}

/** The next frame the map draws, and one task more so timers and React renders it caused have run */
export function nextRender(map) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setTimeout(resolve, 0)
    }
    map.once('render', finish)
    // a change that draws nothing must not hang the run
    setTimeout(finish, 1000)
  })
}

export function nextIdle(map) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    map.once('idle', finish)
    setTimeout(finish, 15_000)
  })
}

/** Frame intervals while `during` runs */
export async function recordFrames(during) {
  const frames = []
  let last = performance.now()
  let running = true
  const tick = (now) => {
    frames.push(now - last)
    last = now
    if (running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  await during()
  running = false
  return frames.slice(1)
}

/** The scripted camera move of the camera scenario: a pan, then a zoom in, two seconds each */
export async function panAndZoom(map, center) {
  let stuck = 0
  // a move that does not end within its time plus a margin is counted, not waited for
  const ended = () =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        stuck++
        map.off('moveend', done)
        resolve()
      }, 4000)
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      map.once('moveend', done)
    })
  const linear = (t) => t
  let moves = 0
  let behind = 0
  const onMove = (event) => {
    moves++
    // react-map-gl puts the camera the handlers asked for into `viewState`. The map itself may still
    // be at the camera of the props.
    const asked = event.viewState
    if (!asked) return
    const now = map.getCenter()
    if (asked.longitude !== now.lng || asked.zoom !== map.getZoom()) behind++
  }
  map.on('move', onMove)
  const frames = await recordFrames(async () => {
    map.easeTo({
      center: [center[0] + 0.004, center[1] + 0.002],
      duration: 2000,
      easing: linear,
      essential: true,
    })
    await ended()
    map.easeTo({ zoom: ZOOM + 1.5, duration: 2000, easing: linear, essential: true })
    await ended()
  })
  map.off('move', onMove)
  return { frames, moves, behind, stuck, center: map.getCenter().toArray(), zoom: map.getZoom() }
}

/** A 1x1 image, for the scenario that adds images to the style */
export const PIXEL = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }
