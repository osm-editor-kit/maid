import {
  createGates,
  createRemoteFetch,
  type Editor,
  HttpError,
  RateLimitedError,
  type RemoteFetch,
  toOsmZoom,
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
  actionConnect,
  actionCopyEntities,
  actionChangeTags,
  actionMoveNode,
  type CombinedTags,
  combinedTags,
  type Difference,
  Graph,
  OsmWay,
  type OsmJsonElement,
  OsmNode,
} from '@osm-editor-kit/maid-model'
import type { Operation, OperationContext } from '@osm-editor-kit/maid-operations'
import type { Geometry, Preset, Presets } from '@osm-editor-kit/maid-presets'
import { hasInterestingTags, type Lens, type Tags } from '@osm-editor-kit/maid-style'
import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { dashPatterns, FeatureBuilder, type FeatureBatch, type SourceName } from './build'
import {
  type ChangeTagsResult,
  planChangeTags,
  planChangeTagsEach,
  type TagChangeEach,
  type TagChangeRequest,
} from './change-tags'
import { type Channel, makeChannels, SOURCE_NAMES } from './channels'
import { OsmData } from './data'
import { installDirectionImages } from './direction-images'
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
import { distanceMetres, measureFeatures as measureOnMap } from './measure'
import { midpointFeatures, segmentsOf, type MidpointFeature, type Segment } from './midpoints'
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
import { movedOf, redrawEntities } from './redraw'
import { boundsOf, relatedIds } from './related'
import { selectionShape } from './selection-shape'
import { planSetTagsEach, type TagsOfFeature } from './set-tags-each'
import type { Loc, Point, SnapTarget } from './snap'
import { aimAtNode, snapTargetAt } from './snap-aim'
import { lat2y, lon2x, x2lon, y2lat } from './tile-coords'
import {
  createTileLoads,
  nearestFirst,
  notePause,
  outcomeOf,
  planLoads,
  resetLoads,
  settleLoad,
  TILE_TIMEOUT_MS,
  tileKey,
  tileXY,
  type TileKey,
  type TileLoads,
} from './tile-loading'
import { actionMoveNodes, fromMercator, nodesOf, toMercator, TransformTool } from './transform'
import { dragTurn, TURN_TOLERANCE } from './turn'

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

/** MapLibre zoom (512 px) of the largest zoom fitTo goes to (OSM 19): a single node or a short way is not zoomed in to the last level */
const FIT_MAX_ZOOM = 18
/** MapLibre zoom (512 px) of a single point in fitTo (OSM 18), unless the map is already closer */
const POINT_ZOOM = 17

/** The MapLibre state that `settled()` waits on, in plain values, for diagnostics */
function mapState(map: MapLibreMap) {
  return {
    loaded: map.loaded(),
    areTilesLoaded: map.areTilesLoaded(),
    moving: map.isMoving(),
    zoom: map.getZoom(),
  }
}

/** How long points and vertices wait for presets that are being made before they are drawn without icons */
const PRESETS_HOLD_MS = 300
/** After this, an engine that holds features starts the presets itself, if nobody has */
const PRESETS_START_MS = 100

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
  /** Map data tiles: their state, and the rate-limit pause that holds them (tile-loading.ts) */
  private tileLoads: TileLoads = createTileLoads()
  /** The one timer for the next moment a wanted tile may be asked (the end of a wait or of a pause) */
  private wakeTimer?: ReturnType<typeof setTimeout>
  private readonly remote: RemoteFetch
  private inflight = 0
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
    /** The selection's copies (SELECT_SOURCES): what is drawn below the floor of the data (layers.ts) */
    select: makeChannels(SELECT_SOURCES),
  }
  /** Only the selection is drawn, at any zoom. A view option: per visit, not stored. */
  private selectionOnlyShown = false
  /** After the first view is complete, new data goes to the live tier */
  private firstLoadDone = false
  private compacting = false
  private compactTimer?: ReturnType<typeof setTimeout>

  // The data comes from the editor, so the engine and the editor's modules see the same entities.
  // Assigned here, not in field initializers, because the builder needs `data`.
  constructor(public options: EngineOptions) {
    this.data = new OsmData(options.editor.context, options.editor.history)
    // after OsmData's own listener, so the lookups are right when the redraw reads them
    options.editor.history.on('stagingchange', (difference) => this.onStagingChange(difference))
    this.builder = new FeatureBuilder(this.data, options.editor.presets)
    // presets that are made after the first picture: the icons of what was built without them are filled in
    this.stopPresets = options.editor.onPresets((presets) => presets && this.fillInPresets(presets))
    this.filterSet = createFilterSet(options.editor.filters, options.filters)
    this.builder.filters = this.filterSet
    this.remote = options.fetch ?? standaloneFetch
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

  /** The editor's presets: undefined while they are being made (`editor.presetsPending`) */
  private get presets(): Presets | undefined {
    return this.options.editor.presets
  }
  private stopPresets: () => void
  /** Slices of the fill-in after the presets arrived that are still to run; `settled()` waits for them */
  private fillingIn = 0
  private fillTimer?: ReturnType<typeof setTimeout>

  /**
   * Points and vertices of tiles that arrived while the presets were still being made. Their icons come from the
   * presets, so they wait for them (at most `PRESETS_HOLD_MS`) instead of being drawn bare and drawn again: lines and
   * areas, which do not depend on the presets, go to the map at once. Released when the presets arrive, or when the
   * time is up (then `fillInPresets` adds the icons later). `settled()` counts them as work in progress.
   */
  private held: { id: string; source: 'points' | 'vertices'; tier: 'base' | 'live' }[] = []
  private holdTimer?: ReturnType<typeof setTimeout>
  private safetyTimer?: ReturnType<typeof setTimeout>

  /** Takes the points and vertices out of a batch to hold them. Returns the batch as it is to be sent now. */
  private holdForPresets(batch: FeatureBatch, tier: 'base' | 'live') {
    if (!this.options.editor.presetsPending) return batch
    for (const source of ['points', 'vertices'] as const) {
      for (const feature of batch[source]) {
        const id = featureId(feature)
        // an untagged vertex (a junction, the end of a way) has no icon to wait for
        if (id === undefined || (source === 'vertices' && !feature.properties?.t)) continue
        this.held.push({ id, source, tier })
      }
    }
    if (this.held.length === 0) return batch
    const holding = new Set(this.held.map((entry) => entry.id))
    batch = {
      ...batch,
      points: batch.points.filter((f) => !holding.has(String(featureId(f)))),
      vertices: batch.vertices.filter((f) => !holding.has(String(featureId(f)))),
    }
    // The shell starts the presets once `ready` is over (loadPresetsAfterReady) and `settled()` asks for them. This is
    // the net for an engine that has neither: a little later, not at once, because running the presets chunk in the
    // task of the first tile would delay whatever else is waiting for the main thread then (`ready`).
    this.safetyTimer ??= setTimeout(() => void this.options.editor.loadPresets(), PRESETS_START_MS)
    this.holdTimer ??= setTimeout(() => this.releaseHeld(), PRESETS_HOLD_MS)
    return batch
  }

  /** Sends what was held, built again with the presets if they are there (with no icon if the time was up) */
  private releaseHeld() {
    clearTimeout(this.holdTimer)
    this.holdTimer = undefined
    const held = this.held
    if (held.length === 0) return
    this.held = []
    const sends = new Map<string, FeatureBatch>()
    for (const { id, source, tier } of held) {
      const node = this.data.node(id)
      if (!node) continue
      const feature =
        source === 'points' ? this.builder.buildPoint(node) : this.builder.buildVertex(node)
      if (!feature) continue
      let batch = sends.get(tier)
      if (!batch) sends.set(tier, (batch = { areas: [], lines: [], points: [], vertices: [] }))
      batch[source].push(feature)
    }
    for (const [tier, batch] of sends) this.push(batch, tier as 'base' | 'live')
    this.wake()
  }

  /**
   * The presets arrived after features were built without them. Presets only decorate the first picture: they give
   * a pin or a vertex its icon (nothing else a feature is drawn as depends on them: the geometry class comes from the
   * style package's own area keys). So the points and vertices that are drawn are built again, and only those that
   * now have an icon are sent, in slices of about 8 ms with a pause between them, as updates by id (no geometry of a
   * line or an area is touched). When the presets are there before the first tile, nothing was built and there is
   * nothing to do. Edited features (live tier) are replaced in the live tier, the others in the big sources.
   */
  private fillInPresets(presets: Presets) {
    this.builder.presets = presets
    // what is drawn already was built without them (the held features are not drawn yet)
    const ids: string[] = []
    for (const [id, source] of this.featureSource) {
      if (source === 'points' || source === 'vertices') ids.push(id)
    }
    // what waited for the presets is built with them, and is not drawn bare at all
    this.releaseHeld()
    // the type of a selected feature, read from the presets: whoever shows it reads it again
    this.changed()
    if (ids.length === 0) return
    this.fillingIn++
    let at = 0
    const slice = () => {
      this.fillTimer = undefined
      const started = performance.now()
      const base: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
      const live: FeatureBatch = { areas: [], lines: [], points: [], vertices: [] }
      while (at < ids.length && performance.now() - started < 8) {
        const id = ids[at++]!
        const source = this.featureSource.get(id)
        const node = this.data.node(id)
        if (
          (source !== 'points' && source !== 'vertices') ||
          !node ||
          !hasInterestingTags(node.tags)
        )
          continue
        const feature =
          source === 'points' ? this.builder.buildPoint(node) : this.builder.buildVertex(node)
        // a feature that has no icon with the presets is as it was
        if (!feature?.properties?.icon) continue
        ;(this.live[source].has(id) ? live : base)[source].push(feature)
      }
      this.push(base, 'base')
      this.push(live, 'live')
      this.metrics.fillInMs += performance.now() - started
      if (at < ids.length) {
        this.fillTimer = setTimeout(slice, 0)
        return
      }
      this.fillingIn--
      this.wake()
    }
    this.fillTimer = setTimeout(slice, 0)
  }

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
      this.renderedSeq = this.dataSeq
    })
    this.flushActive()
    // before the first tile is pushed: an image that arrives later does not show in that tile
    installDirectionImages(map)
    // the side line of a field depends on the view: its visible part may bend or leave the screen
    map.on('moveend', () => {
      this.refreshFieldOverlay()
      this.refreshMidpoints()
    })
    this.loadVisibleTiles()
  }

  /** OSM zoom (256px tiles) of the map (`toOsmZoom` in maid-core) */
  osmZoom() {
    return toOsmZoom(this.map?.getZoom() ?? 0)
  }

  loadVisibleTiles() {
    const { map } = this
    this.touch()
    if (!map) return
    // below the minimum zoom nothing is wanted, so the loads in flight are cancelled
    const wanted: TileKey[] = []
    if (this.osmZoom() >= this.options.minDataZoom) {
      const bounds = map.getBounds()
      const x0 = lon2x(bounds.getWest())
      const x1 = lon2x(bounds.getEast())
      const y0 = lat2y(bounds.getNorth())
      const y1 = lat2y(bounds.getSouth())
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const inView: [number, number][] = []
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) inView.push([x, y])
      }
      // centre first, like a person would want it
      for (const [x, y] of nearestFirst(inView, [cx, cy])) wanted.push(tileKey(x, y))
    }
    this.requestTiles(wanted)
  }

  /**
   * Asks for the wanted tiles that may be asked now, in the order given, and cancels the loads of tiles
   * that are no longer wanted. Then sets the wake-up for the next wait or pause that ends.
   */
  private requestTiles(wanted: readonly TileKey[]) {
    const plan = planLoads(this.tileLoads, wanted, Date.now())
    for (const { key, controller } of plan.start) void this.loadTile(key, controller)
    this.scheduleWake(plan.nextWakeAt)
  }

  /** One timer for the next moment a wanted tile may be asked. It asks again for the view as it is then. */
  private scheduleWake(at: number | undefined) {
    clearTimeout(this.wakeTimer)
    this.wakeTimer = undefined
    if (at === undefined) return
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = undefined
        this.loadVisibleTiles()
      },
      Math.max(0, at - Date.now()),
    )
  }

  private async loadTile(key: TileKey, controller: AbortController) {
    const [x, y] = tileXY(key)
    this.inflight++
    try {
      const bbox = [x2lon(x), y2lat(y + 1), x2lon(x + 1), y2lat(y)].join(',')
      const url = `${this.options.apiUrl}/api/0.6/map.json?bbox=${bbox}`
      const t0 = performance.now()
      const res = await this.remote(url, { signal: controller.signal, timeoutMs: TILE_TIMEOUT_MS })
      if (!res.ok) throw new HttpError(res.status, url)
      const text = await res.text()
      const t1 = performance.now()
      const json = JSON.parse(text) as { elements: OsmJsonElement[] }
      const t2 = performance.now()
      // a request that was cancelled meanwhile (the tile left the view) is not used
      if (!settleLoad(this.tileLoads, key, controller, { kind: 'loaded' }, Date.now())) return
      this.metrics.tiles++
      this.metrics.bytes += text.length
      this.metrics.fetchMs += t1 - t0
      this.metrics.parseMs += t2 - t1
      this.merge(json.elements)
    } catch (error) {
      const outcome = outcomeOf(error, controller.signal)
      const current = settleLoad(this.tileLoads, key, controller, outcome, Date.now())
      if (outcome.kind !== 'aborted') console.error(error)
      // a failed tile has a wait, and a paused service has an end: plan again when they end
      const waits = current && (outcome.kind === 'failed' || outcome.kind === 'refused')
      if (waits || outcome.kind === 'rateLimited') this.loadVisibleTiles()
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

  /** Merges elements of the API into the data and the map. Returns how many entities were new. */
  merge(elements: OsmJsonElement[]) {
    const t0 = performance.now()
    const added = this.data.merge(elements)
    const t1 = performance.now()
    const built = this.builder.build(added)
    const t2 = performance.now()
    // decided now, not when the images are ready: by then the first view may count as complete
    const tier = this.firstLoadDone ? 'live' : 'base'
    const batch = this.holdForPresets(built, tier)
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
      this.preparing++
      void this.options.prepare(batch).finally(() => {
        this.preparing--
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
  private push(batch: FeatureBatch, tier: 'base' | 'live' = this.firstLoadDone ? 'live' : 'base') {
    for (const name of SOURCE_NAMES) {
      const features = batch[name]
      if (features.length === 0) continue
      this.metrics.features[name] += features.length
      let relatedArrived = false
      for (const f of features) {
        const id = featureId(f)
        if (id === undefined) continue
        this.featureSource.set(id, name)
        if (tier === 'live') this.live[name].set(id, f)
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
      const channel = this.channels[tier][name]
      channel.queue = channel.queue.concat(features)
      channel.dirty = true
      this.scheduleFlush(channel)
    }
    this.pushSelect(batch)
    this.pushActive(batch)
    this.touch()
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
      const channel = this.channels.select[name]
      channel.queue = channel.queue.concat(picked)
      channel.dirty = true
      this.scheduleFlush(channel)
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
    this.dataSeq++
    this.activeSending++
    void source
      .setData({ type: 'FeatureCollection', features: [...this.activeCopies.values()] })
      .finally(() => {
        this.activeSending--
        this.dataSeq++
        this.wake()
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
    const channel = this.channels.select[name]
    // a copy still waiting to be sent goes too, so the next update does not bring it back
    channel.queue = channel.queue.filter((f) => featureId(f) !== id)
    channel.removals.push(id)
    channel.dirty = true
    this.scheduleFlush(channel)
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
    return [
      ...Object.values(this.channels.base),
      ...Object.values(this.channels.live),
      ...Object.values(this.channels.select),
    ]
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
      this.dataSeq++
      await source.updateData({ add, remove })
      await this.tilesReloaded(channel.sourceId)
    } finally {
      this.dataSeq++
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
    resetLoads(this.tileLoads)
    for (const entry of this.relationLoads.values()) {
      entry.controller.abort(new DOMException('the data was reloaded', 'AbortError'))
    }
    this.relationLoads.clear()
    this.firstLoadDone = false
    this.rebuildAll()
    this.setSelected(selection)
    this.scheduleWake(Date.now() + delayMs)
    this.changed()
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
        const done = features.flatMap((f) => {
          const id = featureId(f)
          return id !== undefined && this.live[name].get(id) === f ? [id] : []
        })
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
  /** Counts every change of what a source holds (start and end of each update). `render` copies it to `renderedSeq`. */
  private dataSeq = 0
  private renderedSeq = 0
  /** Updates of the active source that MapLibre has not confirmed yet */
  private activeSending = 0

  private pushing() {
    return (
      this.preparing > 0 ||
      this.activeSending > 0 ||
      this.flushTimer !== undefined ||
      this.dragBusy ||
      this.compacting ||
      this.fillingIn > 0 ||
      this.held.length > 0 ||
      this.allChannels().some((channel) => channel.busy || channel.dirty)
    )
  }

  /**
   * Resolves when all requested tiles are merged and MapLibre has drawn them. Every wait in here is bounded (250 ms,
   * 2 s, or the deadline), so this either resolves or throws with the state that was waiting; it never hangs silently.
   */
  async settled(timeoutMs = 60000) {
    const { map } = this
    if (!map) throw new Error('Engine is not attached to a map')
    const deadline = performance.now() + timeoutMs
    for (;;) {
      if (performance.now() > deadline) {
        throw new Error(
          `Maid did not settle in ${timeoutMs}ms: ${JSON.stringify({
            map: mapState(map),
            engine: this.debugState(),
          })}`,
        )
      }
      this.loadVisibleTiles()
      // the presets are made after the first picture: they are work in progress until they are there and the
      // icons of what was drawn without them are filled in (`pushing` counts the fill-in)
      const { editor } = this.options
      if (editor.presetsPending) {
        await editor.loadPresets()
        continue
      }
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
      await this.nextIdle(map)
      // Back to the top (and so to the deadline) unless every condition holds on this very check: nothing in flight,
      // no update on its way, MapLibre has every source loaded and all tiles, has not moved, and has drawn a frame
      // after the last change of any source's data. A timer never ends the wait.
      if (
        this.inflight === 0 &&
        !this.pushing() &&
        map.loaded() &&
        map.areTilesLoaded() &&
        !map.isMoving() &&
        this.sourcesLoaded(map) &&
        this.renderedSeq === this.dataSeq
      )
        return
    }
  }

  /** True when MapLibre holds every source the engine feeds as loaded (no tile of it is being rebuilt) */
  private sourcesLoaded(map: MapLibreMap) {
    return [ACTIVE_SOURCE, ...this.allChannels().map((channel) => channel.sourceId)].every(
      (id) => !map.getSource(id) || map.isSourceLoaded(id),
    )
  }

  /**
   * Resolves at MapLibre's next `idle`, or after 2 s if there is none. A frame is requested first, so the state is
   * looked at again on a frame that is drawn. The listener is removed either way: a timer that wins leaves none behind.
   * The caller checks the state again after this returns, so a missed idle only costs the 2 s.
   */
  private nextIdle(map: MapLibreMap) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        map.off('idle', done)
        resolve()
      }
      const timer = setTimeout(done, 2000)
      map.on('idle', done)
      map.triggerRepaint()
    })
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
    for (const [tier, group] of Object.entries(this.channels)) {
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
    for (const state of this.tileLoads.tiles.values()) {
      tiles[state.status] = (tiles[state.status] ?? 0) + 1
    }
    return {
      inflight: this.inflight,
      pushing: this.pushing(),
      parts: {
        preparing: this.preparing,
        presetsPending: this.options.editor.presetsPending,
        fillingIn: this.fillingIn,
        held: this.held.length,
        flushTimer: this.flushTimer !== undefined,
        activeSending: this.activeSending,
        dataSeq: this.dataSeq,
        renderedSeq: this.renderedSeq,
        dragBusy: this.dragBusy,
        compacting: this.compacting,
      },
      channels,
      tiles,
      pausedUntil: this.tileLoads.pausedUntil,
      waiters: this.waiters.length,
      firstLoadDone: this.firstLoadDone,
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
        const id = featureId(f)
        if (id === undefined || this.editing.has(id) || this.live[name].has(id)) continue
        this.editing.add(id)
        this.map?.setFeatureState({ source: SOURCES[name], id }, { editing: true })
      }
    }
  }

  // --- Changing tags ---

  /**
   * Sets or removes one tag of an entity and redraws it with the look the new tags give it.
   * Local only: nothing is uploaded. The change is one undo step.
   */
  setTag(id: string, key: string, value: string | undefined) {
    if (value === undefined || value === '') this.changeTags([id], { remove: [key] })
    else this.changeTags([id], { set: { [key]: value } })
  }

  /**
   * Writes a change to the tags of several features as one undo step, with the label `annotation`.
   * `set` writes a key to every feature, `remove` deletes it where present (see `cleanTagChange`: an
   * empty `set` value is dropped, so a blank never clears a key). A feature that the change leaves as
   * it is is not touched. Refused, with nothing written, when an id is not in the graph or when any
   * selected feature is read-only: the result says how many of how many are read-only.
   * Redraws every changed feature, as for any tag change.
   */
  changeTags(
    ids: readonly string[],
    change: TagChangeRequest,
    annotation = 'Changed tags',
  ): ChangeTagsResult {
    const plan = planChangeTags(this.data.history.staging.graph, ids, change, (id) =>
      this.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.data
      this.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs: [...new Set(ids)] })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * `changeTags` with each feature's own change: `changes` lists the features and what each one writes (a
   * sheet of several features renames a key on each feature and keeps that feature's value). One undo step,
   * with the same refusals as `changeTags`: nothing is written when a feature is missing or read-only.
   */
  changeTagsEach(changes: readonly TagChangeEach[], annotation = 'Changed tags'): ChangeTagsResult {
    const plan = planChangeTagsEach(this.data.history.staging.graph, changes, (id) =>
      this.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.data
      const selectedIDs = [...new Set(changes.map((change) => change.id))]
      this.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * Writes each feature its own full tags (a key not listed is removed) as one undo step, with the
   * label `annotation`: the type picker gives each feature the new preset's tags, computed from its
   * own. Same refusals and result as `changeTags` (see `planSetTagsEach`); a feature whose tags are
   * already those is not touched. Redraws every changed feature.
   */
  setTagsEach(changes: readonly TagsOfFeature[], annotation = 'Changed tags'): ChangeTagsResult {
    const plan = planSetTagsEach(this.data.history.staging.graph, changes, (id) =>
      this.isReadOnly(id),
    )
    if (!plan.ok) return plan
    if (plan.changed > 0) {
      const { history } = this.data
      const selectedIDs = [...new Set(changes.map((change) => change.id))]
      this.change(() => {
        history.perform(...plan.actions)
        history.commit({ annotation, selectedIDs })
      })
    }
    return { ok: true, changed: plan.changed }
  }

  /**
   * The combined tags of several features, for the inspector: per key the one value every feature has,
   * or the values that differ (see `combinedTags` in the model). For one feature every key is `one`.
   * Reads the staging graph. An id that is not in the graph is left out.
   */
  combinedTagsOf(ids: readonly string[]): CombinedTags {
    const graph = this.data.history.staging.graph
    const tagsOfEach: Tags[] = []
    for (const id of ids) {
      const entity = graph.hasEntity(id)
      if (entity) tagsOfEach.push(entity.tags)
    }
    return combinedTags(tagsOfEach)
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
        const channel = this.channels[tier][name]
        // features that were still waiting to be sent are dropped with the rest
        channel.queue = []
        channel.removals = channel.removals.concat(ids)
        channel.dirty = true
      }
      this.live[name].clear()
      // only where the state was set: MapLibre throws on its next frame when a key is removed
      // from a feature that has no state in that source
      for (const id of this.editing) {
        const target = { source: SOURCES[name], id }
        if (map?.getFeatureState(target).editing !== undefined)
          map.removeFeatureState(target, 'editing')
      }
    }
    this.editing.clear()
    this.featureSource.clear()
    this.builder.reset()
    // the copies are rebuilt from the data that comes back; a wanted point that is gone leaves no copy
    this.activeCopies.clear()
    this.push(this.builder.build(this.data.all()), 'base')
    this.flushActive()
    for (const channel of this.allChannels()) void this.flush(channel)
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
    this.computeMidpoints()
    this.pushHighlight()
    this.changed()
    return true
  }

  // --- Copy and paste ---

  /** What Cmd+C took: ids and the graph they are read from when pasted */
  private clipboard?: { ids: string[]; graph: Graph }

  /** True if something was copied and can be pasted */
  get canPaste() {
    return this.clipboard !== undefined
  }

  /** Remembers the selection for `paste`. Returns false if nothing is selected. */
  copy() {
    if (this.selectedIds.length === 0) return false
    this.clipboard = { ids: [...this.selectedIds], graph: this.data.history.stable.graph }
    return true
  }

  /**
   * Adds copies of what was copied, with their middle at this place, as one undo step, and
   * returns the ids of the copies. Relations are copied with new members, as in iD.
   */
  paste(lon: number, lat: number) {
    const { clipboard } = this
    if (!clipboard || this.draw.active || this.transform.active) return []
    // the graph is the state at the time of the copy; what was not in it cannot be copied
    const ids = clipboard.ids.filter((id) => clipboard.graph.hasEntity(id) !== undefined)
    if (ids.length === 0) return []
    const action = actionCopyEntities(ids, clipboard.graph)
    let pasted: string[] = []
    this.change(() => {
      const { history } = this.data
      history.perform(action)
      const copies = action.copies()
      pasted = ids.map((id) => copies[id]?.id).filter((id) => id !== undefined)
      // move the copies as a whole so that their middle is where the pointer is
      const nodes = [...nodesOf(this, pasted)].map((id) => ({
        id,
        at: toMercator(this.data.node(id)?.loc ?? [0, 0]),
      }))
      if (nodes.length > 0) {
        const to = toMercator([lon, lat])
        const dx = to[0] - nodes.reduce((sum, n) => sum + n.at[0], 0) / nodes.length
        const dy = to[1] - nodes.reduce((sum, n) => sum + n.at[1], 0) / nodes.length
        // one action for all the nodes: one commit, not one per node
        history.perform(
          actionMoveNodes(
            nodes.map((n) => [n.id, fromMercator([n.at[0] + dx, n.at[1] + dy])] as const),
          ),
        )
      }
      const what = pasted.length === 1 ? 'a feature' : `${pasted.length} features`
      history.commit({ annotation: `Pasted ${what}`, selectedIDs: pasted })
    })
    this.setSelected(pasted)
    return pasted
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
        const channel = this.channels[tier][name]
        channel.removals.push(featureId)
        channel.dirty = true
        void this.flush(channel)
      }
      this.live[name].delete(featureId)
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
      this.handlePress !== undefined ||
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

  // --- Dragging a vertex ---

  private dragTarget?: { id: string; lon: number; lat: number }
  /** The vertex being dragged: its moves become one undo step when the drag ends */
  private dragged?: string
  private dragBusy = false
  /**
   * What the dragged node is over at the last step: a node or a way it would snap to, and the
   * reason a drop there would be refused. Undefined while nothing is aimed at (Alt, drawing).
   */
  private dragAim?: { target?: SnapTarget; refused?: string }

  /** Why the drop at the pointer would be refused, while a drag is over a target that is not allowed */
  get dragRefusal() {
    return this.dragAim?.refused
  }

  /**
   * What a screen point lands on for a snap: a node (a vertex or a point) within SNAP_PX first,
   * else the line of the nearest way within SNAP_PX. Features in `skip`, read-only features and
   * anything not in `layers` (the layers a click uses, so no hidden feature) are not targets. One
   * query of the rendered features around the point.
   */
  snapAt(point: Point, layers: string[], skip: ReadonlySet<string>) {
    return snapTargetAt(this, point, layers, skip)
  }

  private aimAt(id: string, point: Point, layers: string[]) {
    return aimAtNode(this, id, point, layers)
  }

  /** True if this id is a node that can be dragged: a vertex or a standalone point */
  isDraggable(id: string | null): id is string {
    return !!id && id[0] === 'n' && this.data.node(id) !== undefined && !this.isReadOnly(id)
  }

  /**
   * Call on every pointer move while a vertex is held. Positions that arrive while the map is
   * still drawing the previous one are dropped in favour of the latest, so the vertex never
   * lags behind by more than one update.
   */
  dragTo(
    id: string,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ) {
    // Aimed (a vertex or a point dragged by the map view): the node snaps to what is under the pointer,
    // unless Alt is held. A refused target keeps the node at the pointer; the drop takes it back.
    const aimed = aim && !aim.free ? this.aimAt(id, aim.point, aim.layers) : undefined
    this.dragAim = aimed
    if (aim) {
      const hover = aimed?.target
      this.setHover(hover ? (hover.type === 'node' ? hover.id : hover.wayId) : id)
    }
    const at: Loc = aimed?.target && !aimed.refused ? aimed.target.loc : [lon, lat]
    this.dragTarget = { id, lon: at[0], lat: at[1] }
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

  /**
   * Call when the vertex is released. The drag is one undo step: the move, and the connection when
   * the node was dropped on a node or a way (the oldest node of a connected pair survives, as iD does).
   * A refused drop is taken back, so the node is where the drag started. Resolves with the node the
   * selection should show after a connection (`selected`), and with the reason of a refusal.
   */
  async endDrag() {
    // a press on a handle that never moved is over: it added nothing
    this.handlePress = undefined
    await this.settleDrag()
    const id = this.dragged
    const added = this.handleNode
    const aim = this.dragAim
    this.handleNode = undefined
    this.dragged = undefined
    this.dragAim = undefined
    const { history } = this.data
    const result: { selected?: string; refused?: string } = {}
    if (id && history.hasWorkInProgress) {
      const target = aim?.target
      if (aim?.refused) {
        this.change(() => history.revert())
        result.refused = aim.refused
      } else if (target?.type === 'node') {
        const standalone = !this.data.nodeWays.get(id)?.length
        this.change(() => {
          history.perform(actionConnect([id, target.id]))
          // the connect keeps the oldest of the two: the dragged node, or the one it was dropped on
          const survivor = history.staging.graph.hasEntity(id) ? id : target.id
          history.commit({
            annotation: standalone ? 'Connected a point to a node' : 'Connected a way to a node',
            selectedIDs: [survivor],
          })
          result.selected = survivor
        })
      } else if (target?.type === 'way' && this.data.node(id)) {
        const node = this.data.node(id)!
        const standalone = !this.data.nodeWays.get(id)?.length
        this.change(() => {
          // the dragged node keeps its id and its tags: it is inserted into the way at the snapped place
          history.perform(actionAddMidpoint({ loc: target.loc, edge: target.edge }, node))
          history.commit({
            annotation: standalone ? 'Connected a point to a way' : 'Connected a way to a way',
            selectedIDs: [id],
          })
        })
      } else {
        // a node that a handle drag made is a new node of the way, not a moved one
        const annotation = id === added ? 'Added a node to a way' : 'Moved a node'
        history.commit({ annotation, selectedIDs: [id] })
      }
    }
    if (id) this.setHover(result.selected ?? id)
    this.changed()
    // the moved features stay in the live tier until compaction
    this.touch()
    this.wake()
    return result
  }

  // --- Relations: members highlighted, zoom to them, load them in full ------------

  private membersOf = (relationId: string) => this.data.relation(relationId)?.members

  /** What a relation covers on the map: its members, and their members one level down (see related.ts) */
  relatedOf(id: string) {
    return relatedIds(id, this.membersOf)
  }

  /** Relation loads in flight by relation id: a second call for the same relation shares the request */
  private relationLoads = new Map<string, { load: Promise<number>; controller: AbortController }>()

  /**
   * Loads a relation in full, as iD's `/relation/ID/full` call does: the relation, its node members,
   * its way members with their nodes, and its member relations (one level, not their members). One
   * request to `apiUrl`, merged like a map tile, so the members enter the data and the map. Nothing
   * is written to the history: loading is not an edit. Resolves with how many entities were new;
   * rejects with a message when the API cannot be asked or does not answer with the relation.
   */
  loadRelation(id: string) {
    const running = this.relationLoads.get(id)
    if (running) return running.load.then((added) => ({ added }))
    // cancelled when the engine is destroyed or the relation is no longer selected (setSelected, destroy)
    const controller = new AbortController()
    const load = this.fetchRelation(id, controller.signal)
    const entry = { load, controller }
    this.relationLoads.set(id, entry)
    const forget = () => {
      if (this.relationLoads.get(id) === entry) this.relationLoads.delete(id)
    }
    load.then(forget, forget)
    return load.then((added) => ({ added }))
  }

  /**
   * Loads one entity that is not in the data, as iD's `loadEntity` does: a node by its own call, a way with its
   * nodes, a relation with its members (`/full`). For the member of a relation that the map tiles did not bring.
   * Merged like `loadRelation`; resolves with how many entities were new.
   */
  async loadEntity(id: string) {
    if (id.startsWith('r')) return this.loadRelation(id)
    const match = /^([nw])(\d+)$/.exec(id)
    if (!match) throw new Error(`Not an OSM element: ${id}`)
    const path = match[1] === 'n' ? `node/${match[2]}.json` : `way/${match[2]}/full.json`
    // not kept in `relationLoads`: a member is asked for by a click, and a second click merges the same data again
    const added = await this.fetchElements(path, new AbortController().signal)
    return { added }
  }

  private fetchRelation(id: string, signal: AbortSignal) {
    const match = /^r(\d+)$/.exec(id)
    if (!match) throw new Error(`Not a relation: ${id}`)
    return this.fetchElements(`relation/${match[1]}/full.json`, signal)
  }

  /** One call to `apiUrl` under `/api/0.6/` that answers with elements, merged into the data */
  private async fetchElements(path: string, signal: AbortSignal) {
    const url = `${this.options.apiUrl}/api/0.6/${path}`
    const t0 = performance.now()
    const res = await this.remote(url, { signal }).catch((error: unknown) => {
      if (error instanceof HttpError) throw new Error(`OSM API answered ${error.status}`)
      if (error instanceof RateLimitedError) {
        // the service is paused: the map's tiles wait for the same pause
        notePause(this.tileLoads, error.until)
        this.loadVisibleTiles()
        throw new Error(`OSM API answered ${error.status}`)
      }
      throw new Error(
        `no answer from the OSM API (${error instanceof Error ? error.message : String(error)})`,
      )
    })
    if (!res.ok) throw new Error(`OSM API answered ${res.status}`)
    const text = await res.text()
    const t1 = performance.now()
    const json = JSON.parse(text) as { elements: OsmJsonElement[] }
    const t2 = performance.now()
    this.metrics.relations++
    this.metrics.bytes += text.length
    this.metrics.fetchMs += t1 - t0
    this.metrics.parseMs += t2 - t1
    // each element once: the API answers each one once, but a merge must not count one twice
    const seen = new Set<string>()
    const elements = json.elements.filter((e) => {
      const key = `${e.type}${e.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return this.merge(elements)
  }

  // --- Turning the map (bearing; tilt is switched off, see MapView) ---

  /** A turn with the mouse in progress: where the press was, where the pointer is, and whether it moved */
  private turnDrag: { start: Point; last: Point; moved: boolean } | undefined
  /** When the last turn that moved ended (performance.now). The click MapLibre sends after it is not a click. */
  turnedAt = Number.NEGATIVE_INFINITY

  /** True from the press to the release of a turn with the mouse */
  get turning() {
    return this.turnDrag !== undefined
  }

  /** A turn with the mouse starts at `point`. The caller has checked that the press is on open map. */
  startTurn(point: Point) {
    this.turnDrag = { start: point, last: point, moved: false }
  }

  /**
   * The pointer moved during a turn: the map turns around the centre of the view (turn.ts). Set on the
   * map directly, because a turn runs on every pointer move and React would render on each one.
   */
  moveTurn(point: Point) {
    const drag = this.turnDrag
    const map = this.map
    if (!drag || !map) return
    const { clientWidth, clientHeight } = map.getContainer()
    const turn = dragTurn(drag.last, point, { x: clientWidth / 2, y: clientHeight / 2 })
    drag.last = point
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > TURN_TOLERANCE)
      drag.moved = true
    if (turn !== 0) map.setBearing(map.getBearing() + turn)
  }

  /** The turn ends with the release of the mouse */
  endTurn() {
    const drag = this.turnDrag
    this.turnDrag = undefined
    if (drag?.moved) this.turnedAt = performance.now()
  }

  // The camera moves below are imperative: react-map-gl has no prop for a one-off camera move, and the
  // map is uncontrolled (MapView passes initialViewState once).
  /** Turns the map by `degrees` in a short ease: the keys (Shift with the arrows) */
  turnBy(degrees: number) {
    const map = this.map
    if (map) map.easeTo({ bearing: map.getBearing() + degrees, duration: 100 })
  }

  /** Turns the map back to north: the compass button and N */
  resetNorth() {
    this.map?.easeTo({ bearing: 0, duration: 300 })
  }

  /**
   * Moves the map to show these entities: the bounds of their loaded geometry, with padding. A
   * relation counts as its members (see relatedIds). Returns false when none of it is loaded.
   * The zoom limits are MapLibre zoom (POINT_ZOOM, FIT_MAX_ZOOM), one level below iD's and Rapid's.
   * The turn of the map is kept: MapLibre would otherwise bring it back to north.
   * Imperative: a one-off camera move, which react-map-gl has no prop for (see turnBy).
   */
  fitTo(ids: readonly string[]) {
    const { map } = this
    const bounds = boundsOf(ids, {
      loc: (id) => this.data.node(id)?.loc,
      nodesOf: (id) => this.data.way(id)?.nodes,
      membersOf: this.membersOf,
    })
    if (!map || !bounds) return false
    const [west, south, east, north] = bounds
    if (west === east && south === north) {
      map.easeTo({
        center: [west, south],
        zoom: Math.min(Math.max(map.getZoom(), POINT_ZOOM), FIT_MAX_ZOOM),
        bearing: map.getBearing(),
        duration: 400,
      })
    } else {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 80, maxZoom: FIT_MAX_ZOOM, bearing: map.getBearing(), duration: 400 },
      )
    }
    return true
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
    // a relation load belongs to the selection that asked for it: once that is gone, the load is cancelled
    for (const [id, entry] of this.relationLoads) {
      if (!ids.includes(id))
        entry.controller.abort(new DOMException(`${id} is no longer selected`, 'AbortError'))
    }
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
    this.stopPresets()
    clearTimeout(this.fillTimer)
    clearTimeout(this.holdTimer)
    clearTimeout(this.safetyTimer)
    this.held = []
    this.fillingIn = 0
    clearTimeout(this.wakeTimer)
    this.wakeTimer = undefined
    resetLoads(this.tileLoads)
    for (const entry of this.relationLoads.values()) {
      entry.controller.abort(new DOMException('the engine was destroyed', 'AbortError'))
    }
    this.relationLoads.clear()
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
    this.computeMidpoints()
    this.pushHighlight()
  }

  private shapeFeatures: Feature[] = []
  private previewFeatures: Feature[] = []

  private pushHighlight() {
    void this.map?.getSource<GeoJSONSource>(SOURCES.highlight)?.setData({
      type: 'FeatureCollection',
      features: [
        ...this.shapeFeatures,
        ...this.midpointList,
        ...this.previewFeatures,
        ...this.fieldFeatures,
        ...this.measureList,
      ],
    })
  }

  // --- Midpoint handles: a node added to a selected way by a press on the middle of a segment ---

  /** The handles on the map now (midpoints.ts): one per segment of a selected way that is long enough and in view */
  private midpointList: MidpointFeature[] = []

  /** The handles on the map now. Public for the browser checks. */
  get midpointFeatures() {
    return this.midpointList
  }

  /**
   * Works out the handles for the selected ways. Only in browse mode, only for ways that are on the map
   * and can be changed, and only for a segment whose parent ways can all be changed too: the node
   * of a handle goes into each of them. Nothing is sent: `refreshShape` and `refreshMidpoints` do that.
   */
  private computeMidpoints() {
    const { map } = this
    this.midpointList = []
    if (
      !map ||
      this.currentMode !== 'browse' ||
      this.draw.active ||
      this.transform.active ||
      this.measuring
    )
      return
    const segments: Segment[] = []
    for (const id of this.selectedIds) {
      if (id[0] !== 'w' || !this.featureSource.has(id) || this.isReadOnly(id)) continue
      const way = this.data.way(id)
      if (way) segments.push(...segmentsOf(projectedNodes(this, way)))
    }
    if (segments.length === 0) return
    const container = map.getContainer()
    this.midpointList = midpointFeatures(
      segments,
      { width: container.clientWidth, height: container.clientHeight },
      (p) => {
        const at = map.unproject([p.x, p.y])
        return [at.lng, at.lat]
      },
    ).filter((f) => this.midpointMayChange(f.properties.edge))
  }

  /** True if every way that a node added on this segment would join is on the map and can be changed */
  private midpointMayChange(edge: readonly [string, string]) {
    const [a, b] = edge
    const bWays = new Set(this.data.nodeWays.get(b) ?? [])
    return (this.data.nodeWays.get(a) ?? []).every(
      (wayId) => !bWays.has(wayId) || (this.featureSource.has(wayId) && !this.isReadOnly(wayId)),
    )
  }

  /** After the view moved: the handles are the ones in view now. Not per frame, and nothing when no way is selected. */
  private refreshMidpoints() {
    if (this.selectedIds.length === 0 && this.midpointList.length === 0) return
    this.computeMidpoints()
    this.pushHighlight()
  }

  /** The handle under a screen point, if there is one: its segment and where it is on the ground */
  midpointAt(
    point: Point,
    tolerance = HANDLE_PX,
  ): { edge: [string, string]; loc: Loc } | undefined {
    const { map } = this
    if (!map) return undefined
    for (const feature of this.midpointList) {
      const [lon, lat] = feature.geometry.coordinates as Loc
      const at = map.project([lon, lat])
      if (Math.hypot(at.x - point.x, at.y - point.y) <= tolerance)
        return { edge: feature.properties.edge, loc: [lon, lat] }
    }
    return undefined
  }

  /** The press on a handle that has not moved yet. The node is made on the first real move (`moveHandle`). */
  private handlePress?: { edge: [string, string]; loc: Loc; start: Point }
  /** The node that a handle drag made, so the drag's undo step is named for what it did */
  private handleNode?: string

  /** True between a press on a handle and its release */
  get pressingHandle() {
    return this.handlePress !== undefined
  }

  /**
   * A press at a screen point: on a handle, it is taken as the start of a handle drag and true is returned.
   * Nothing is changed by the press itself: a press with no move adds nothing (see endDrag).
   */
  pressMidpoint(point: Point) {
    if (this.busy()) return false
    const handle = this.midpointAt(point)
    if (!handle) return false
    this.handlePress = { ...handle, start: point }
    return true
  }

  /**
   * A pointer move while a handle is pressed. Until the pointer is HANDLE_DRAG_PX away from the press, nothing
   * happens. Then the node is added on the segment (inside the drag's work in progress, so the drag is one
   * undo step) and the drag goes on as a drag of that node: dragTo, with the same snapping as any node.
   */
  moveHandle(
    point: Point,
    lon: number,
    lat: number,
    aim?: { point: Point; layers: string[]; free: boolean },
  ) {
    const press = this.handlePress
    if (!press) return
    let id = this.dragged
    if (id === undefined) {
      if (Math.hypot(point.x - press.start.x, point.y - press.start.y) < HANDLE_DRAG_PX) return
      id = this.insertHandleNode(press.edge, press.loc)
    }
    this.dragTo(id, lon, lat, aim)
  }

  /** The node of a handle drag: added on the segment, in the work in progress (the drag commits it) */
  private insertHandleNode(edge: [string, string], loc: Loc) {
    let id = ''
    this.change(() => {
      id = this.performNodeOn({ loc, edge })
    })
    this.handleNode = id
    return id
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

  // --- Measuring a distance on the map, for a width field (measure.ts) ---

  /** What a measure gives when it ends: the metres of the second click, or undefined when cancelled. Set while measuring. */
  private measureDone?: (metres: number | undefined) => void
  /** The first click of the measure, once it is made */
  private measureStart?: LonLat
  /** The line and the label from the first click to the pointer: empty until there is a first click and a move */
  private measureList: Feature[] = []
  /** Where the pointer is while measuring, and whether it is a finger: the magnifier follows it, before the first click too */
  private measurePointer?: { lon: number; lat: number; touch: boolean }
  private measureListeners = new Set<() => void>()
  private measureVersion = 0

  /**
   * Subscribes to the measure's moves and clicks. Its own channel: `subscribe` tells every React
   * component of the editor, and a pointer move while measuring must not make them all read again.
   */
  subscribeMeasure = (listener: () => void) => {
    this.measureListeners.add(listener)
    return () => this.measureListeners.delete(listener)
  }
  getMeasureVersion = () => this.measureVersion

  private measureChanged() {
    this.measureVersion++
    for (const listener of this.measureListeners) listener()
  }

  /**
   * The measure's first click and the pointer, for the magnifier (MeasureLoupe). `start` is undefined
   * until the first click; `pointer` is undefined until the pointer has moved over the map.
   */
  get measureSpots() {
    return { start: this.measureStart, pointer: this.measurePointer }
  }

  /**
   * True from startMeasure until the second click or a cancel. While it is, clicks and moves go to the
   * measure (measureClick, measureMove), and busy() is true: no selection, drag, handle or undo.
   */
  get measuring() {
    return this.measureDone !== undefined
  }

  /** The features of the measure on the map now. Public for the browser checks. */
  get measureFeatures() {
    return this.measureList
  }

  /**
   * Starts a measure: the first click on the map sets its start, the second ends it, and `done` is called
   * once with the distance on the ground in metres. `cancelMeasure` calls it with undefined. A measure that
   * is under way is cancelled first. Refused while a drawing, a move, a rotation or a drag is under way: `done`
   * is then called at once with undefined.
   */
  startMeasure(done: (metres: number | undefined) => void) {
    this.cancelMeasure()
    if (this.busy()) {
      done(undefined)
      return
    }
    this.measureDone = done
    // the hover of before the measure does not stay on the feature under it
    this.setHover(null)
    this.computeMidpoints()
    // the field's band is not drawn while the measure runs (drawnFieldOverlay)
    this.refreshFieldOverlay()
    this.pushHighlight()
    this.changed()
  }

  /** A click on the map while measuring: the first sets the start, the second ends the measure with its distance */
  measureClick(lon: number, lat: number) {
    if (!this.measureDone) return
    if (this.measureStart === undefined) {
      this.measureStart = [lon, lat]
      this.measureChanged()
      return
    }
    this.finishMeasure(distanceMetres(this.measureStart, [lon, lat]))
  }

  /**
   * A pointer move while measuring: the magnifier follows the pointer (`touch`: a finger), and the line
   * and label run from the start to the pointer, once there is a start.
   */
  measureMove(lon: number, lat: number, touch = false) {
    if (!this.measureDone) return
    this.measurePointer = { lon, lat, touch }
    this.measureChanged()
    if (this.measureStart === undefined) return
    this.measureList = measureOnMap(this.measureStart, [lon, lat])
    this.pushHighlight()
  }

  /** Ends a measure without a distance: its `done` gets undefined, and nothing is changed. Nothing when none is under way. */
  cancelMeasure() {
    this.finishMeasure(undefined)
  }

  private finishMeasure(metres: number | undefined) {
    const done = this.measureDone
    if (!done) return
    this.measureDone = undefined
    this.measureStart = undefined
    this.measurePointer = undefined
    this.measureList = []
    this.computeMidpoints()
    // the field's band comes back if the field still has the focus or the pointer on it
    this.refreshFieldOverlay()
    this.pushHighlight()
    this.changed()
    this.measureChanged()
    done(metres)
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

/** Pixels around the pointer in which a midpoint handle is hit */
const HANDLE_PX = 6
/** Pixels a press on a handle must move before its node is made: a click with a little shake adds nothing */
const HANDLE_DRAG_PX = 3
