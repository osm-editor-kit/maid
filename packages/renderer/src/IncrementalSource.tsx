/**
 * A GeoJSON source for `map.content` that sends MapLibre only what changed. A module passes the whole collection each
 * time, as it would to react-map-gl's `<Source data>`; this compares it with the last one by feature object (a feature
 * that did not change must be the same object, as module-lanes' street collector keeps them) and sends the difference
 * with `GeoJSONSource.updateData`. Re-sending a whole collection on every edit is the slow path: the street drawing of
 * the dense fixture is about 5 MB of GeoJSON, a node drag changes a few dozen features of it.
 *
 * Imperative on purpose (AGENTS.md: performance calls stay in the renderer behind a small API):
 * - react-map-gl's `<Source>` gets one collection object that never changes identity, so it never calls `setData`. That
 *   object is never changed either: MapLibre keeps it and reads it again later (incremental.ts `updater`). A source that
 *   was not made from it, or was made again, gets the whole latest collection once.
 * - Updates go out one at a time per source, the next one waits until the tiles of the last are rebuilt: overlapping
 *   updates left tiles in an inconsistent state (sender.ts, the same rule for the OSM data).
 * Every feature gets a numeric `id` here when it has none; `updateData` removes features by it.
 */
import type { FeatureCollection } from 'geojson'
import { useEffect, useState, type ReactNode } from 'react'
import { Source, useMap } from 'react-map-gl/maplibre'
import { Holder } from './incremental.ts'

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
