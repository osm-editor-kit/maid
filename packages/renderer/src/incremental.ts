/**
 * The diff and the updates of IncrementalSource.tsx, apart from React so they can be tested with a fake map.
 */
import type { Feature, FeatureCollection } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

/** What the updates use of MapLibre's map */
export type UpdateMap = Pick<MapLibreMap, 'getSource' | 'isSourceLoaded' | 'on' | 'off'>

let nextId = 1

function withId(feature: Feature): Feature {
  if (feature.id === undefined) feature.id = nextId++
  return feature
}

type Pending = { add: Map<Feature['id'], Feature>; remove: Set<Feature['id']> }

/** After this long without an update the whole collection goes out once (see `reconcile`) */
const RECONCILE_MS = 800

/** The updates of one source, one at a time; what arrives meanwhile goes out together next */

export function updater(map: UpdateMap, sourceId: string, latest: () => FeatureCollection) {
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
export class Holder {
  readonly collection: FeatureCollection
  private sent: Set<Feature>
  private updates: ReturnType<typeof updater> | undefined

  constructor(features: readonly Feature[]) {
    this.collection = { type: 'FeatureCollection', features: features.map(withId) }
    this.sent = new Set(this.collection.features)
  }

  /** Sends what changed since the last call, and keeps the collection at the latest features */
  apply(map: UpdateMap, sourceId: string, features: readonly Feature[]) {
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
