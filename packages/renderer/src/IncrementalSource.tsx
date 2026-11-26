/**
 * A GeoJSON source for `map.content` that sends MapLibre only what changed. A module passes the whole collection each
 * time, as it would to react-map-gl's `<Source data>`; this compares it with the last one by feature object (a feature
 * that did not change must be the same object, as module-lanes' street collector keeps them) and sends the difference
 * with `GeoJSONSource.updateData`. Re-sending a whole collection on every edit is the slow path: the street drawing of
 * the dense fixture is about 5 MB of GeoJSON, a node drag changes a few dozen features of it.
 *
 * Imperative on purpose (AGENTS.md: performance calls stay in the renderer behind a small API):
 * - react-map-gl's `<Source>` gets one collection object that never changes identity, so it never calls `setData`; its
 *   `features` are kept at the latest list, so a source made again (a rebuild of the style) starts from the latest data.
 * - Updates go out one at a time per source, the next one waits until the tiles of the last are rebuilt: overlapping
 *   updates left tiles in an inconsistent state (sender.ts, the same rule for the OSM data).
 * Every feature gets a numeric `id` here when it has none; `updateData` removes features by it.
 */
import type { Feature, FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useState, type ReactNode } from 'react'
import { Source, useMap } from 'react-map-gl/maplibre'

let nextId = 1

function withId(feature: Feature): Feature {
  if (feature.id === undefined) feature.id = nextId++
  return feature
}

type Pending = { add: Map<Feature['id'], Feature>; remove: Set<Feature['id']> }

/** After this long without an update the whole collection goes out once (see `reconcile`) */
const RECONCILE_MS = 800

/** The updates of one source, one at a time; what arrives meanwhile goes out together next */

function updater(map: MapLibreMap, sourceId: string, latest: () => FeatureCollection) {
  let busy = false
  let pending: Pending = { add: new Map(), remove: new Set() }
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether a removal went out since the last reconcile: only removals left stale features */
  let removedSince = false
  let disposed = false
  /**
   * The whole collection once the updates have stopped for a moment: now and then a feature that `updateData` removed
   * stayed in a tile that was not built again (seen in check-lanes, about one run in three). The renderer's sender
   * does the same for the OSM data (its compaction). A drag stays incremental; its end is exact. Only after removals,
   * since a whole collection costs MapLibre a rebuild of its index of features at the next update.
   */
  const reconcile = () => {
    clearTimeout(reconcileTimer)
    if (disposed || !removedSince) return
    reconcileTimer = setTimeout(() => {
      if (disposed) return
      if (busy || pending.add.size > 0 || pending.remove.size > 0) return reconcile()
      removedSince = false
      void map.getSource<GeoJSONSource>(sourceId)?.setData(latest())
    }, RECONCILE_MS)
  }
  const tilesBuilt = () =>
    map.isSourceLoaded(sourceId)
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer)
            map.off('sourcedata', check)
            resolve()
          }
          const check = () => {
            if (map.isSourceLoaded(sourceId)) done()
          }
          // never wait for ever: a source that left the style loads no more
          const timer = setTimeout(done, 2000)
          map.on('sourcedata', check)
        })
  const flush = async () => {
    if (busy || disposed) return
    const source = map.getSource<GeoJSONSource>(sourceId)
    if (!source || (pending.add.size === 0 && pending.remove.size === 0)) return
    busy = true
    const { add, remove } = pending
    if (remove.size > 0) removedSince = true
    pending = { add: new Map(), remove: new Set() }
    try {
      await source.updateData({
        add: [...add.values()],
        remove: [...remove] as (string | number)[],
      })
      await tilesBuilt()
    } finally {
      busy = false
      void flush()
      reconcile()
    }
  }
  return {
    send(added: readonly Feature[], removed: readonly Feature[]) {
      for (const feature of removed) {
        // also when an add of it is pending: an earlier version may be in the source already, and removing an id the
        // source does not have does no harm
        pending.add.delete(feature.id)
        pending.remove.add(feature.id)
      }
      for (const feature of added) {
        pending.remove.delete(feature.id)
        pending.add.set(feature.id, feature)
      }
      void flush()
    },
    /** Nothing more goes out: the component left, a new one may take the source id */
    dispose() {
      disposed = true
      clearTimeout(reconcileTimer)
    },
  }
}

/**
 * The collection react-map-gl sees, made once per source, and what was sent of it. A class, so that the component holds
 * one object and changes it through its methods only after a render (in an effect).
 */
class Holder {
  readonly collection: FeatureCollection
  private sent: Set<Feature>
  private updates: ReturnType<typeof updater> | undefined

  constructor(features: readonly Feature[]) {
    this.collection = { type: 'FeatureCollection', features: features.map(withId) }
    this.sent = new Set(this.collection.features)
  }

  /** Sends what changed since the last call, and keeps the collection at the latest features */
  apply(map: MapLibreMap, sourceId: string, features: readonly Feature[]) {
    const next = features.map(withId)
    const nextSet = new Set(next)
    const removed = [...this.sent].filter((feature) => !nextSet.has(feature))
    const added = next.filter((feature) => !this.sent.has(feature))
    this.collection.features = next
    this.sent = nextSet
    if (added.length === 0 && removed.length === 0) return
    this.updates ??= updater(map, sourceId, () => this.collection)
    this.updates.send(added, removed)
  }

  dispose() {
    this.updates?.dispose()
    this.updates = undefined
  }
}

export function IncrementalSource({
  id,
  data,
  children,
}: {
  id: string
  data: FeatureCollection
  children?: ReactNode
}) {
  const { current: mapRef } = useMap()
  const [holder] = useState(() => new Holder(data.features))

  useEffect(
    function sendDifference() {
      const map = mapRef?.getMap()
      if (map) holder.apply(map, id, data.features)
    },
    [data, mapRef, id, holder],
  )
  useEffect(
    function stopOnLeave() {
      return () => holder.dispose()
    },
    [holder],
  )

  return (
    <Source id={id} type="geojson" data={holder.collection}>
      {children}
    </Source>
  )
}
