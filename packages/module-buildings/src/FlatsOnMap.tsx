/**
 * The number of dwellings on each building that has one (`building:flats`, `flats` or `houses`), as the kaligrafy iD
 * fork labels such buildings. From zoom 17, below the building's centre so that a house number stays readable, and left
 * out where it would cover another label. The buildings themselves are the editor's; this draws only the labels, above
 * the areas and below the editor's own labels and handles (BEFORE, as the golf hole numbers do).
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { FeatureCollection, Point } from 'geojson'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import { flatsLabels, type GraphLike } from './flats.ts'
import { m } from './messages.ts'

const BEFORE = ['label-line', 'highlight-midpoint']
const SOURCE = 'maid-buildings-flats'

const LABELS = {
  id: 'maid-buildings-flats',
  type: 'symbol',
  minzoom: 17,
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Open Sans Semibold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 17, 10, 20, 13],
    'text-offset': [0, 1.1],
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#7f1d1d',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5,
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

export function FlatsOnMap({ editor }: MapContentProps) {
  const graph = useStagingGraph(editor.history)
  const beforeId = useBeforeId()
  // the staging graph is a new object per change, so it is the memo's key
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: flatsLabels(graph).map((building) => ({
        type: 'Feature',
        properties: { label: m.flats_label({ count: building.count }) },
        geometry: { type: 'Point', coordinates: building.at },
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
