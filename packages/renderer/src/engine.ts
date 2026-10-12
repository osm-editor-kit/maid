import type { Editor } from '@osm-editor-kit/maid-core'
import {
  type Action,
  actionAddEntity,
  actionChangeTags,
  actionDeleteNode,
  actionDeleteRelation,
  actionDeleteWay,
  actionMoveNode,
  type Difference,
  OsmWay,
  type OsmEntity,
  type OsmJsonElement,
  OsmNode,
} from '@osm-editor-kit/maid-model'
/**
 * Loads OSM data for the viewport and keeps MapLibre's sources in sync.
 *
 * This is the one place that talks to MapLibre imperatively. The React layer components
 * declare sources and layers; the engine fills them with `updateData`, because re-sending
 * a whole FeatureCollection through React props on every tile would be the slow path we
 * want to avoid (see docs/research/maplibre.md).
 */
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import type { Geometry, Preset, Presets } from '@osm-editor-kit/maid-presets'
import { isArea, type Tags } from '@osm-editor-kit/maid-style'
import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import {
  dashPatterns,
  FeatureBuilder,
  wayVertices,
  type FeatureBatch,
  type SourceName,
} from './build'
import { OsmData } from './data'
import { DrawTool } from './draw'
import { EDIT_SOURCES, SOURCES } from './layers'

export type EngineOptions = {
  /** The editor that owns the OSM data and the edit history. The engine reads and changes them there. */
  editor: Editor
  /** OSM API root, e.g. http://localhost:8090/s/medium */
  apiUrl: string
  /** Data loads from this OSM zoom on (iD: 16) */
  minDataZoom: number
  /**
   * Called with new features before they go to MapLibre, e.g. to add the images they need.
   * Images that arrive after a tile was laid out do not reliably show up in that tile.
   */
  prepare?: (batch: FeatureBatch) => Promise<void>
  /** Called when the set of dash patterns grew and the layers need to be rebuilt */
  onStyleChange?: () => void
}

export type EngineMetrics = {
  tiles: number
  /** Updates sent to MapLibre sources */
  updates: number
  /** Times the live tier was moved into the big sources */
  compactions: number
  bytes: number
  fetchMs: number
  parseMs: number
  mergeMs: number
  buildMs: number
  pushMs: number
  features: Record<SourceName, number>
}

/** What the inspector needs to know about one entity */
export type EntityInfo = {
  id: string
  type: 'node' | 'way' | 'relation'
  geometry: Geometry
  tags: Tags
  preset?: Preset
  /** Number of nodes of a way, or members of a relation */
  size?: number
}

const TILE_ZOOM = 16
const SOURCE_NAMES: SourceName[] = ['areas', 'lines', 'points', 'vertices']

const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** TILE_ZOOM)
const lat2y = (lat: number) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** TILE_ZOOM)
const x2lon = (x: number) => (x / 2 ** TILE_ZOOM) * 360 - 180
const y2lat = (y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** TILE_ZOOM))) * 180) / Math.PI

/** Whether an entity moved between the two sides of a change. A missing side or position counts as moved. */
function locMoved(base: OsmEntity | undefined, head: OsmEntity | undefined): boolean {
  // only nodes have a position; a way gives undefined and counts as moved (ways are always rebuilt anyway)
  const from = (base as OsmNode | undefined)?.loc
  const to = (head as OsmNode | undefined)?.loc
  if (!from || !to) return true
  return from[0] !== to[0] || from[1] !== to[1]
}

/**
 * What a click on the map does. `browse` selects and drags; `add-point` places a new point and
 * returns to `browse`; `draw-line` and `draw-area` add a node per click until the way is finished.
 */
export type Mode = 'browse' | 'add-point' | 'draw-line' | 'draw-area'

export class MaidEngine {
  /** The OSM data: entities and edit history (from the editor), plus the indexes of the builder */
  data: OsmData
  metrics: EngineMetrics = {
    tiles: 0, updates: 0, compactions: 0, bytes: 0, fetchMs: 0, parseMs: 0, mergeMs: 0, buildMs: 0, pushMs: 0,
    features: { areas: 0, lines: 0, points: 0, vertices: 0 },
  } // prettier-ignore

  private builder: FeatureBuilder
  /** The map the engine draws on, once attached */
  map?: MapLibreMap
  private tiles = new Set<string>()
  private inflight = 0
  private featureSource = new Map<string, SourceName>()
  private dashCount = 0
  private hoverId: string | null = null
  /** Everything that is selected, in the order it was selected. The first is what the inspector shows. */
  private selectedIds: string[] = []
  private shownHover: string | null = null
  private shownSelected: string[] = []
  private waiters: (() => void)[] = []
  /** Ids whose original in the big sources is hidden while a newer copy is in the live tier */
  private editing = new Set<string>()
  /**
   * What the live tier holds, by source and id. The live tier is a set of small twin sources
   * for data that arrived after the first load and for features that were changed. Updating
   * them re-tiles only that little data; the big sources stay untouched until compaction.
   */
  private live: Record<SourceName, Map<string, Feature>> = {
    areas: new Map(),
    lines: new Map(),
    points: new Map(),
    vertices: new Map(),
  }
  private channels = {
    base: makeChannels(SOURCES),
    live: makeChannels(EDIT_SOURCES),
  }
  /** After the first view is complete, new data goes to the live tier */
  private firstLoadDone = false
  private compacting = false
  private compactTimer?: ReturnType<typeof setTimeout>

  // The data comes from the editor, so the engine and the editor's modules see the same entities.
  // Assigned here, not in field initializers, because the builder needs `data`.
  constructor(public options: EngineOptions) {
    this.data = new OsmData(options.editor.context, options.editor.history)
    this.presets = options.editor.presets
    this.builder = new FeatureBuilder(this.data, this.presets)
  }

  // --- Reading state from the UI ---

  private listeners = new Set<() => void>()
  /** Counts up whenever data was merged. For `useSyncExternalStore`. */
  version = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getVersion = () => this.version

  private changed() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  private presets: Presets | undefined

  entity(id: string | null): EntityInfo | undefined {
    if (!id) return undefined
    if (id[0] === 'n') {
      const node = this.data.node(id)
      if (!node) return undefined
      const geometry: Geometry = this.data.nodeWays.has(id) ? 'vertex' : 'point'
      const tags = node.tags
      return { id, type: 'node', geometry, tags, preset: this.presets?.match(tags, geometry) }
    }
    if (id[0] === 'w') {
      const way = this.data.way(id)
      if (!way) return undefined
      const tags = way.tags
      const closed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1]
      const geometry: Geometry = isArea(way.tags, closed) ? 'area' : 'line'
      return {
        id,
        type: 'way',
        geometry,
        tags,
        preset: this.presets?.match(tags, geometry),
        size: way.nodes.length,
      }
    }
    const relation = this.data.relation(id)
    if (!relation) return undefined
    const tags = relation.tags
    const geometry: Geometry = tags.type === 'multipolygon' ? 'area' : 'relation'
    return {
      id,
      type: 'relation',
      geometry,
      tags,
      preset: this.presets?.match(tags, geometry),
      size: relation.members.length,
    }
  }

  /** The node or way with this id in the current graph. Relations and unknown ids give undefined. */
  private nodeOrWay(id: string): OsmNode | OsmWay | undefined {
    if (id[0] === 'n') return this.data.node(id)
    if (id[0] === 'w') return this.data.way(id)
    return undefined
  }

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
    this.touch()
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
      const json = JSON.parse(text) as { elements: OsmJsonElement[] }
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
      if (this.inflight === 0) {
        this.flushAll()
        // the first view is complete: from now on new data goes to the live tier
        if (this.metrics.tiles > 0) this.firstLoadDone = true
        this.wake()
      }
    }
  }

  merge(elements: OsmJsonElement[]) {
    const t0 = performance.now()
    const added = this.data.merge(elements)
    const t1 = performance.now()
    const batch = this.builder.build(added)
    const t2 = performance.now()
    // decided now, not when the images are ready: by then the first view may count as complete
    const tier = this.firstLoadDone ? 'live' : 'base'
    if (this.options.prepare) {
      this.preparing++
      void this.options.prepare(batch).finally(() => {
        this.preparing--
        this.push(batch, tier)
      })
    } else this.push(batch, tier)
    const t3 = performance.now()
    this.changed()
    this.metrics.mergeMs += t1 - t0
    this.metrics.buildMs += t2 - t1
    this.metrics.pushMs += t3 - t2
    if (dashPatterns.size !== this.dashCount) {
      this.dashCount = dashPatterns.size
      this.options.onStyleChange?.()
    }
  }

  /** Sends features to MapLibre: to the live tier once the first view is complete, else to the big sources */
  private push(batch: FeatureBatch, tier: 'base' | 'live' = this.firstLoadDone ? 'live' : 'base') {
    for (const name of SOURCE_NAMES) {
      const features = batch[name]
      if (features.length === 0) continue
      this.metrics.features[name] += features.length
      for (const f of features) {
        this.featureSource.set(f.id as string, name)
        if (tier === 'live') this.live[name].set(f.id as string, f)
      }
      // a selection made before its feature was loaded (from the URL) is shown once it arrives
      if (
        this.selectedIds.length !== this.shownSelected.length &&
        features.some((f) => this.selectedIds.includes(f.id as string))
      ) {
        queueMicrotask(() => this.applyHighlight([], 'selected'))
      }
      const channel = this.channels[tier][name]
      channel.queue = channel.queue.concat(features)
      channel.dirty = true
      this.scheduleFlush(channel)
    }
    this.touch()
  }

  private flushTimer?: ReturnType<typeof setTimeout>

  private scheduleFlush(channel: Channel) {
    // more tiles of this view are on their way: wait for them, but never longer than 150 ms
    if (this.inflight > 1) {
      this.flushTimer ??= setTimeout(() => this.flushAll(), 150)
      return
    }
    void this.flush(channel)
  }

  private allChannels() {
    return [...Object.values(this.channels.base), ...Object.values(this.channels.live)]
  }

  private flushAll() {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    for (const channel of this.allChannels()) void this.flush(channel)
  }

  /**
   * One update per source at a time. Features that arrive while MapLibre's worker is busy
   * wait and go out together as the next update. Sending overlapping `updateData` calls
   * left tiles in an inconsistent state (queries threw "feature index out of bounds").
   */
  private async flush(channel: Channel) {
    if (channel.busy || !channel.dirty) return
    const source = this.map?.getSource<GeoJSONSource>(channel.sourceId)
    if (!source) return
    channel.busy = true
    channel.dirty = false
    this.metrics.updates++
    try {
      const add = channel.queue
      const remove = channel.removals
      channel.queue = []
      channel.removals = []
      await source.updateData({ add, remove })
      await this.tilesReloaded(channel.sourceId)
    } finally {
      channel.busy = false
      if (channel.dirty) void this.flush(channel)
      else this.wake()
    }
  }

  /** Resolves when this channel has nothing queued or in flight */
  private async channelIdle(channel: Channel) {
    while (channel.busy || channel.dirty)
      await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  private wake() {
    for (const done of this.waiters.splice(0)) done()
  }

  // --- Compaction: move the live tier into the big sources when nothing else is going on ---

  /** Call on any activity. Compaction waits until two seconds have passed without one. */
  private touch() {
    clearTimeout(this.compactTimer)
    this.compactTimer = setTimeout(() => void this.compact(), 2000)
  }

  private async compact() {
    const { map } = this
    if (!map) return
    // only when the picture is final: compaction must never delay it
    if (
      this.compacting ||
      this.dragBusy ||
      this.inflight > 0 ||
      this.pushing() ||
      map.isMoving() ||
      !map.loaded()
    )
      return this.touch()
    const snapshot = SOURCE_NAMES.map((name) => [name, [...this.live[name].values()]] as const)
    if (snapshot.every(([, features]) => features.length === 0)) return
    this.compacting = true
    try {
      // 1. copy into the big sources; the map keeps showing the live copies meanwhile
      for (const [name, features] of snapshot) {
        if (features.length === 0) continue
        const channel = this.channels.base[name]
        channel.queue = channel.queue.concat(features)
        channel.dirty = true
        void this.flush(channel)
      }
      await Promise.all(
        Object.values(this.channels.base).map((channel) => this.channelIdle(channel)),
      )
      // 2. drop the live copies that were not changed again since, and show the originals
      for (const [name, features] of snapshot) {
        const done = features
          .filter((f) => this.live[name].get(f.id as string) === f)
          .map((f) => f.id as string)
        if (done.length === 0) continue
        for (const id of done) {
          this.live[name].delete(id)
          if (this.editing.delete(id))
            map.removeFeatureState({ source: SOURCES[name], id }, 'editing')
        }
        const channel = this.channels.live[name]
        channel.removals = channel.removals.concat(done)
        channel.dirty = true
        void this.flush(channel)
      }
      await Promise.all(
        Object.values(this.channels.live).map((channel) => this.channelIdle(channel)),
      )
      this.metrics.compactions++
    } finally {
      this.compacting = false
      this.wake()
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

  private preparing = 0

  private pushing() {
    return (
      this.preparing > 0 ||
      this.flushTimer !== undefined ||
      this.dragBusy ||
      this.compacting ||
      this.allChannels().some((channel) => channel.busy || channel.dirty)
    )
  }

  /** Resolves when all requested tiles are merged and MapLibre has drawn them */
  async settled(timeoutMs = 60000) {
    const { map } = this
    if (!map) throw new Error('Engine is not attached to a map')
    const deadline = performance.now() + timeoutMs
    for (;;) {
      if (performance.now() > deadline) {
        throw new Error(
          `Maid did not settle in ${timeoutMs}ms (inflight tiles: ${this.inflight}, map loaded: ${map.loaded()})`,
        )
      }
      this.loadVisibleTiles()
      if (this.inflight > 0 || this.pushing()) {
        // woken when work finishes; the timer covers work that ends without sending anything
        await new Promise<void>((resolve) => {
          this.waiters.push(resolve)
          setTimeout(resolve, 250)
        })
        continue
      }
      // `idle` is MapLibre's "nothing left to draw": tiles are loaded, symbols are placed and
      // faded in. Waiting for less would call a picture final while pins are still missing.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2000)
        void map.once('idle').then(() => {
          clearTimeout(timer)
          resolve()
        })
        map.triggerRepaint()
      })
      if (this.inflight === 0 && !this.pushing() && map.loaded() && !map.isMoving()) return
    }
  }

  // --- Data changes ---

  /**
   * Moves a node, as dragging a vertex would, and resolves with the time until the change is
   * on screen. A move on its own is one undo step; a drag is one step when it ends (`endDrag`).
   */
  async moveNode(id: string, lon: number, lat: number) {
    const ms = await this.moveNodeStep(id, lon, lat)
    this.data.history.commit({ annotation: 'Moved a node', selectedIDs: [id] })
    return ms
  }

  /**
   * Performs one move on the work in progress and sends the features that use the node to
   * MapLibre. A drag calls this for every step; only `moveNode` and `endDrag` make an undo step. Public for the edit benchmark.
   */
  async moveNodeStep(id: string, lon: number, lat: number) {
    const { map } = this
    if (!map || !this.data.node(id)) throw new Error(`Cannot move node ${id}`)
    const t0 = performance.now()
    // the action replaces the node with a moved copy: the redraw looks the node up again
    this.data.history.perform(actionMoveNode(id, [lon, lat]))
    const { batch, remove } = this.redraw([{ id, moved: true }])
    this.removeFeatures(remove)
    this.sendBatch(batch)
    await Promise.all(Object.values(this.channels.live).map((channel) => this.channelIdle(channel)))
    await new Promise<void>((resolve) => {
      map.triggerRepaint()
      void map.once('render').then(() => resolve())
    })
    return performance.now() - t0
  }

  /**
   * A feature that is about to get a newer copy in the live tier: hide its original in the big
   * source through feature state, which costs no re-tiling. Compaction shows it again.
   */
  private hideOriginals(batch: FeatureBatch) {
    for (const name of SOURCE_NAMES) {
      for (const f of batch[name]) {
        const id = f.id as string
        if (this.editing.has(id) || this.live[name].has(id)) continue
        this.editing.add(id)
        this.map?.setFeatureState({ source: SOURCES[name], id }, { editing: true })
      }
    }
  }

  // --- Changing tags ---

  /**
   * Sets or removes one tag of a node or way and redraws it with the look the new tags give it.
   * Local only: nothing is uploaded. The change is one undo step.
   */
  setTag(id: string, key: string, value: string | undefined) {
    const entity = this.nodeOrWay(id)
    if (!entity || !key) return
    const tags = { ...entity.tags }
    if (value === undefined || value === '') delete tags[key]
    else tags[key] = value
    this.setTags(id, tags)
  }

  /** Replaces all tags of a node or way, for example when a preset is chosen. One undo step. */
  setTags(id: string, tags: Tags, annotation = 'Changed tags') {
    if (!this.nodeOrWay(id)) return
    this.edit(actionChangeTags(id, tags), annotation, [id])
  }

  // --- Operations ---

  /** What an operation looks at: the current data and the selection */
  operationContext(): OperationContext {
    return { graph: this.data.history.staging.graph, selected: this.selectedIds }
  }

  /**
   * Runs an operation on the selection as one undo step. Returns what is selected afterwards, or
   * undefined if the operation does not apply or cannot run now.
   */
  runOperation(operation: Operation): readonly string[] | undefined {
    const context = this.operationContext()
    if (this.draw.active || !operation.applies(context) || operation.disabled(context)) return
    const { actions, annotation, select } = operation.run(context)
    let next: readonly string[] = this.selectedIds
    this.change(() => {
      const { history } = this.data
      history.perform(...actions)
      const { graph } = history.staging
      // what was selected can be gone, and the operation knows what should be selected now
      next = (select?.(graph) ?? next).filter((id) => graph.hasEntity(id) !== undefined)
      history.commit({ annotation, selectedIDs: [...next] })
    })
    this.setSelected(next)
    return next
  }

  // --- Modes ---

  private currentMode: Mode = 'browse'
  /** Drawing lines and areas */
  readonly draw = new DrawTool(this)

  /** What a click on the map does now */
  get mode(): Mode {
    return this.currentMode
  }

  /** Changes the mode. A way that is being drawn is finished first, as iD does. */
  setMode(mode: Mode) {
    if (mode === this.currentMode) return
    if (this.draw.active) this.draw.finish()
    this.currentMode = mode
    this.changed()
  }

  // --- Creating and deleting ---

  /** Adds a standalone point and returns its id (negative, as for every new entity). One undo step. */
  addPoint(lon: number, lat: number, tags: Tags = {}): string {
    const node = new OsmNode(this.data.context, { loc: [lon, lat], tags })
    this.edit(actionAddEntity(node), 'Added a point', [node.id])
    return node.id
  }

  /**
   * Deletes a node, way or relation, as iD does: a way takes the nodes along that nothing else
   * uses and that have no tags of their own; a node is taken out of its ways. One undo step.
   * Returns false if there is no such entity.
   */
  deleteEntity(id: string): boolean {
    const { graph } = this.data.history.staging
    if (!graph.hasEntity(id)) return false
    const action =
      id[0] === 'n'
        ? actionDeleteNode(id)
        : id[0] === 'w'
          ? actionDeleteWay(id)
          : actionDeleteRelation(id)
    const kind = id[0] === 'n' ? 'a node' : id[0] === 'w' ? 'a way' : 'a relation'
    if (this.selectedIds.includes(id)) this.setSelected(this.selectedIds.filter((s) => s !== id))
    if (id === this.hoverId) this.setHover(null)
    this.edit(action, `Deleted ${kind}`, [])
    return true
  }

  /** Performs an action as one undo step and redraws what it changed */
  private edit(action: Action, annotation: string, selectedIDs: string[]) {
    const { history } = this.data
    this.change(() => {
      history.perform(action)
      history.commit({ annotation, selectedIDs })
    })
  }

  // --- Redrawing ---

  /**
   * Rebuilds the features that show the given entities, from the current staging graph. Nothing
   * is sent to MapLibre: the caller removes the features in `remove` and sends `batch`.
   * A node rebuilds its vertex, or its point if it is standalone. If the node moved (`moved`), it
   * also rebuilds the ways that use it, because their shape depends on the position only.
   * A way rebuilds its line or area, a multipolygon relation its area. An id that is no longer in
   * the graph loses its feature. Each feature is built once, however many ids need it.
   */
  private redraw(entities: Iterable<{ id: string; moved: boolean }>): {
    batch: FeatureBatch
    remove: [SourceName, string][]
  } {
    const batch: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
    const remove: [SourceName, string][] = []
    const placed = new Set<string>()
    // records what a feature is now: its source and feature, or nothing if it is no longer drawn
    const place = (id: string, drawn?: { source: SourceName; feature: Feature }) => {
      if (placed.has(id)) return
      placed.add(id)
      if (drawn) batch[drawn.source].push(drawn.feature)
      // a way can change between line and area, or stop being drawn
      const previous = this.featureSource.get(id)
      if (previous && previous !== drawn?.source) remove.push([previous, id])
    }
    for (const { id, moved } of entities) {
      if (id[0] === 'n') {
        const node = this.data.node(id)
        if (!node) {
          place(id)
        } else if (this.data.nodeWays.has(id)) {
          if (moved)
            for (const wayId of this.data.nodeWays.get(id) ?? []) {
              const way = this.data.way(wayId)
              if (way) place(wayId, this.builder.buildWay(way))
            }
          const vertex = this.builder.refreshVertex(node)
          place(id, vertex && { source: 'vertices', feature: vertex })
        } else {
          const point = this.builder.buildPoint(node)
          place(id, point && { source: 'points', feature: point })
        }
      } else if (id[0] === 'w') {
        const way = this.data.way(id)
        place(id, way && this.builder.buildWay(way))
      } else if (id[0] === 'r') {
        const relation = this.data.relation(id)
        if (!relation || relation.tags.type !== 'multipolygon') {
          place(id)
          continue
        }
        // build() also returns multipolygons that were waiting for members: those are drawn too
        const out = this.builder.build({ nodes: [], ways: [], relations: [relation] })
        const area = out.areas.find((f) => f.id === id)
        place(id, area && { source: 'areas', feature: area })
        for (const f of out.areas) if (f.id !== id) batch.areas.push(f)
      }
    }
    return { batch, remove }
  }

  /** Takes features out of the sources they are drawn in, in both tiers */
  private removeFeatures(remove: [SourceName, string][]) {
    for (const [name, featureId] of remove) {
      this.featureSource.delete(featureId)
      for (const tier of ['base', 'live'] as const) {
        const channel = this.channels[tier][name]
        channel.removals.push(featureId)
        channel.dirty = true
        void this.flush(channel)
      }
      this.live[name].delete(featureId)
    }
  }

  /** Sends a batch the way an edit does: to the live tier, hiding the originals there */
  private sendBatch(batch: FeatureBatch) {
    this.hideOriginals(batch)
    this.push(batch, 'live')
  }

  // --- Undo and redo ---

  /** What undo and redo would do now, with the annotations of the edits they would step over */
  undoState(): { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string } {
    const { history } = this.data
    const undoLabel = history.getUndoAnnotation()
    const redoLabel = history.getRedoAnnotation()
    return {
      canUndo: undoLabel !== undefined,
      canRedo: redoLabel !== undefined,
      undoLabel,
      redoLabel,
    }
  }

  /** Takes back the last edit and redraws what it changed. Does nothing while a vertex is dragged. */
  undo(): void {
    if (this.dragged || this.draw.active || this.data.history.getUndoAnnotation() === undefined)
      return
    this.change(() => this.data.history.undo())
  }

  /** Puts back the edit that the last undo took back, and redraws what it changed. */
  redo(): void {
    if (this.dragged || this.draw.active || this.data.history.getRedoAnnotation() === undefined)
      return
    this.change(() => this.data.history.redo())
  }

  /**
   * Runs a change of the history (actions with or without a commit, a revert, undo or redo), then
   * redraws every entity that its differences name, each once. Created entities get their
   * features, deleted ones lose them. This is how tools and operations change the data.
   */
  change(step: () => void) {
    const { history } = this.data
    const differences: Difference[] = []
    const off = history.on('stagingchange', (difference) => {
      differences.push(difference)
    })
    try {
      step()
    } finally {
      off()
    }
    if (differences.length > 0) {
      // the union of all differences, each id once; a node that moved in any of them moves its ways
      const moved = new Map<string, boolean>()
      for (const difference of differences)
        for (const [id, { base, head }] of difference.changes) {
          moved.set(id, (moved.get(id) ?? false) || locMoved(base, head))
          // A way that came, went or changed its nodes changes what its nodes are: a vertex can
          // become a junction, an end or a standalone point. Those nodes are not in the difference.
          const from = base instanceof OsmWay ? base.nodes : undefined
          const to = head instanceof OsmWay ? head.nodes : undefined
          if (from !== to)
            for (const nodeId of [...(from ?? []), ...(to ?? [])])
              if (!moved.has(nodeId)) moved.set(nodeId, false)
        }
      const { batch, remove } = this.redraw(
        [...moved].map(([id, isMoved]) => ({ id, moved: isMoved })),
      )
      this.removeFeatures(remove)
      this.sendBatch(batch)
      // feature state belongs to a source: a feature that changed its source needs it again
      if (remove.some(([, featureId]) => this.selectedIds.includes(featureId)))
        queueMicrotask(() => this.applyHighlight([], 'selected'))
    }
    this.changed()
  }

  // --- Dragging a vertex ---

  private dragTarget?: { id: string; lon: number; lat: number }
  /** The vertex being dragged: its moves become one undo step when the drag ends */
  private dragged?: string
  private dragBusy = false

  /** True if this id is a vertex that can be dragged */
  isVertex(id: string | null): id is string {
    return !!id && id[0] === 'n' && this.data.nodeWays.has(id)
  }

  /**
   * Call on every pointer move while a vertex is held. Positions that arrive while the map is
   * still drawing the previous one are dropped in favour of the latest, so the vertex never
   * lags behind by more than one update.
   */
  dragTo(id: string, lon: number, lat: number) {
    this.dragTarget = { id, lon, lat }
    this.dragged = id
    this.touch()
    if (this.dragBusy) return
    this.dragBusy = true
    void (async () => {
      try {
        while (this.dragTarget) {
          const target = this.dragTarget
          this.dragTarget = undefined
          await this.moveNodeStep(target.id, target.lon, target.lat)
        }
      } finally {
        this.dragBusy = false
      }
    })()
  }

  /** Resolves when the moves that were asked for are on the map. Does not end the drag. */
  async settleDrag() {
    while (this.dragBusy) await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  /** Forgets a move that was not made yet and ends the drag without an undo step */
  stopDrag() {
    this.dragTarget = undefined
    this.dragged = undefined
  }

  /** Call when the vertex is released. The whole drag becomes one undo step. */
  async endDrag() {
    await this.settleDrag()
    const id = this.dragged
    this.dragged = undefined
    if (id && this.data.history.hasWorkInProgress)
      this.data.history.commit({ annotation: 'Moved a node', selectedIDs: [id] })
    // the moved features stay in the live tier until compaction
    this.touch()
    this.wake()
  }

  // --- Hover and selection ---------------------------------------------------

  setHover(id: string | null) {
    if (id === this.hoverId) return
    const previous = this.hoverId
    this.hoverId = id
    this.applyHighlight(previous ? [previous] : [], 'hover')
  }

  /** Selects one entity, several, or nothing */
  setSelected(selection: string | readonly string[] | null) {
    const ids =
      selection === null ? [] : typeof selection === 'string' ? [selection] : [...selection]
    const previous = this.selectedIds
    if (ids.length === previous.length && ids.every((id, i) => id === previous[i])) return
    this.selectedIds = ids
    this.applyHighlight(previous, 'selected')
    this.changed()
  }

  /** The ids that are selected (what was asked for; `selected()` is what the map shows) */
  get selection(): readonly string[] {
    return this.selectedIds
  }

  /** What is on screen as hovered or selected (lags the request by the time MapLibre needs to draw it) */
  hovered() {
    return this.shownHover ? [this.shownHover] : []
  }
  selected() {
    return this.shownSelected
  }

  private applyHighlight(previous: readonly string[], kind: 'hover' | 'selected') {
    const { map } = this
    if (!map) return
    const hoverId = this.hoverId
    const selectedIds = this.selectedIds
    const shown = () => {
      this.shownHover = hoverId
      // only what has a feature is on the map
      this.shownSelected = selectedIds.filter((id) => this.featureSource.has(id))
    }
    const set = (id: string | null, on: boolean) => {
      const name = id && this.featureSource.get(id)
      if (!name) return
      // a feature can be in the big source, in the live tier, or (hidden) in both
      map.setFeatureState({ source: SOURCES[name], id: id! }, { [kind]: on })
      map.setFeatureState({ source: EDIT_SOURCES[name], id: id! }, { [kind]: on })
    }
    for (const id of previous) set(id, false)
    for (const id of kind === 'hover' ? (hoverId ? [hoverId] : []) : selectedIds) set(id, true)
    if (kind === 'selected') {
      // the shape points of the selected way come from the small highlight source
      const shape = selectedIds.flatMap((id) => (id[0] === 'w' ? wayVertices(this.data, id) : []))
      for (const vertex of shape) vertex.properties = { ...vertex.properties, state: 'shape' }
      void map
        .getSource<GeoJSONSource>(SOURCES.highlight)
        ?.setData({ type: 'FeatureCollection', features: shape })
    }
    // a feature that is not on the map changes nothing, so ask for a frame explicitly
    void map.once('render').then(shown)
    map.triggerRepaint()
  }

  /** The feature a pointer at this pixel would hit, in iD's priority: vertex, point, line, area */
  pick(
    point: { x: number; y: number },
    layerIds: string[],
    tolerance = 6,
    /** Ids that are not picked, for example the way that is being drawn */
    skip?: ReadonlySet<string>,
  ): string | null {
    const { map } = this
    if (!map) return null
    const features = map.queryRenderedFeatures(
      [
        [point.x - tolerance, point.y - tolerance],
        [point.x + tolerance, point.y + tolerance],
      ],
      { layers: layerIds },
    )
    return pickBest(skip ? features.filter((f) => !skip.has(f.id as string)) : features)
  }

  stats() {
    const { map } = this
    const drawn: Record<string, number> = {}
    if (map) {
      for (const name of SOURCE_NAMES) {
        try {
          const layers = [
            ...layersOfSource(map, SOURCES[name]),
            ...layersOfSource(map, EDIT_SOURCES[name]),
          ]
          const ids = new Set(map.queryRenderedFeatures({ layers }).map((f) => f.id))
          drawn[name] = ids.size
        } catch (error) {
          // MapLibre can throw "feature index out of bounds" here; keep the stats usable and visible
          console.error(`stats: queryRenderedFeatures failed for ${name}`, error)
          drawn[name] = -1
        }
      }
      drawn.layers = map.getStyle().layers.length
    }
    return {
      entities: this.data.counts(),
      drawn,
      hidden: { ...this.builder.hidden },
      loaded: { ...this.metrics.features },
      metrics: { ...this.metrics },
    }
  }
}

const PRIORITY: Record<string, number> = {
  [SOURCES.vertices]: 0, [EDIT_SOURCES.vertices]: 0,
  [SOURCES.points]: 1, [EDIT_SOURCES.points]: 1,
  [SOURCES.lines]: 2, [EDIT_SOURCES.lines]: 2,
  [SOURCES.areas]: 3, [EDIT_SOURCES.areas]: 3,
} // prettier-ignore

type Channel = {
  name: SourceName
  sourceId: string
  queue: Feature[]
  removals: string[]
  busy: boolean
  dirty: boolean
}

function makeChannels(ids: Record<SourceName, string>) {
  const channel = (name: SourceName): Channel => ({
    name,
    sourceId: ids[name],
    queue: [],
    removals: [],
    busy: false,
    dirty: false,
  })
  return {
    areas: channel('areas'),
    lines: channel('lines'),
    points: channel('points'),
    vertices: channel('vertices'),
  }
}

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
