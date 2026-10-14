/**
 * What reaches MapLibre and when: the update channel of every source and tier (channels.ts), the live tier
 * they feed, one update per source at a time, the compaction of the live tier into the big sources, and the
 * wait for all of it (`settled`). Owned by the engine as `engine.sender`.
 *
 * It knows nothing of selection, hover or editing; the engine decides what to queue and calls `scheduleFlush`.
 * The engine's facts it needs (the map, the tile loader, a drag, the presets) come through `SenderHost`.
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { Feature } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { SourceName } from './build'
import { type Channel, makeChannels, SOURCE_NAMES } from './channels'
import type { EngineMetrics } from './engine'
import { featureId } from './feature-id'
import { ACTIVE_SOURCE, EDIT_SOURCES, SELECT_SOURCES, SOURCES } from './layers'
import type { TileLoader } from './tile-loader'

export interface SenderHost {
  editor: Editor
  metrics: EngineMetrics
  tiles: TileLoader
  map(): MapLibreMap | undefined
  /** A drag step is still being sent: nothing is final then */
  dragBusy(): boolean
  /** Points and vertices are held for the presets, or their icons are being filled in */
  presetsPending(): boolean
  /** For the error of a wait that timed out: the engine's own state */
  debugState(): unknown
}

/** The MapLibre state that `settled()` waits on, in plain values, for diagnostics */
function mapState(map: MapLibreMap) {
  return {
    loaded: map.loaded(),
    areTilesLoaded: map.areTilesLoaded(),
    moving: map.isMoving(),
    zoom: map.getZoom(),
  }
}

export class Sender {
  constructor(private readonly host: SenderHost) {}

  waiters: (() => void)[] = []
  /** Ids whose original in the big sources is hidden while a newer copy is in the live tier */
  editing = new Set<string>()
  /**
   * What the live tier holds, by source and id. The live tier is a set of small twin sources
   * for data that arrived after the first load and for features that were changed. Updating
   * them re-tiles only that little data; the big sources stay untouched until compaction.
   */
  live: Record<SourceName, Map<string, Feature>> = {
    areas: new Map(),
    lines: new Map(),
    points: new Map(),
    vertices: new Map(),
  }
  channels = {
    base: makeChannels(SOURCES),
    live: makeChannels(EDIT_SOURCES),
    /** The selection's copies (SELECT_SOURCES): what is drawn below the floor of the data (layers.ts) */
    select: makeChannels(SELECT_SOURCES),
  }

  compacting = false
  compactTimer?: ReturnType<typeof setTimeout>

  flushTimer?: ReturnType<typeof setTimeout>

  scheduleFlush(channel: Channel) {
    // more tiles of this view are on their way: wait for them, but never longer than 150 ms
    if (this.host.tiles.inflight > 1) {
      this.flushTimer ??= setTimeout(() => this.flushAll(), 150)
      return
    }
    void this.flush(channel)
  }

  allChannels() {
    return [
      ...Object.values(this.channels.base),
      ...Object.values(this.channels.live),
      ...Object.values(this.channels.select),
    ]
  }

  flushAll() {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    for (const channel of this.allChannels()) void this.flush(channel)
  }

  /**
   * One update per source at a time. Features that arrive while MapLibre's worker is busy
   * wait and go out together as the next update. Sending overlapping `updateData` calls
   * left tiles in an inconsistent state (queries threw "feature index out of bounds").
   */
  async flush(channel: Channel) {
    if (channel.busy || !channel.dirty) return
    const source = this.host.map()?.getSource<GeoJSONSource>(channel.sourceId)
    if (!source) return
    channel.busy = true
    channel.dirty = false
    this.host.metrics.updates++
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
  async channelIdle(channel: Channel) {
    while (channel.busy || channel.dirty)
      await new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  wake() {
    for (const done of this.waiters.splice(0)) done()
  }

  // --- Compaction: move the live tier into the big sources when nothing else is going on ---

  /** Call on any activity. Compaction waits until two seconds have passed without one. */
  touch() {
    clearTimeout(this.compactTimer)
    this.compactTimer = setTimeout(() => void this.compact(), 2000)
  }

  async compact() {
    const map = this.host.map()
    if (!map) return
    // only when the picture is final: compaction must never delay it
    if (
      this.compacting ||
      this.host.dragBusy() ||
      this.host.tiles.inflight > 0 ||
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
      this.host.metrics.compactions++
    } finally {
      this.compacting = false
      this.wake()
    }
  }

  /**
   * `updateData` resolves when the worker has the new data, but the visible tiles are still
   * being rebuilt. A second update during that rebuild is what broke the tiles, so wait for it.
   */
  tilesReloaded(sourceId: string) {
    const map = this.host.map()
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

  preparing = 0
  /** Counts every change of what a source holds (start and end of each update). `render` copies it to `renderedSeq`. */
  dataSeq = 0
  renderedSeq = 0
  /** Updates of the active source that MapLibre has not confirmed yet */
  activeSending = 0

  pushing() {
    return (
      this.preparing > 0 ||
      this.activeSending > 0 ||
      this.flushTimer !== undefined ||
      this.host.dragBusy() ||
      this.compacting ||
      this.host.presetsPending() ||
      this.allChannels().some((channel) => channel.busy || channel.dirty)
    )
  }

  /**
   * Resolves when all requested tiles are merged and MapLibre has drawn them. Every wait in here is bounded (250 ms,
   * 2 s, or the deadline), so this either resolves or throws with the state that was waiting; it never hangs silently.
   */
  async settled(timeoutMs = 60000) {
    const map = this.host.map()
    if (!map) throw new Error('Engine is not attached to a map')
    const deadline = performance.now() + timeoutMs
    for (;;) {
      if (performance.now() > deadline) {
        throw new Error(
          `Maid did not settle in ${timeoutMs}ms: ${JSON.stringify({
            map: mapState(map),
            engine: this.host.debugState(),
          })}`,
        )
      }
      this.host.tiles.loadVisibleTiles()
      // the presets are made after the first picture: they are work in progress until they are there and the
      // icons of what was drawn without them are filled in (`pushing` counts the fill-in)
      const { editor } = this.host
      if (editor.presetsPending) {
        await editor.loadPresets()
        continue
      }
      if (this.host.tiles.inflight > 0 || this.pushing()) {
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
        this.host.tiles.inflight === 0 &&
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
  sourcesLoaded(map: MapLibreMap) {
    return [ACTIVE_SOURCE, ...this.allChannels().map((channel) => channel.sourceId)].every(
      (id) => !map.getSource(id) || map.isSourceLoaded(id),
    )
  }

  /**
   * Resolves at MapLibre's next `idle`, or after 2 s if there is none. A frame is requested first, so the state is
   * looked at again on a frame that is drawn. The listener is removed either way: a timer that wins leaves none behind.
   * The caller checks the state again after this returns, so a missed idle only costs the 2 s.
   */
  nextIdle(map: MapLibreMap) {
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
}
