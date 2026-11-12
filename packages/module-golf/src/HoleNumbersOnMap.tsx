/**
 * The number of each hole on its line of play, as OSM Carto labels golf=hole with its ref (jgruca, Carto 5.4). The
 * lines themselves are the editor's; this draws only the labels, from zoom 15, above the lines and below the editor's
 * own labels and handles (BEFORE, as the lanes overlay does).
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { FeatureCollection, LineString } from 'geojson'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import { type GraphLike, holeLines } from './holes.ts'

const BEFORE = ['label-line', 'highlight-midpoint']
const SOURCE = 'maid-golf-hole-numbers'

const LABELS = {
  id: 'maid-golf-hole-numbers',
  type: 'symbol',
  minzoom: 15,
  layout: {
    'symbol-placement': 'line-center',
    'text-field': ['get', 'ref'],
    'text-font': ['Open Sans Semibold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 19, 16],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#3f3f46',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
} as unknown as LayerProps

/** The staging graph, read again after a load, an edit, undo or redo */
function useStagingGraph(history: MapContentProps['editor']['history']): GraphLike {
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = [
        history.on('merge', listener),
        history.on('stagingchange', listener),
        history.on('historyjump', listener),
      ]
      return () => {
        for (const stop of stops) stop()
      }
    },
    [history],
  )
  return useSyncExternalStore(subscribe, () => history.staging.graph) as unknown as GraphLike
}

function useBeforeId() {
  const { current: map } = useMap()
  if (!map) return undefined
  return BEFORE.find((id) => map.getLayer(id) !== undefined)
}

export function HoleNumbersOnMap({ editor }: MapContentProps) {
  const graph = useStagingGraph(editor.history)
  const beforeId = useBeforeId()
  // the staging graph is a new object per change, so it is the memo's key
  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: holeLines(graph).map((hole) => ({
        type: 'Feature',
        properties: { ref: hole.ref },
        geometry: { type: 'LineString', coordinates: hole.coordinates },
      })),
    }),
    [graph],
  )
  return (
    <Source id={SOURCE} type="geojson" data={data}>
      <Layer {...LABELS} beforeId={beforeId} />
    </Source>
  )
}
