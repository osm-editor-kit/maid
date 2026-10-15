/**
 * Asking the OSM API for data: the tiles of the view (with their waits and the rate-limit pause, planned
 * by tile-loading.ts) and the loads of one relation or entity. Owned by the engine as `engine.tiles`.
 *
 * What a load does with the answer (merging it into the data and the map) is the engine's `merge`,
 * reached through `TileHost`. This file owns the requests, their timers and their abort controllers.
 */
import { HttpError, RateLimitedError, type RemoteFetch, toOsmZoom } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { EngineMetrics } from './engine'
import {
  nextParentRelationsSupport,
  type ParentRelationsAnswer,
  type ParentRelationsSupport,
  parentRelationsPath,
  shouldAskParentRelations,
} from './parent-relations'
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

export interface TileHost {
  apiUrl: string
  minDataZoom: number
  metrics: EngineMetrics
  map(): MapLibreMap | undefined
  /** Merges the elements into the data and the map; returns how many entities were new */
  merge(elements: OsmJsonElement[]): number
  /** Sends everything queued to MapLibre now (the last tile in flight has finished) */
  flushAll(): void
  /** Tells whoever waits for the engine to be idle to look again */
  wake(): void
  /** Counts as activity for the compaction timer */
  touch(): void
}

export class TileLoader {
  /** Map data tiles: their state, and the rate-limit pause that holds them (tile-loading.ts) */
  readonly loads: TileLoads = createTileLoads()
  /** Tile requests in flight */
  inflight = 0
  /** After the first view is complete, new data goes to the live tier */
  firstLoadDone = false
  /** The one timer for the next moment a wanted tile may be asked (the end of a wait or of a pause) */
  private wakeTimer?: ReturnType<typeof setTimeout>
  /** Relation loads in flight by relation id: a second call for the same relation shares the request */
  private relationLoads = new Map<string, { load: Promise<number>; controller: AbortController }>()
  /** Whether the server answers the parent-relations route (parent-relations.ts): kept for the session */
  private parentsSupport: ParentRelationsSupport = 'unknown'

  constructor(
    private readonly host: TileHost,
    private readonly remote: RemoteFetch,
  ) {}

  /** OSM zoom (256px tiles) of the map (`toOsmZoom` in maid-core) */
  osmZoom() {
    return toOsmZoom(this.host.map()?.getZoom() ?? 0)
  }

  loadVisibleTiles() {
    const map = this.host.map()
    this.host.touch()
    if (!map) return
    // below the minimum zoom nothing is wanted, so the loads in flight are cancelled
    const wanted: TileKey[] = []
    if (this.osmZoom() >= this.host.minDataZoom) {
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
    const plan = planLoads(this.loads, wanted, Date.now())
    for (const { key, controller } of plan.start) void this.loadTile(key, controller)
    this.scheduleWake(plan.nextWakeAt)
  }

  /** One timer for the next moment a wanted tile may be asked. It asks again for the view as it is then. */
  scheduleWake(at: number | undefined) {
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
    const { host } = this
    const { metrics } = host
    const [x, y] = tileXY(key)
    this.inflight++
    try {
      const bbox = [x2lon(x), y2lat(y + 1), x2lon(x + 1), y2lat(y)].join(',')
      const url = `${host.apiUrl}/api/0.6/map.json?bbox=${bbox}`
      const t0 = performance.now()
      const res = await this.remote(url, { signal: controller.signal, timeoutMs: TILE_TIMEOUT_MS })
      if (!res.ok) throw new HttpError(res.status, url)
      const text = await res.text()
      const t1 = performance.now()
      const json = JSON.parse(text) as { elements: OsmJsonElement[] }
      const t2 = performance.now()
      // a request that was cancelled meanwhile (the tile left the view) is not used
      if (!settleLoad(this.loads, key, controller, { kind: 'loaded' }, Date.now())) return
      metrics.tiles++
      metrics.bytes += text.length
      metrics.fetchMs += t1 - t0
      metrics.parseMs += t2 - t1
      host.merge(json.elements)
    } catch (error) {
      const outcome = outcomeOf(error, controller.signal)
      const current = settleLoad(this.loads, key, controller, outcome, Date.now())
      if (outcome.kind !== 'aborted') console.error(error)
      // a failed tile has a wait, and a paused service has an end: plan again when they end
      const waits = current && (outcome.kind === 'failed' || outcome.kind === 'refused')
      if (waits || outcome.kind === 'rateLimited') this.loadVisibleTiles()
    } finally {
      this.inflight--
      if (this.inflight === 0) {
        host.flushAll()
        // the first view is complete: from now on new data goes to the live tier
        if (metrics.tiles > 0) this.firstLoadDone = true
        host.wake()
      }
    }
  }

  /**
   * Starts the loads again after an upload: the loads in flight are cancelled, relation loads too, and the
   * next first view is a first view again. The caller wakes the loader (`scheduleWake`) when it wants tiles.
   */
  restart() {
    resetLoads(this.loads)
    this.abortAllRelations('the data was reloaded')
    this.firstLoadDone = false
  }

  /** A relation load belongs to the selection that asked for it: once that is gone, the load is cancelled */
  keepRelations(selected: readonly string[]) {
    for (const [id, entry] of this.relationLoads) {
      if (!selected.includes(id))
        entry.controller.abort(new DOMException(`${id} is no longer selected`, 'AbortError'))
    }
  }

  /** Stops the timer and every load in flight. For an engine that is not used any more. */
  destroy() {
    clearTimeout(this.wakeTimer)
    this.wakeTimer = undefined
    resetLoads(this.loads)
    this.abortAllRelations('the engine was destroyed')
  }

  private abortAllRelations(reason: string) {
    for (const entry of this.relationLoads.values()) {
      entry.controller.abort(new DOMException(reason, 'AbortError'))
    }
    this.relationLoads.clear()
  }

  /**
   * Loads a relation in full, as iD's `/relation/ID/full` call does: the relation, its node members,
   * its way members with their nodes, and its member relations (one level, not their members). One
   * request to `apiUrl`, merged like a map tile, so the members enter the data and the map; and, as iD's
   * download does, the relation's parent relations (`fetchParentRelations`, best effort). Nothing
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
    const signal = new AbortController().signal
    const added = await this.withParents(id, this.fetchElements(path, signal), signal)
    return { added }
  }

  private fetchRelation(id: string, signal: AbortSignal) {
    const match = /^r(\d+)$/.exec(id)
    if (!match) throw new Error(`Not a relation: ${id}`)
    return this.withParents(
      id,
      this.fetchElements(`relation/${match[1]}/full.json`, signal),
      signal,
    )
  }

  /**
   * A download and the parent relations of what it downloads, as iD's `context.loadEntity` does both. Resolves
   * with the download's own count: the parents are merged into the data but do not count as the download's.
   */
  private async withParents(id: string, download: Promise<number>, signal: AbortSignal) {
    // the requests run together, but the parents are merged after the download is merged: the download's count
    // is its own, even when an element both answers (a relation that is its own parent) is new in one of them
    const [added, parents] = await Promise.all([download, this.fetchParentRelations(id, signal)])
    if (parents.length > 0) this.host.merge(parents)
    return added
  }

  /**
   * The parent relations of an entity that was just downloaded, not yet merged. They are a bonus: a failure
   * here never fails the download itself, and a 404 means the server has no such route, so it is not asked again
   * this session (parent-relations.ts). Only a failure that is not an abort is reported in the console.
   */
  private async fetchParentRelations(id: string, signal: AbortSignal): Promise<OsmJsonElement[]> {
    const path = parentRelationsPath(id)
    if (path === undefined || !shouldAskParentRelations(this.parentsSupport)) return []
    const { host } = this
    let answer: ParentRelationsAnswer = 'failed'
    let elements: OsmJsonElement[] = []
    try {
      const res = await this.remote(`${host.apiUrl}${path}`, { signal })
      const text = await res.text()
      const json = JSON.parse(text) as { elements: OsmJsonElement[] }
      answer = 'answered'
      host.metrics.bytes += text.length
      elements = uniqueElements(json.elements)
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) answer = 'not-found'
      else if (!signal.aborted) console.error(error)
    } finally {
      this.parentsSupport = nextParentRelationsSupport(this.parentsSupport, answer)
    }
    return elements
  }

  /** One call to `apiUrl` under `/api/0.6/` that answers with elements, merged into the data */
  private async fetchElements(path: string, signal: AbortSignal) {
    const { host } = this
    const { metrics } = host
    const url = `${host.apiUrl}/api/0.6/${path}`
    const t0 = performance.now()
    const res = await this.remote(url, { signal }).catch((error: unknown) => {
      if (error instanceof HttpError) throw new Error(`OSM API answered ${error.status}`)
      if (error instanceof RateLimitedError) {
        // the service is paused: the map's tiles wait for the same pause
        notePause(this.loads, error.until)
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
    metrics.relations++
    metrics.bytes += text.length
    metrics.fetchMs += t1 - t0
    metrics.parseMs += t2 - t1
    return host.merge(uniqueElements(json.elements))
  }
}

/** Each element once: the API answers each one once, but a merge must not count one twice */
function uniqueElements(elements: OsmJsonElement[]) {
  const seen = new Set<string>()
  return elements.filter((e) => {
    const key = `${e.type}${e.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
