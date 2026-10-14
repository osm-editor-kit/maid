import {
  createGates,
  createRemoteFetch,
  type Editor,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
/**
 * Loads OSM data for the viewport and keeps MapLibre's sources in sync.
 *
 * This is the one place that talks to MapLibre imperatively. The React layer components
 * declare sources and layers; the engine fills them with `updateData`, because re-sending
 * a whole FeatureCollection through React props on every tile would be the slow path we
 * want to avoid (see docs/research/maplibre.md).
 */
import { createFilterSet, type FilterSet } from '@osm-editor-kit/maid-filters'
import {
  type Action,
  actionAddEntity,
  actionAddMidpoint,
  actionChangeTags,
  actionMoveNode,
  type CombinedTags,
  type Difference,
  Graph,
  OsmWay,
  type OsmJsonElement,
  OsmNode,
} from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import type { Geometry, Preset } from '@osm-editor-kit/maid-presets'
import type { Lens, Tags } from '@osm-editor-kit/maid-style'
import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { dashPatterns, FeatureBuilder, type FeatureBatch, type SourceName } from './build'
import { Camera } from './camera'
import { type ChangeTagsResult, type TagChangeEach, type TagChangeRequest } from './change-tags'
import { SOURCE_NAMES } from './channels'
import { Clipboard } from './clipboard'
import { OsmData } from './data'
import { installDirectionImages } from './direction-images'
import { DragTool } from './drag'
import { DrawTool, nearestOnWay, projectedNodes } from './draw'
import { drawnCounts } from './drawn-counts'
import { entityInfo } from './entity-info'
import { featureId } from './feature-id'
import {
  drawnFieldOverlay,
  fieldOverlayFeatures,
  type FieldOverlay,
  type LonLat,
} from './field-overlay'
import { ACTIVE_SOURCE, activePinIds, EDIT_SOURCES, SELECT_SOURCES, SOURCES } from './layers'
import { MeasureSession } from './measure-session'
import { MidpointHandles } from './midpoint-handles'
import {
  boxesOf,
  centreOfBox,
  extentOfEntity,
  nearbyFeatures,
  type BoxEntry,
  type Nearby,
  type NearbyShape,
  overlaps,
  padBox,
  shapeOf,
} from './nearby'
import { operationContextOf } from './operation-context'
import { operationPreview } from './operation-preview'
import { pickAllFeatures, pickFeature } from './pick'
import { PresetsHold } from './presets-hold'
import { movedOf, redrawEntities } from './redraw'
import { relatedIds } from './related'
import { selectionShape } from './selection-shape'
import { Sender } from './sender'
import type { TagsOfFeature } from './set-tags-each'
import type { Loc, Point } from './snap'
import { TagEdits } from './tag-edits'
import { TileLoader } from './tile-loader'
import { TransformTool } from './transform'

export type EngineOptions = {
  /** The editor that owns the OSM data and the edit history. The engine reads and changes them there. */
  editor: Editor
  /** OSM API root, e.g. http://localhost:8090/s/medium */
  apiUrl: string
  /** Data loads from this OSM zoom on (iD: 16) */
  minDataZoom: number
  /** Filter states that differ from the editor's filters, as in the URL: `buildings:readonly` */
  filters?: string | null
  /**
   * Called with new features before they go to MapLibre, e.g. to add the images they need.
   * Images that arrive after a tile was laid out do not reliably show up in that tile.
   */
  prepare?: (batch: FeatureBatch) => Promise<void>
  /** Called when the set of dash patterns grew and the layers need to be rebuilt */
  onStyleChange?: () => void
  /**
   * How the engine sends its requests: the editor's `fetch` (gated per service, time-limited, paused on a
   * rate limit). Left out, the engine uses the same rules with gates of its own, for use on its own (tests).
   */
  fetch?: RemoteFetch
}

/** The engine on its own: the foundation's rules, with gates and a service of its own. */
const standaloneFetch = createRemoteFetch({ gates: createGates(), serviceOf: () => 'local' })

export type EngineMetrics = {
  tiles: number
  /** Relations loaded in full (`loadRelation`) */
  relations: number
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
  /** Time spent filling in icons after the presets arrived (all slices) */
  fillInMs: number
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
  /** True if a filter lets this entity be looked at but not changed */
  readOnly: boolean
}

/**
 * What a click on the map does. `browse` selects and drags; `add-point` places a new point and
 * returns to `browse`; `draw-line` and `draw-area` add a node per click until the way is finished;
 * in `move` and `rotate` the selection follows the pointer until a click.
 */
export type Mode = 'browse' | 'add-point' | 'draw-line' | 'draw-area' | 'move' | 'rotate'

export class MaidEngine {
  /** The OSM data: entities and edit history (from the editor), plus the indexes of the builder */
  data: OsmData
  metrics: EngineMetrics = {
    tiles: 0, relations: 0, updates: 0, compactions: 0, bytes: 0, fetchMs: 0, parseMs: 0, mergeMs: 0, buildMs: 0, pushMs: 0, fillInMs: 0,
    features: { areas: 0, lines: 0, points: 0, vertices: 0 },
  } // prettier-ignore

  private builder: FeatureBuilder
  /** The map the engine draws on, once attached */
  map?: MapLibreMap
  /** Map data tiles and relation loads: the requests, their timers and the rate-limit pause (tile-loader.ts) */
  readonly tiles: TileLoader
  /** The update channels to MapLibre, the live tier, compaction and the wait for them (sender.ts) */
  readonly sender: Sender
  private featureSource = new Map<string, SourceName>()
  private dashCount = 0
  private hoverId: string | null = null
  /** Everything that is selected, in the order it was selected. The first is what the inspector shows. */
  private selectedIds: string[] = []
  private shownHover: string | null = null
  private shownSelected: string[] = []
  /**
   * The copies of the hovered and selected points, by id: what the active source holds (ACTIVE_SOURCE in layers.ts),
   * from which the active pin is drawn. Sent whole on each change: a few features.
   */
  private activeCopies = new Map<string, Feature>()
  /** Only the selection is drawn, at any zoom. A view option: per visit, not stored. */
  private selectionOnlyShown = false

  // The data comes from the editor, so the engine and the editor's modules see the same entities.
  // Assigned here, not in field initializers, because the builder needs `data`.
  constructor(public options: EngineOptions) {
    this.data = new OsmData(options.editor.context, options.editor.history)
    // after OsmData's own listener, so the lookups are right when the redraw reads them
    options.editor.history.on('stagingchange', (difference) => this.onStagingChange(difference))
    this.builder = new FeatureBuilder(this.data, options.editor.presets)
    this.presetsHold = new PresetsHold({
      editor: options.editor,
      data: this.data,
      builder: this.builder,
      metrics: this.metrics,
      featureSource: this.featureSource,
      isLive: (source, id) => this.sender.live[source].has(id),
      push: (batch, tier) => this.push(batch, tier),
      wake: () => this.sender.wake(),
      changed: () => this.changed(),
    })
    this.filterSet = createFilterSet(options.editor.filters, options.filters)
    this.builder.filters = this.filterSet
    this.tiles = new TileLoader(
      {
        apiUrl: options.apiUrl,
        minDataZoom: options.minDataZoom,
        metrics: this.metrics,
        map: () => this.map,
        merge: (elements) => this.merge(elements),
        flushAll: () => this.sender.flushAll(),
        wake: () => this.sender.wake(),
        touch: () => this.sender.touch(),
      },
      options.fetch ?? standaloneFetch,
    )
    this.handles = new MidpointHandles({
      map: () => this.map,
      data: this.data,
      mayCompute: () =>
        this.currentMode === 'browse' &&
        !this.draw.active &&
        !this.transform.active &&
        !this.measuring,
      selected: () => this.selectedIds,
      isDrawn: (id) => this.featureSource.has(id),
      isReadOnly: (id) => this.isReadOnly(id),
      projected: (way) => projectedNodes(this, way),
      pushHighlight: () => this.pushHighlight(),
      busy: () => this.busy(),
      dragged: () => this.dragged,
      dragTo: (id, lon, lat, aim) => this.dragTo(id, lon, lat, aim),
      insertNode: (edge, loc) => {
        let id = ''
        this.change(() => {
          id = this.performNodeOn({ loc, edge })
        })
        return id
      },
    })
    this.camera = new Camera({ map: () => this.map, data: this.data, membersOf: this.membersOf })
    this.sender = new Sender({
      editor: options.editor,
      metrics: this.metrics,
      tiles: this.tiles,
      map: () => this.map,
      dragBusy: () => this.dragging.busy,
      presetsPending: () => this.presetsHold.pending,
      debugState: () => this.debugState(),
    })
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

  /** Tells the components that read the engine (`subscribe`) to read again. Public for the tools that edit (drag.ts). */
  changed() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  /** Points and vertices held for the presets, and the fill-in once they arrive (presets-hold.ts) */
  private presetsHold!: PresetsHold

  /** The tags an entity had when it was loaded, before any edit; undefined for one that was added here */
  baseTags(id: string) {
    return this.data.history.staging.graph.base.entities.get(id)?.tags
  }

  /**
   * The centre of a feature's extent (iD's extent.center()): a node's location, the middle of a way's or a relation's
   * box. Where the presets and fields with a location set are looked up. Undefined for an unknown id.
   */
  centreOf(id: string): LonLat | undefined {
    const graph = this.data.history.staging.graph
    const entity = graph.hasEntity(id)
    const box = entity && extentOfEntity(graph, entity)
    return box && centreOfBox(box)
  }

  private nearbyMemo?: { graph: Graph; id: string; metres: number; value: Nearby[] }
  private nearbyBoxes?: { graph: Graph; entries: BoxEntry[] }

  /**
   * The features near one feature, for the address field's suggestions (nearby.ts): the features within `metres` of
   * its extent, and whether an area encloses it. Asked only when an address field is shown; kept until the graph
   * changes, so a second ask for the same feature costs nothing.
   */
  nearby(id: string, metres = 200): Nearby[] {
    const graph = this.data.history.staging.graph
    const memo = this.nearbyMemo
    if (memo && memo.graph === graph && memo.id === id && memo.metres === metres) return memo.value
    let value: Nearby[] = []
    const entity = graph.hasEntity(id)
    const selected = entity && shapeOf(graph, id, entity)
    if (entity && selected) {
      if (this.nearbyBoxes?.graph !== graph) this.nearbyBoxes = { graph, entries: boxesOf(graph) }
      // the feature's own nodes are part of it, not its neighbours
      const excluded = new Set<string>([id])
      if (entity instanceof OsmWay) for (const node of entity.nodes) excluded.add(node)
      const near = padBox(selected.box, metres)
      const candidates: NearbyShape[] = []
      for (const { id: other, box } of this.nearbyBoxes.entries) {
        if (excluded.has(other) || !overlaps(box, near)) continue
        const found = graph.hasEntity(other)
        const shape = found && shapeOf(graph, other, found)
        if (shape) candidates.push(shape)
      }
      value = nearbyFeatures(selected, candidates, metres)
    }
    this.nearbyMemo = { graph, id, metres, value }
    return value
  }

  entity(id: string | null): EntityInfo | undefined {
    return entityInfo(this, id)
  }

  /** The node or way with this id in the current graph. Relations and unknown ids give undefined. */
  attach(map: MapLibreMap) {
    this.map = map
    // a frame drawn after the last data change: `settled()` needs one (see `dataSeq`)
    map.on('render', () => {
      this.sender.renderedSeq = this.sender.dataSeq
    })
    this.flushActive()
    // before the first tile is pushed: an image that arrives later does not show in that tile
    installDirectionImages(map)
    // the side line of a field depends on the view: its visible part may bend or leave the screen
    map.on('moveend', () => {
      this.refreshFieldOverlay()
      this.handles.refresh()
    })
    this.tiles.loadVisibleTiles()
  }

  osmZoom() {
    return this.tiles.osmZoom()
  }
  loadVisibleTiles() {
    this.tiles.loadVisibleTiles()
  }
  loadRelation(id: string) {
    return this.tiles.loadRelation(id)
  }
  loadEntity(id: string) {
    return this.tiles.loadEntity(id)
  }

  /** Merges elements of the API into the data and the map. Returns how many entities were new. */
  merge(elements: OsmJsonElement[]) {
    const t0 = performance.now()
    const added = this.data.merge(elements)
    const t1 = performance.now()
    const built = this.builder.build(added)
    const t2 = performance.now()
    // decided now, not when the images are ready: by then the first view may count as complete
    const tier = this.tiles.firstLoadDone ? 'live' : 'base'
    const batch = this.presetsHold.hold(built, tier)
    if (this.options.prepare) {
      // Areas and lines need no image, so they go to MapLibre at once and the worker tiles them while the shell
      // makes the pins and icons. Points and vertices wait for their images.
      this.push({ areas: batch.areas, lines: batch.lines, points: [], vertices: [] }, tier)
      const waiting: FeatureBatch = {
        areas: [],
        lines: [],
        points: batch.points,
        vertices: batch.vertices,
      }
      this.sender.preparing++
      void this.options.prepare(batch).finally(() => {
        this.sender.preparing--
        this.push(waiting, tier)
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
    return added.nodes.length + added.ways.length + added.relations.length
  }

  /** Sends features to MapLibre: to the live tier once the first view is complete, else to the big sources */
  private push(
    batch: FeatureBatch,
    tier: 'base' | 'live' = this.tiles.firstLoadDone ? 'live' : 'base',
  ) {
    for (const name of SOURCE_NAMES) {
      const features = batch[name]
      if (features.length === 0) continue
      this.metrics.features[name] += features.length
      let relatedArrived = false
      for (const f of features) {
        const id = featureId(f)
        if (id === undefined) continue
        this.featureSource.set(id, name)
        if (tier === 'live') this.sender.live[name].set(id, f)
        // a related feature that was not loaded when it was asked for gets its state now
        if (this.wantedRelated.has(id)) {
          this.appliedRelated.delete(id)
          relatedArrived = true
        }
      }
      if (relatedArrived) queueMicrotask(() => this.syncRelated())
      // a selection made before its feature was loaded (from the URL) is shown once it arrives
      if (
        this.selectedIds.length !== this.shownSelected.length &&
        features.some((f) => {
          const id = featureId(f)
          return id !== undefined && this.selectedIds.includes(id)
        })
      ) {
        queueMicrotask(() => this.applyHighlight([], 'selected'))
      }
      const channel = this.sender.channels[tier][name]
      channel.queue = channel.queue.concat(features)
      channel.dirty = true
      this.sender.scheduleFlush(channel)
    }
    this.pushSelect(batch)
    this.pushActive(batch)
    this.sender.touch()
  }

  /**
   * Sends a copy of each selected feature in the batch to the selection source (SELECT_SOURCES), whatever tier it
   * goes to: the layers draw it below the floor of the data (layers.ts). Called for every batch, so a selected
   * feature that loads or changes later is current there too.
   */
  private pushSelect(batch: FeatureBatch) {
    if (this.selectedIds.length === 0) return
    const selected = new Set(this.selectedIds)
    for (const name of SOURCE_NAMES) {
      const picked = batch[name].filter((f) => {
        const id = featureId(f)
        return id !== undefined && selected.has(id)
      })
      if (picked.length === 0) continue
      const channel = this.sender.channels.select[name]
      channel.queue = channel.queue.concat(picked)
      channel.dirty = true
      this.sender.scheduleFlush(channel)
    }
  }

  /**
   * A batch that arrives or changes (a load, an edit, a drag step): a wanted point in it replaces the copy held, so the
   * active pin follows the data. A wanted point that is not loaded yet gets its copy here when it arrives.
   */
  private pushActive(batch: FeatureBatch) {
    const wanted = new Set(activePinIds(this.hoverId, this.selectedIds))
    if (wanted.size === 0) return
    let changed = false
    for (const f of batch.points) {
      const id = featureId(f)
      if (id !== undefined && wanted.has(id)) {
        this.activeCopies.set(id, f)
        changed = true
      }
    }
    if (changed) this.flushActive()
  }

  /**
   * Brings the copies in line with the hovered and selected points: the copies of ids no longer wanted go, and each
   * wanted standalone point gets a copy (a node in a way is a vertex, which has no pin here). Called when the hover or
   * the selection changes, so a hover shows its pin when the source has it (a few features: cheap).
   */
  private syncActive() {
    const wanted = activePinIds(this.hoverId, this.selectedIds)
    let changed = false
    // deleting the entry being visited is safe for a Map
    for (const id of this.activeCopies.keys()) {
      if (wanted.includes(id)) continue
      this.activeCopies.delete(id)
      changed = true
    }
    for (const id of wanted) {
      // a point not loaded yet gets its copy when its batch arrives (pushActive)
      if (this.activeCopies.has(id) || !this.featureSource.has(id) || this.data.nodeWays.has(id))
        continue
      const point = this.redraw([{ id, moved: false }]).batch.points.find(
        (f) => featureId(f) === id,
      )
      if (point) {
        this.activeCopies.set(id, point)
        changed = true
      }
    }
    if (changed) this.flushActive()
  }

  /** Sends the copies to the active source: the whole set, which is a few features */
  private flushActive() {
    const source = this.map?.getSource<GeoJSONSource>(ACTIVE_SOURCE)
    if (!source) return
    this.sender.dataSeq++
    this.sender.activeSending++
    void source
      .setData({ type: 'FeatureCollection', features: [...this.activeCopies.values()] })
      .finally(() => {
        this.sender.activeSending--
        this.sender.dataSeq++
        this.sender.wake()
      })
  }

  /**
   * The selection's copies follow the selection: a feature that was deselected leaves the selection source, and
   * a feature that was selected now is built and sent there (a feature not loaded yet comes with its batch).
   */
  private syncSelectTier(previous: readonly string[], selected: readonly string[]) {
    const kept = new Set(selected)
    const before = new Set(previous)
    for (const id of previous) if (!kept.has(id)) this.dropFromSelectTier(id)
    const added = selected.filter((id) => !before.has(id) && this.featureSource.has(id))
    if (added.length === 0) return
    // the same features the data would be built as, for these ids only; pushSelect keeps the selected ones
    this.pushSelect(this.redraw(added.map((id) => ({ id, moved: false }))).batch)
  }

  private dropFromSelectTier(id: string) {
    const name = this.featureSource.get(id)
    if (!name) return
    const channel = this.sender.channels.select[name]
    // a copy still waiting to be sent goes too, so the next update does not bring it back
    channel.queue = channel.queue.filter((f) => featureId(f) !== id)
    channel.removals.push(id)
    channel.dirty = true
    this.sender.scheduleFlush(channel)
  }

  /** Only the selection is drawn, at any zoom, and the data is hidden (layers.ts `selectionOnly`). Per visit. */
  get selectionOnly() {
    return this.selectionOnlyShown
  }

  /**
   * Whether the selection's copies (the `--select` twins) have anything to draw: something is selected, or the data is
   * hidden. Read by MapView into `buildLayers` (layers.ts `selectTwins`); a change of the selection or of selectionOnly
   * calls `changed()`, so the layers follow.
   */
  get selectTwins() {
    return this.selectionOnlyShown || this.selectedIds.length > 0
  }

  setSelectionOnly(on: boolean) {
    if (on === this.selectionOnlyShown) return
    this.selectionOnlyShown = on
    this.changed()
  }

  /**
   * Starts the data again after an upload. The caller has reset the editor's history, so the data is
   * empty: the features come off the map, the loads in flight are cancelled, and the selection is the
   * one the server gave (`selection`). The visible tiles load again after `delayMs`, as iD and Rapid
   * wait for the server's replication. A pan within that wait loads the view at once.
   */
  reloadAfterUpload(selection: readonly string[], delayMs: number) {
    // OsmData updates these indexes only for what changes; after a reset they would still name the old data
    this.data.nodeUses.clear()
    this.data.nodeWays.clear()
    this.data.endpoints.clear()
    this.data.wayMultipolygons.clear()
    this.tiles.restart()
    this.rebuildAll()
    this.setSelected(selection)
    this.tiles.scheduleWake(Date.now() + delayMs)
    this.changed()
  }

  /**
   * Resolves when all requested tiles are merged and MapLibre has drawn them (see `Sender.settled`).
   */
  settled(timeoutMs = 60000) {
    return this.sender.settled(timeoutMs)
  }

  /**
   * What the engine is waiting for, in plain values: the counters `settled()` looks at and the state of each channel.
   * The benchmark writes it when a wait times out. Changes nothing.
   */
  debugState() {
    const channels: Record<
      string,
      { busy: boolean; dirty: boolean; queued: number; removals: number }
    > = {}
    for (const [tier, group] of Object.entries(this.sender.channels)) {
      for (const [name, channel] of Object.entries(group)) {
        channels[`${tier}/${name}`] = {
          busy: channel.busy,
          dirty: channel.dirty,
          queued: channel.queue.length,
          removals: channel.removals.length,
        }
      }
    }
    const tiles: Record<string, number> = {}
    for (const state of this.tiles.loads.tiles.values()) {
      tiles[state.status] = (tiles[state.status] ?? 0) + 1
    }
    return {
      inflight: this.tiles.inflight,
      pushing: this.sender.pushing(),
      parts: {
        preparing: this.sender.preparing,
        presetsPending: this.options.editor.presetsPending,
        fillingIn: this.presetsHold.fillingIn,
        held: this.presetsHold.heldCount,
        flushTimer: this.sender.flushTimer !== undefined,
        activeSending: this.sender.activeSending,
        dataSeq: this.sender.dataSeq,
        renderedSeq: this.sender.renderedSeq,
        dragBusy: this.dragging.busy,
        compacting: this.sender.compacting,
      },
      channels,
      tiles,
      pausedUntil: this.tiles.loads.pausedUntil,
      waiters: this.sender.waiters.length,
      firstLoadDone: this.tiles.firstLoadDone,
      selection: [...this.selectedIds],
      shown: { selected: [...this.shownSelected], hovered: this.shownHover },
      metrics: { ...this.metrics },
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
    // not announced to React: this runs on every pointer move, the commit at the end is announced
    this.change(() => this.data.history.perform(actionMoveNode(id, [lon, lat])), false)
    await Promise.all(
      Object.values(this.sender.channels.live).map((channel) => this.sender.channelIdle(channel)),
    )
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
        const id = featureId(f)
        if (id === undefined || this.sender.editing.has(id) || this.sender.live[name].has(id))
          continue
        this.sender.editing.add(id)
        this.map?.setFeatureState({ source: SOURCES[name], id }, { editing: true })
      }
    }
  }

  // --- Changing tags (tag-edits.ts) ---

  readonly tagEdits = new TagEdits(this)
  setTag(id: string, key: string, value: string | undefined) {
    this.tagEdits.setTag(id, key, value)
  }
  changeTags(
    ids: readonly string[],
    change: TagChangeRequest,
    annotation = 'Changed tags',
  ): ChangeTagsResult {
    return this.tagEdits.changeTags(ids, change, annotation)
  }
  changeTagsEach(changes: readonly TagChangeEach[], annotation = 'Changed tags'): ChangeTagsResult {
    return this.tagEdits.changeTagsEach(changes, annotation)
  }
  setTagsEach(changes: readonly TagsOfFeature[], annotation = 'Changed tags'): ChangeTagsResult {
    return this.tagEdits.setTagsEach(changes, annotation)
  }
  combinedTagsOf(ids: readonly string[]): CombinedTags {
    return this.tagEdits.combinedTagsOf(ids)
  }

  /** Replaces all tags of an entity, for example when a preset is chosen. One undo step. */
  setTags(id: string, tags: Tags, annotation = 'Changed tags') {
    if (!this.data.history.staging.graph.hasEntity(id) || this.isReadOnly(id)) return
    this.edit(actionChangeTags(id, tags), annotation, [id])
  }

  // --- Filters ---

  private filterSet: FilterSet

  /** The editor's filters with their current states */
  get filters() {
    return this.filterSet
  }

  /**
   * Changes the states of the filters. Every feature is built again, because a filter decides
   * whether an object has a feature at all; nothing is loaded again.
   */
  setFilters(filters: FilterSet) {
    if (filters === this.filterSet) return
    this.filterSet = filters
    this.builder.filters = filters
    this.rebuildAll()
    // what is selected may be hidden or read-only now
    this.setSelected(this.selectedIds.filter((id) => this.featureSource.has(id)))
    this.changed()
  }

  private lensState: Lens | null = null

  /** The lens the map is styled with, or null for the default look */
  get lens() {
    return this.lensState
  }

  /**
   * Restyles the map with a lens (lenses are data: see @osm-editor-kit/maid-style lens.ts), or
   * back to the default look with null. Every feature is built again, as for filters; nothing is
   * loaded again and the data does not change.
   */
  setLens(lens: Lens | null) {
    if (lens === this.lensState) return
    this.lensState = lens
    this.builder.lens = lens ?? undefined
    this.rebuildAll()
    this.setSelected(this.selectedIds.filter((id) => this.featureSource.has(id)))
    this.changed()
  }

  /** True if the filters let this entity be looked at but not changed */
  isReadOnly(id: string) {
    return this.builder.isReadOnly(id)
  }

  /** How many objects each filter hides, by filter id */
  hiddenCounts() {
    return this.builder.hidden
  }

  /** Takes every feature off the map and builds all of them again from the data */
  private rebuildAll() {
    const { map } = this
    if (this.draw.active) this.draw.cancel()
    for (const name of SOURCE_NAMES) {
      const ids = [...this.featureSource].filter(([, source]) => source === name).map(([id]) => id)
      for (const tier of ['base', 'live', 'select'] as const) {
        const channel = this.sender.channels[tier][name]
        // features that were still waiting to be sent are dropped with the rest
        channel.queue = []
        channel.removals = channel.removals.concat(ids)
        channel.dirty = true
      }
      this.sender.live[name].clear()
      // only where the state was set: MapLibre throws on its next frame when a key is removed
      // from a feature that has no state in that source
      for (const id of this.sender.editing) {
        const target = { source: SOURCES[name], id }
        if (map?.getFeatureState(target).editing !== undefined)
          map.removeFeatureState(target, 'editing')
      }
    }
    this.sender.editing.clear()
    this.featureSource.clear()
    this.builder.reset()
    // the copies are rebuilt from the data that comes back; a wanted point that is gone leaves no copy
    this.activeCopies.clear()
    this.push(this.builder.build(this.data.all()), 'base')
    this.flushActive()
    for (const channel of this.sender.allChannels()) void this.sender.flush(channel)
    queueMicrotask(() => this.applyHighlight([], 'selected'))
  }

  // --- Operations ---

  /** What an operation looks at: the current data and the selection */
  operationContext(): OperationContext {
    return operationContextOf(this.map, this.data, this.selectedIds)
  }

  /**
   * Runs an operation on the selection as one undo step. Returns what is selected afterwards, or
   * undefined if the operation does not apply or cannot run now.
   */
  runOperation(operation: Operation) {
    const context = this.operationContext()
    if (this.draw.active || this.selectedIds.some((id) => this.isReadOnly(id))) return
    if (!operation.applies(context) || operation.disabled(context)) return
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
    // an operation can delete what the pointer is over
    if (this.hoverId && this.data.history.staging.graph.hasEntity(this.hoverId) === undefined)
      this.setHover(null)
    return next
  }

  // --- Modes ---

  private currentMode: Mode = 'browse'
  /**
   * Where the pointer was last seen over the map, set by the map view: what keys that act
   * "here" (paste, Space while drawing) use. `layers` are the layers that can be snapped to.
   */
  pointer?: { point: { x: number; y: number }; lon: number; lat: number; layers: string[] }
  /** Drawing lines and areas */
  readonly draw = new DrawTool(this)
  /** Moving and rotating the selection with the pointer */
  readonly transform = new TransformTool(this)

  /** What a click on the map does now */
  get mode() {
    return this.currentMode
  }

  /**
   * Changes the mode. A way that is being drawn is finished first, as iD does, and so is a move
   * or rotation. `move` and `rotate` need a selection that can be changed; without one the mode
   * stays as it is and false is returned.
   */
  setMode(mode: Mode) {
    if (mode === this.currentMode) return true
    // a measure is not a mode of its own: a mode the editor changes to ends it, without a value
    this.cancelMeasure()
    if (this.draw.active) this.draw.finish()
    if (this.transform.active) this.transform.finish()
    if ((mode === 'move' || mode === 'rotate') && !this.transform.begin(mode, this.selectedIds))
      return false
    this.currentMode = mode
    // the handles are for browsing only: none while drawing or moving
    this.handles.compute()
    this.pushHighlight()
    this.changed()
    return true
  }

  // --- Copy and paste (clipboard.ts) ---

  readonly clipboard = new Clipboard(this)
  get canPaste() {
    return this.clipboard.canPaste
  }
  copy() {
    return this.clipboard.copy()
  }
  paste(lon: number, lat: number) {
    return this.clipboard.paste(lon, lat)
  }

  // --- Creating and deleting ---

  /**
   * Adds a node to the way under this screen position, on its line, as a double click on a way
   * does in iD. Returns the id of the new node, or undefined if there is no way to add to.
   */
  insertNode(point: { x: number; y: number }, layerIds: string[]) {
    const wayId = this.pick(point, layerIds)
    if (wayId?.[0] !== 'w' || this.isReadOnly(wayId)) return undefined
    const way = this.data.way(wayId)
    const on = way && nearestOnWay(this, way, point)
    // a double click inside an area is not on its line
    if (!on) return undefined
    return this.addNodeOn(on)
  }

  /**
   * Adds a new node on the line of a way, between the two nodes of `on`, as a node of that way. One
   * undo step. Returns the id of the new node.
   */
  addNodeOn(on: { loc: Loc; edge: [string, string] }) {
    let id = ''
    this.change(() => {
      id = this.performNodeOn(on)
      this.data.history.commit({ annotation: 'Added a node to a way', selectedIDs: [id] })
    })
    return id
  }

  /** The node of addNodeOn, in the work in progress and without a commit: the caller commits (a handle drag does). */
  private performNodeOn(on: { loc: Loc; edge: [string, string] }) {
    const node = new OsmNode(this.data.context, { loc: on.loc })
    this.data.history.perform(actionAddEntity(node), actionAddMidpoint(on, node))
    return node.id
  }

  /** Adds a standalone point and returns its id (negative, as for every new entity). One undo step. */
  addPoint(lon: number, lat: number, tags: Tags = {}) {
    const node = new OsmNode(this.data.context, { loc: [lon, lat], tags })
    this.edit(actionAddEntity(node), 'Added a point', [node.id])
    return node.id
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

  private redraw(entities: Iterable<{ id: string; moved: boolean }>) {
    return redrawEntities(this.data, this.builder, this.featureSource, entities)
  }

  /** Takes features out of the sources they are drawn in, in both tiers */
  private removeFeatures(remove: [SourceName, string][]) {
    let activeChanged = false
    for (const [name, featureId] of remove) {
      this.featureSource.delete(featureId)
      for (const tier of ['base', 'live', 'select'] as const) {
        const channel = this.sender.channels[tier][name]
        channel.removals.push(featureId)
        channel.dirty = true
        void this.sender.flush(channel)
      }
      this.sender.live[name].delete(featureId)
      if (this.activeCopies.delete(featureId)) activeChanged = true
    }
    if (activeChanged) this.flushActive()
  }

  /** Sends a batch the way an edit does: to the live tier, hiding the originals there */
  private sendBatch(batch: FeatureBatch) {
    this.hideOriginals(batch)
    this.push(batch, 'live')
  }

  // --- Undo and redo ---

  /** What undo and redo would do now, with the annotations of the edits they would step over */
  undoState() {
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

  /** True while a drag, a drawing or a move is under way: the history is not stepped through then */
  private busy() {
    return (
      this.dragged !== undefined ||
      this.handles.pressing ||
      this.draw.active ||
      this.transform.active ||
      this.measuring
    )
  }

  /** Takes back the last edit and redraws what it changed. Does nothing while a vertex is dragged. */
  undo() {
    if (this.busy() || this.data.history.getUndoAnnotation() === undefined) return
    this.change(() => this.data.history.undo())
  }

  /** Puts back the edit that the last undo took back, and redraws what it changed. */
  redo() {
    if (this.busy() || this.data.history.getRedoAnnotation() === undefined) return
    this.change(() => this.data.history.redo())
  }

  /**
   * Groups changes of the history: runs `step` (actions with or without a commit, a revert, undo or
   * redo) and then redraws every entity its differences name, each once. A change made outside
   * of `change`, for example by a module through `editor.history`, is redrawn as well, one
   * difference at a time. `notify: false` leaves React alone, for changes on every pointer move.
   */
  change(step: () => void, notify = true) {
    if (this.collecting) {
      // already inside a group: its end redraws
      step()
      return
    }
    const differences: Difference[] = []
    this.collecting = differences
    try {
      step()
    } catch (error) {
      // an action that fails half-way must not leave its first half to be committed with the
      // next edit: take the work in progress back, then tell the caller
      this.data.history.revert()
      throw error
    } finally {
      this.collecting = undefined
      this.redrawDifferences(differences)
    }
    if (notify) this.changed()
  }

  /** The differences of the group that is running, see `change` */
  private collecting?: Difference[]

  /** Every change of the history arrives here. Created entities get their features, deleted ones lose them. */
  private onStagingChange(difference: Difference) {
    if (this.collecting) {
      this.collecting.push(difference)
      return
    }
    this.redrawDifferences([difference])
    this.changed()
  }

  private redrawDifferences(differences: Difference[]) {
    // the members of a selected relation are its members now: a member added or removed changes the set
    const relationChanged = differences.some((difference) =>
      [...difference.changes.keys()].some((id) => id[0] === 'r' && this.selectedIds.includes(id)),
    )
    if (relationChanged) {
      this.selectionRelated = this.relatedOfSelection()
      this.syncRelated()
    }
    const moved = movedOf(differences)
    if (moved.size === 0) return
    const { batch, remove } = this.redraw(
      [...moved].map(([id, isMoved]) => ({ id, moved: isMoved })),
    )
    this.removeFeatures(remove)
    this.sendBatch(batch)
    // the shape points of the selection follow its nodes, when one of them or a selected way changed
    for (const id of moved.keys())
      if (this.shapeNodes.has(id) || this.selectedIds.includes(id)) {
        this.refreshShape()
        break
      }
    // feature state belongs to a source: a feature that changed its source needs it again
    if (remove.some(([, featureId]) => this.selectedIds.includes(featureId)))
      queueMicrotask(() => this.applyHighlight([], 'selected'))
    let relatedGone = false
    for (const [, featureId] of remove)
      relatedGone = this.appliedRelated.delete(featureId) || relatedGone
    if (relatedGone) queueMicrotask(() => this.syncRelated())
  }

  // --- Dragging a vertex (drag.ts) ---

  readonly dragging = new DragTool(this)
  get dragged() {
    return this.dragging.node
  }
  get dragRefusal() {
    return this.dragging.refusal
  }
  snapAt(point: Point, layers: string[], skip: ReadonlySet<string>) {
    return this.dragging.snapAt(point, layers, skip)
  }
  isDraggable(id: string | null): id is string {
    return this.dragging.isDraggable(id)
  }
  dragTo(
    id: string,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ) {
    this.dragging.dragTo(id, lon, lat, aim)
  }
  settleDrag() {
    return this.dragging.settleDrag()
  }
  stopDrag() {
    this.dragging.stopDrag()
  }
  endDrag() {
    return this.dragging.endDrag()
  }

  // --- Relations: members highlighted, zoom to them, load them in full ------------

  private membersOf = (relationId: string) => this.data.relation(relationId)?.members

  /** What a relation covers on the map: its members, and their members one level down (see related.ts) */
  relatedOf(id: string) {
    return relatedIds(id, this.membersOf)
  }

  // --- The camera: turning and fitting (camera.ts) ---

  readonly camera: Camera
  get turnedAt() {
    return this.camera.turnedAt
  }
  get turning() {
    return this.camera.turning
  }
  startTurn(point: Point) {
    this.camera.startTurn(point)
  }
  moveTurn(point: Point) {
    this.camera.moveTurn(point)
  }
  endTurn() {
    this.camera.endTurn()
  }
  turnBy(degrees: number) {
    this.camera.turnBy(degrees)
  }
  resetNorth() {
    this.camera.resetNorth()
  }
  fitTo(ids: readonly string[]) {
    return this.camera.fitTo(ids)
  }

  /** Relation members of the selection: a selected relation's members are related */
  private selectionRelated: readonly string[] = []
  /** Ids the inspector asked to be related: a relation row, or a member row (setRelated) */
  private hoverRelated: readonly string[] = []
  /** Every id that should carry the `related` state now */
  private wantedRelated: ReadonlySet<string> = new Set()
  /** The ids that carry the `related` state on the map */
  private appliedRelated = new Set<string>()

  /**
   * Highlights these entities as related: a calmer halo than hover. Replaces the set given before;
   * `null` clears it. The members of a selected relation are related on their own, while it is
   * selected. Only the feature state changes: no feature is rebuilt.
   */
  setRelated(ids: readonly string[] | null) {
    this.hoverRelated = ids ?? []
    this.syncRelated()
  }

  /** Sets and clears the `related` state so that the map shows `wantedRelated`; only what changed is touched */
  private syncRelated() {
    this.wantedRelated = new Set([...this.selectionRelated, ...this.hoverRelated])
    const { map } = this
    if (!map) return
    // deleting the current entry while a Set is walked is safe
    for (const id of this.appliedRelated) {
      if (this.wantedRelated.has(id)) continue
      this.paintRelated(id, false)
      this.appliedRelated.delete(id)
    }
    for (const id of this.wantedRelated) {
      if (this.appliedRelated.has(id) || !this.featureSource.has(id)) continue
      this.paintRelated(id, true)
      this.appliedRelated.add(id)
    }
    map.triggerRepaint()
  }

  /** Sets the `related` state of a loaded feature in the big source and in the live tier, as applyHighlight does */
  private paintRelated(id: string, on: boolean) {
    const name = this.featureSource.get(id)
    if (!name || !this.map) return
    this.map.setFeatureState({ source: SOURCES[name], id }, { related: on })
    this.map.setFeatureState({ source: EDIT_SOURCES[name], id }, { related: on })
  }

  /** The members of every selected relation, as the selection's related set */
  private relatedOfSelection() {
    const out = new Set<string>()
    for (const id of this.selectedIds)
      if (id[0] === 'r') for (const x of this.relatedOf(id)) out.add(x)
    return [...out]
  }

  // --- Hover and selection ---------------------------------------------------

  setHover(id: string | null) {
    if (id === this.hoverId) return
    const previous = this.hoverId
    this.hoverId = id
    this.applyHighlight(previous ? [previous] : [], 'hover')
    this.syncActive()
  }

  /** Selects one entity, several, or nothing */
  setSelected(selection: string | readonly string[] | null) {
    const ids =
      selection === null ? [] : typeof selection === 'string' ? [selection] : [...selection]
    const previous = this.selectedIds
    if (ids.length === previous.length && ids.every((id, i) => id === previous[i])) return
    this.selectedIds = ids
    this.syncSelectTier(previous, ids)
    this.syncActive()
    this.tiles.keepRelations(ids)
    this.applyHighlight(previous, 'selected')
    this.selectionRelated = this.relatedOfSelection()
    this.syncRelated()
    this.changed()
  }

  /**
   * Stops what the engine has in flight: map data tiles and relation loads are aborted, and the timer for
   * the next request is cleared. For an engine that is not used any more.
   */
  destroy() {
    this.presetsHold.destroy()
    this.tiles.destroy()
  }

  /** The ids that are selected (what was asked for; `selected()` is what the map shows) */
  get selection() {
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
      // the copy the layers draw below the data's floor has the same state (the halo, the pin)
      map.setFeatureState({ source: SELECT_SOURCES[name], id: id! }, { [kind]: on })
    }
    for (const id of previous) set(id, false)
    for (const id of kind === 'hover' ? (hoverId ? [hoverId] : []) : selectedIds) set(id, true)
    if (kind === 'selected') {
      // the field that had the focus was about the selection before: it goes with it
      this.fieldOverlay = null
      this.fieldFeatures = []
      this.refreshShape()
    }
    // a feature that is not on the map changes nothing, so ask for a frame explicitly
    void map.once('render').then(shown)
    map.triggerRepaint()
  }

  private refreshShape() {
    const shape = selectionShape(this.data, this.selectedIds)
    this.shapeNodes = shape.nodes
    this.shapeFeatures = shape.features
    // a preview was for the selection and the data as they were
    this.previewFeatures = []
    this.handles.compute()
    this.pushHighlight()
  }

  private shapeFeatures: Feature[] = []
  private previewFeatures: Feature[] = []

  private pushHighlight() {
    void this.map?.getSource<GeoJSONSource>(SOURCES.highlight)?.setData({
      type: 'FeatureCollection',
      features: [
        ...this.shapeFeatures,
        ...this.handles.list,
        ...this.previewFeatures,
        ...this.fieldFeatures,
        ...this.measure.features,
      ],
    })
  }

  // --- Midpoint handles: a node added to a selected way by a press on the middle of a segment (midpoint-handles.ts) ---

  readonly handles: MidpointHandles
  get midpointFeatures() {
    return this.handles.list
  }
  midpointAt(point: Point, tolerance?: number) {
    return this.handles.at(point, tolerance)
  }
  get pressingHandle() {
    return this.handles.pressing
  }
  pressMidpoint(point: Point) {
    return this.handles.press(point)
  }
  moveHandle(
    point: Point,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ) {
    this.handles.move(point, lon, lat, aim)
  }

  private fieldOverlay: FieldOverlay | null = null
  private fieldFeatures: Feature[] = []

  /**
   * What a field that has the focus or the pointer on it is about, drawn on the selected way: a
   * side line or a width band (field-overlay.ts). Only for exactly one selected way. Nothing is
   * rebuilt per pointer move: this is one or two features. `null` takes it away.
   */
  setFieldOverlay(overlay: FieldOverlay | null) {
    this.fieldOverlay = overlay
    this.refreshFieldOverlay()
  }

  private refreshFieldOverlay() {
    // the field's overlay is kept as it is; while a measure runs it is not drawn (drawnFieldOverlay)
    const overlay = drawnFieldOverlay(this.fieldOverlay, this.measuring)
    const id = this.selectedIds.length === 1 ? this.selectedIds[0] : undefined
    const way = overlay && id?.[0] === 'w' ? this.data.way(id) : undefined
    const map = this.map
    const line: LonLat[] = []
    if (way) {
      for (const nodeId of way.nodes) {
        const loc = this.data.node(nodeId)?.loc
        if (loc) line.push([loc[0], loc[1]])
      }
    }
    const features =
      way && overlay && map && line.length >= 2
        ? fieldOverlayFeatures(overlay, line, {
            closed: way.nodes[0] === way.nodes[way.nodes.length - 1],
            viewport: {
              width: map.getContainer().clientWidth,
              height: map.getContainer().clientHeight,
            },
            project: (p) => {
              const at = map.project(p)
              return [at.x, at.y]
            },
          })
        : []
    if (features.length === 0 && this.fieldFeatures.length === 0) return
    this.fieldFeatures = features
    this.pushHighlight()
  }

  // --- Measuring a distance on the map, for a width field (measure.ts, measure-session.ts) ---

  readonly measure = new MeasureSession({
    busy: () => this.busy(),
    clearHover: () => this.setHover(null),
    refresh: () => {
      this.handles.compute()
      this.refreshFieldOverlay()
      this.pushHighlight()
      this.changed()
    },
    pushHighlight: () => this.pushHighlight(),
  })
  subscribeMeasure = this.measure.subscribe
  getMeasureVersion = this.measure.getVersion
  get measureSpots() {
    return this.measure.spots
  }
  get measuring() {
    return this.measure.active
  }
  get measureFeatures() {
    return this.measure.features
  }
  startMeasure(done: (metres: number | undefined) => void) {
    this.measure.begin(done)
  }
  measureClick(lon: number, lat: number) {
    this.measure.click(lon, lat)
  }
  measureMove(lon: number, lat: number, touch = false) {
    this.measure.move(lon, lat, touch)
  }
  cancelMeasure() {
    this.measure.cancel()
  }

  /**
   * Shows what an operation would do to the selection, before it runs: the outlines the selected
   * ways would have, drawn dashed over the map. `null` takes the preview away. Nothing is
   * changed: the operation's actions run on a copy of the graph that is thrown away.
   * Operations that move no node (reverse, split, ...) show nothing.
   */
  previewOperation(operation: Operation | null) {
    const features =
      operation && !this.draw.active
        ? operationPreview(operation, this.operationContext(), this.data, this.selectedIds)
        : []
    if (features.length === 0 && this.previewFeatures.length === 0) return
    this.previewFeatures = features
    this.pushHighlight()
  }

  /** The nodes that are shown as shape points now, to know when they have to be drawn again */
  private shapeNodes: ReadonlySet<string> = new Set()

  /** The feature a pointer at this pixel would hit, in iD's priority: vertex, point, line, area */
  pick(
    point: { x: number; y: number },
    layerIds: string[],
    tolerance = 6,
    /** Ids that are not picked, for example the way that is being drawn */
    skip?: ReadonlySet<string>,
  ) {
    return pickFeature(this, point, layerIds, tolerance, skip)
  }

  /**
   * Every feature at this pixel, each once: the one `pick` returns first, then the others by
   * layer priority and by size (pick-order.ts). For a click that lists what lies on top of each
   * other; not for pointer moves, as it reads the data of every candidate. Coinciding features
   * (two points at one place, a way and an area on its outline) are all there.
   */
  pickAll(point: { x: number; y: number }, layerIds: string[], tolerance = 6) {
    return pickAllFeatures(this, point, layerIds, tolerance)
  }

  stats() {
    const drawn = drawnCounts(this.map)
    return {
      entities: this.data.counts(),
      drawn,
      hidden: { ...this.builder.hidden },
      loaded: { ...this.metrics.features },
      metrics: { ...this.metrics },
    }
  }
}
