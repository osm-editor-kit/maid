/**
 * Loads OSM data for the viewport and keeps MapLibre's sources in sync.
 *
 * This is the one place that talks to MapLibre imperatively. The React layer components
 * declare sources and layers; the engine fills them with `updateData`, because re-sending
 * a whole FeatureCollection through React props on every tile would be the slow path we
 * want to avoid (see docs/research/maplibre.md).
 */
import { resolveWayStyle, tagClasses } from '@maid/style'
import type { Feature, FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import { dashPatterns, FeatureBuilder, wayVertices, type FeatureBatch, type SourceName } from './build'
import { SOURCES } from './layers'
import { OsmStore, type OsmElement } from './store'

export type EngineOptions = {
  /** OSM API root, e.g. http://localhost:8090/s/medium */
  apiUrl: string
  /** Data loads from this OSM zoom on (iD: 16) */
  minDataZoom: number
  /** 'diff' sends only new features to MapLibre, 'setData' re-sends everything on every tile */
  update: 'diff' | 'setData'
  highlight: 'source' | 'state'
  /** Wait for MapLibre to finish one update before sending the next (default true) */
  serialUpdates: boolean
  /** Called when the set of dash patterns grew and the layers need to be rebuilt */
  onStyleChange?: () => void
}

export type EngineMetrics = {
  tiles: number
  /** Updates sent to MapLibre sources */
  updates: number
  bytes: number
  fetchMs: number
  parseMs: number
  mergeMs: number
  buildMs: number
  pushMs: number
  features: Record<SourceName, number>
}

const TILE_ZOOM = 16
const SOURCE_NAMES: SourceName[] = ['areas', 'lines', 'points', 'vertices']
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** TILE_ZOOM)
const lat2y = (lat: number) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** TILE_ZOOM)
const x2lon = (x: number) => (x / 2 ** TILE_ZOOM) * 360 - 180
const y2lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** TILE_ZOOM))) * 180) / Math.PI

export class MaidEngine {
  store = new OsmStore()
  metrics: EngineMetrics = {
    tiles: 0, updates: 0, bytes: 0, fetchMs: 0, parseMs: 0, mergeMs: 0, buildMs: 0, pushMs: 0,
    features: { areas: 0, lines: 0, points: 0, vertices: 0 },
  } // prettier-ignore

  private builder = new FeatureBuilder(this.store)
  private map?: MapLibreMap
  private tiles = new Set<string>()
  private inflight = 0
  private all: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
  private featureSource = new Map<string, SourceName>()
  private dashCount = 0
  private hoverId: string | null = null
  private selectedId: string | null = null
  private shownHover: string | null = null
  private shownSelected: string | null = null
  private waiters: (() => void)[] = []
  private queue: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
  private busy: Record<SourceName, boolean> = { areas: false, lines: false, points: false, vertices: false }
  private dirty: Record<SourceName, boolean> = { areas: false, lines: false, points: false, vertices: false }

  constructor(public options: EngineOptions) {}

  attach(map: MapLibreMap) {
    this.map = map
    this.loadVisibleTiles()
  }

  /** OSM zoom (256px tiles) is MapLibre zoom plus one */
  osmZoom() {
    return (this.map?.getZoom() ?? 0) + 1
  }

  loadVisibleTiles() {
    const { map } = this
    if (!map || this.osmZoom() < this.options.minDataZoom) return
    const bounds = map.getBounds()
    const x0 = lon2x(bounds.getWest())
    const x1 = lon2x(bounds.getEast())
    const y0 = lat2y(bounds.getNorth())
    const y1 = lat2y(bounds.getSouth())
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const wanted: [number, number][] = []
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) if (!this.tiles.has(`${x}/${y}`)) wanted.push([x, y])
    }
    // centre first, like a person would want it
    wanted.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
    for (const [x, y] of wanted) void this.loadTile(x, y)
  }

  private async loadTile(x: number, y: number) {
    this.tiles.add(`${x}/${y}`)
    this.inflight++
    try {
      const bbox = [x2lon(x), y2lat(y + 1), x2lon(x + 1), y2lat(y)].join(',')
      const t0 = performance.now()
      const res = await fetch(`${this.options.apiUrl}/api/0.6/map.json?bbox=${bbox}`)
      if (!res.ok) throw new Error(`OSM API answered ${res.status} for tile ${x}/${y}`)
      const text = await res.text()
      const t1 = performance.now()
      const json = JSON.parse(text) as { elements: OsmElement[] }
      const t2 = performance.now()
      this.metrics.tiles++
      this.metrics.bytes += text.length
      this.metrics.fetchMs += t1 - t0
      this.metrics.parseMs += t2 - t1
      this.merge(json.elements)
    } catch (error) {
      this.tiles.delete(`${x}/${y}`)
      console.error(error)
    } finally {
      this.inflight--
      if (this.inflight === 0 && !this.pushing()) for (const done of this.waiters.splice(0)) done()
    }
  }

  merge(elements: OsmElement[]) {
    const t0 = performance.now()
    const added = this.store.merge(elements)
    const t1 = performance.now()
    const batch = this.builder.build(added)
    const t2 = performance.now()
    this.push(batch)
    const t3 = performance.now()
    this.metrics.mergeMs += t1 - t0
    this.metrics.buildMs += t2 - t1
    this.metrics.pushMs += t3 - t2
    if (dashPatterns.size !== this.dashCount) {
      this.dashCount = dashPatterns.size
      this.options.onStyleChange?.()
    }
  }

  private push(batch: FeatureBatch) {
    for (const name of SOURCE_NAMES) {
      const features = batch[name]
      if (features.length === 0) continue
      this.metrics.features[name] += features.length
      for (const f of features) this.featureSource.set(f.id as string, name)
      if (this.options.update === 'setData') this.all[name] = this.all[name].concat(features)
      else this.queue[name] = this.queue[name].concat(features)
      this.dirty[name] = true
      void this.flush(name)
    }
  }

  /**
   * One update per source at a time. Features that arrive while MapLibre's worker is busy
   * wait and go out together as the next update. Sending overlapping `updateData` calls
   * left tiles in an inconsistent state (queries threw "feature index out of bounds").
   */
  private async flush(name: SourceName) {
    if (this.busy[name] || !this.dirty[name]) return
    const source = this.map?.getSource<GeoJSONSource>(SOURCES[name])
    if (!source) return
    this.busy[name] = true
    this.dirty[name] = false
    this.metrics.updates++
    try {
      if (this.options.update === 'setData') {
        await source.setData({ type: 'FeatureCollection', features: this.all[name] })
      } else if (this.options.serialUpdates) {
        const add = this.queue[name]
        this.queue[name] = []
        await source.updateData({ add })
        await this.tilesReloaded(SOURCES[name])
      } else {
        const add = this.queue[name]
        this.queue[name] = []
        void source.updateData({ add })
      }
    } finally {
      this.busy[name] = false
      if (this.dirty[name]) void this.flush(name)
      else if (!this.pushing()) for (const done of this.waiters.splice(0)) done()
    }
  }

  /**
   * `updateData` resolves when the worker has the new data, but the visible tiles are still
   * being rebuilt. A second update during that rebuild is what broke the tiles, so wait for it.
   */
  private tilesReloaded(sourceId: string) {
    const { map } = this
    if (!map || map.isSourceLoaded(sourceId)) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        map.off('sourcedata', check)
        resolve()
      }
      const check = () => map.isSourceLoaded(sourceId) && done()
      const timer = setTimeout(done, 5000)
      map.on('sourcedata', check)
    })
  }

  private pushing() {
    return SOURCE_NAMES.some((name) => this.busy[name] || this.dirty[name])
  }

  /** Resolves when all requested tiles are merged and MapLibre has drawn them */
  async settled(timeoutMs = 60000) {
    const { map } = this
    if (!map) throw new Error('Engine is not attached to a map')
    const deadline = performance.now() + timeoutMs
    for (;;) {
      if (performance.now() > deadline) {
        throw new Error(`Maid did not settle in ${timeoutMs}ms (inflight tiles: ${this.inflight}, map loaded: ${map.loaded()})`)
      }
      this.loadVisibleTiles()
      if (this.inflight > 0 || this.pushing()) {
        await new Promise<void>((resolve) => this.waiters.push(resolve))
        continue
      }
      if (map.isMoving() || !map.loaded()) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 250)
          void map.once('idle').then(() => {
            clearTimeout(timer)
            resolve()
          })
        })
        continue
      }
      // one more frame so that the last tiles are on screen
      await new Promise<void>((resolve) => {
        map.triggerRepaint()
        void map.once('render').then(() => requestAnimationFrame(() => resolve()))
      })
      if (this.inflight === 0 && !this.pushing() && map.loaded() && !map.isMoving()) return
    }
  }

  // --- Hover and selection ---------------------------------------------------

  setHover(id: string | null) {
    if (id === this.hoverId) return
    const previous = this.hoverId
    this.hoverId = id
    this.applyHighlight(previous, 'hover')
  }

  setSelected(id: string | null) {
    if (id === this.selectedId) return
    const previous = this.selectedId
    this.selectedId = id
    this.applyHighlight(previous, 'selected')
  }

  /** What is on screen as hovered or selected (lags the request by the time MapLibre needs to draw it) */
  hovered() {
    return this.shownHover ? [this.shownHover] : []
  }
  selected() {
    return this.shownSelected ? [this.shownSelected] : []
  }

  private applyHighlight(previous: string | null, kind: 'hover' | 'selected') {
    const { map } = this
    if (!map) return
    const hoverId = this.hoverId
    const selectedId = this.selectedId
    const shown = () => {
      this.shownHover = hoverId
      this.shownSelected = selectedId
    }
    if (this.options.highlight === 'state') {
      const set = (id: string | null, on: boolean) => {
        const name = id && this.featureSource.get(id)
        if (name) map.setFeatureState({ source: SOURCES[name], id: id! }, { [kind]: on })
      }
      set(previous, false)
      set(kind === 'hover' ? hoverId : selectedId, true)
      void map.once('render').then(shown)
      return
    }
    const features: Feature[] = []
    if (selectedId) features.push(...this.highlightFeatures(selectedId, 'selected'))
    if (hoverId && hoverId !== selectedId) features.push(...this.highlightFeatures(hoverId, 'hover'))
    const source = map.getSource<GeoJSONSource>(SOURCES.highlight)
    if (!source) return
    source.setData(features.length ? { type: 'FeatureCollection', features } : EMPTY)
    const onData = (event: { sourceId?: string; sourceDataType?: string }) => {
      if (event.sourceId !== SOURCES.highlight || !map.isSourceLoaded(SOURCES.highlight)) return
      map.off('sourcedata', onData)
      void map.once('render').then(shown)
    }
    map.on('sourcedata', onData)
  }

  private highlightFeatures(id: string, state: 'hover' | 'selected'): Feature[] {
    const num = Number(id.slice(1))
    if (id[0] === 'n') {
      const node = this.store.nodes.get(num)
      if (!node) return []
      return [{ type: 'Feature', properties: { id, state }, geometry: { type: 'Point', coordinates: [node.lon, node.lat] } }]
    }
    if (id[0] !== 'w') return []
    const way = this.store.ways.get(num)
    if (!way) return []
    const coordinates = way.nodes.flatMap((n) => {
      const node = this.store.nodes.get(n)
      return node ? [[node.lon, node.lat]] : []
    })
    const geom = this.featureSource.get(id) === 'areas' ? 'area' : 'line'
    const shadow = resolveWayStyle(tagClasses(way.tags ?? {}), geom).shadow
    const out: Feature[] = [
      {
        type: 'Feature',
        properties: { id, state, hw: shadow.width, hwl: geom === 'area' ? shadow.width : shadow.widthLow },
        geometry: { type: 'LineString', coordinates },
      },
    ]
    if (state === 'selected') {
      for (const vertex of wayVertices(this.store, num)) {
        vertex.properties = { ...vertex.properties, state: 'shape' }
        out.push(vertex)
      }
    }
    return out
  }

  /** The feature a pointer at this pixel would hit, in iD's priority: vertex, point, line, area */
  pick(point: { x: number; y: number }, layerIds: string[], tolerance = 6): string | null {
    const { map } = this
    if (!map) return null
    const features = map.queryRenderedFeatures(
      [
        [point.x - tolerance, point.y - tolerance],
        [point.x + tolerance, point.y + tolerance],
      ],
      { layers: layerIds },
    )
    return pickBest(features)
  }

  stats() {
    const { map } = this
    const drawn: Record<string, number> = {}
    if (map) {
      for (const name of SOURCE_NAMES) {
        try {
          const ids = new Set(map.queryRenderedFeatures({ layers: layersOfSource(map, SOURCES[name]) }).map((f) => f.id))
          drawn[name] = ids.size
        } catch (error) {
          // MapLibre can throw "feature index out of bounds" here; keep the stats usable and visible
          console.error(`stats: queryRenderedFeatures failed for ${name}`, error)
          drawn[name] = -1
        }
      }
      drawn.layers = map.getStyle().layers.length
    }
    return { entities: this.store.counts(), drawn, hidden: {}, loaded: { ...this.metrics.features }, metrics: { ...this.metrics } }
  }
}

const PRIORITY: Record<string, number> = { [SOURCES.vertices]: 0, [SOURCES.points]: 1, [SOURCES.lines]: 2, [SOURCES.areas]: 3 }

function pickBest(features: MapGeoJSONFeature[]) {
  let best: MapGeoJSONFeature | undefined
  for (const f of features) {
    if (!best || (PRIORITY[f.source] ?? 9) < (PRIORITY[best.source] ?? 9)) best = f
  }
  return (best?.id as string | undefined) ?? null
}

function layersOfSource(map: MapLibreMap, source: string) {
  return map
    .getStyle()
    .layers.filter((l) => 'source' in l && l.source === source)
    .map((l) => l.id)
}
