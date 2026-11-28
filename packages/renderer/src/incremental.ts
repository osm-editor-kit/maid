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

/**
 * The updates of one source, one at a time; what arrives meanwhile goes out together next.
 *
 * Differences are only right for a source that holds what this side thinks it holds, and MapLibre holds the very object
 * it was given (docs/research/maplibre-updatedata-stale-tiles.md):
 * - MapLibre keeps the object passed to `addSource` or `setData` and reads it again when the first `updateData` after
 *   it comes back: it builds its own copy of the features from it then, and takes the bounds of a removed feature from
 *   that copy to pick the tiles to rebuild. So that object must keep its features; if it already showed the removal,
 *   the removed feature would have no bounds and stay in its tile. `latest` returns a new object each time, and nothing
 *   here changes an object once MapLibre has it.
 * - The source may not be made from `given`: react-map-gl adds it during a render, and when React throws that render
 *   away (an interrupted render while data arrives), the next one finds the source with an earlier collection and keeps
 *   it. A source made again (react-map-gl adds it anew after a change of the style) starts from `given`, which is old by
 *   then. Either way the source gets the whole latest collection once, then differences again.
 */
export function updater(
  map: UpdateMap,
  sourceId: string,
  given: FeatureCollection,
  latest: () => FeatureCollection,
) {
  let busy = false
  let pending: Pending = { add: new Map(), remove: new Set() }
  let disposed = false
  /** The source the updates went to; `undefined` before the first */
  let known: GeoJSONSource | undefined
  /**
   * Whether `source` needs the whole collection: one seen for the first time that was not made from `given`, or a source
   * other than the one the updates went to
   */
  const needsWhole = (source: GeoJSONSource) =>
    source !== known && (known !== undefined || source.serialize().data !== given)
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
    if (!source) return
    const whole = needsWhole(source)
    known = source
    if (!whole && pending.add.size === 0 && pending.remove.size === 0) return
    busy = true
    const { add, remove } = pending
    pending = { add: new Map(), remove: new Set() }
    try {
      if (whole) await source.setData(latest())
      else
        await source.updateData({
          add: [...add.values()],
          remove: [...remove] as (string | number)[],
        })
      await tilesBuilt()
    } finally {
      busy = false
      void flush()
    }
  }
  /**
   * A source that appears or is made again without an edit after it would show an old collection until the next edit.
   * Cheap: `needsWhole` reads the source's data only before the first update.
   */
  const onStyleData = () => {
    const source = map.getSource<GeoJSONSource>(sourceId)
    if (source && source !== known) void flush()
  }
  map.on('styledata', onStyleData)
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
      map.off('styledata', onStyleData)
    },
  }
}

/**
 * The collection react-map-gl sees, made once per source, and what was sent of it. A class, so that the component holds
 * one object and changes it through its methods only after a render (in an effect).
 */
export class Holder {
  /**
   * What react-map-gl passes to `addSource`: the first features, never changed afterwards (see `updater`). A source
   * made again from it gets the latest features from the updater.
   */
  readonly collection: FeatureCollection
  private features: Feature[]
  private sent: Set<Feature>
  private updates: ReturnType<typeof updater> | undefined

  constructor(features: readonly Feature[]) {
    this.features = features.map(withId)
    this.collection = Object.freeze({ type: 'FeatureCollection', features: this.features })
    this.sent = new Set(this.features)
  }

  /** The latest features, in a new object: MapLibre keeps the object it is given */
  latest(): FeatureCollection {
    return { type: 'FeatureCollection', features: this.features }
  }

  /** Sends what changed since the last call; the first call also checks that the source holds this collection */
  apply(map: UpdateMap, sourceId: string, features: readonly Feature[]) {
    const next = features.map(withId)
    const nextSet = new Set(next)
    const removed = [...this.sent].filter((feature) => !nextSet.has(feature))
    const added = next.filter((feature) => !this.sent.has(feature))
    // a new array: the old one may be the one MapLibre holds
    this.features = next
    this.sent = nextSet
    if (this.updates && added.length === 0 && removed.length === 0) return
    this.updates ??= updater(map, sourceId, this.collection, () => this.latest())
    this.updates.send(added, removed)
  }

  dispose() {
    this.updates?.dispose()
    this.updates = undefined
  }
}
