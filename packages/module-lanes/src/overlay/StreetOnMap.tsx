/**
 * The whole street on the map (street.ts): every lane road of the loaded data with its lanes at their widths, the
 * junctions between them, lane lines, kerbs and turn arrows, from zoom 16. Registered on `map.content` next to the
 * bands of the selected road (LanesOnMap.tsx), which stay on top as its highlight.
 *
 * The layers go below the lines of the OSM data (see BEFORE).
 */
import { IncrementalSource, type MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { Layer, useMap, type LayerProps } from 'react-map-gl/maplibre'
import { BAND_COLOURS } from './layers.ts'
import { streetCollector, type StreetGraph } from './street-collect.ts'

/**
 * Below the lines of the OSM data (the first line layer of the editor, renderer layers.ts), as Lane Studio draws its
 * lanes under iD's lines: the way, its vertices and the selection stay on top and can be clicked
 */
const BEFORE = ['line-casing--1', 'line-casing-0', 'label-line', 'highlight-midpoint']
export const STREET_MIN_ZOOM = 16

type History = MapContentProps['editor']['history']

/**
 * A counter per edit history that moves whenever the data moves: an edit, undo or redo, and arriving data. Arriving
 * data (`merge`) adds to the graph's base in place, so the staging graph stays the same object and cannot be the
 * snapshot (as in shell route-overview/data-version.ts). Its own listener is added first, so it has moved before a
 * component's listener reads it.
 */
const versions = new WeakMap<History, { value: number }>()
function versionOf(history: History) {
  let counter = versions.get(history)
  if (!counter) {
    const created = { value: 0 }
    const bump = () => {
      created.value++
    }
    history.on('merge', bump)
    history.on('stagingchange', bump)
    history.on('historyjump', bump)
    versions.set(history, created)
    counter = created
  }
  return counter
}

function useDataVersion(history: History): number {
  const counter = versionOf(history)
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
  return useSyncExternalStore(subscribe, () => counter.value)
}

function useBeforeId() {
  const { current: map } = useMap()
  if (!map) return undefined
  return BEFORE.find((id) => map.getLayer(id) !== undefined)
}

const AREAS_SOURCE = 'maid-street-areas'
const LINES_SOURCE = 'maid-street-lines'
const ARROWS_SOURCE = 'maid-street-arrows'
/** The arrow icon of the bands (LanesOnMap.tsx adds it to the map) */
const ARROW_IMAGE = 'maid-lanes-arrow'

const laneColour = [
  'match',
  ['get', 'kind'],
  'bus',
  BAND_COLOURS.bus,
  'bicycle',
  BAND_COLOURS.bicycle,
  'other',
  BAND_COLOURS.other,
  '#8a8a93',
]

const LAYERS = [
  {
    id: 'maid-street-junctions',
    type: 'fill',
    source: AREAS_SOURCE,
    minzoom: STREET_MIN_ZOOM,
    filter: ['==', ['get', 'part'], 'junction'],
    paint: { 'fill-color': '#7c7c85', 'fill-opacity': 0.9 },
  },
  {
    id: 'maid-street-lanes',
    type: 'fill',
    source: AREAS_SOURCE,
    minzoom: STREET_MIN_ZOOM,
    filter: ['==', ['get', 'part'], 'lane'],
    paint: {
      'fill-color': laneColour,
      // a lane narrowing to nothing (a lane added or dropped where roads join) lighter, so it reads as running out
      'fill-opacity': ['case', ['get', 'taper'], 0.45, ['get', 'assumed'], 0.55, 0.9],
    },
  },
  {
    // the edge of a lane narrowing to nothing, dashed, as a painted taper is
    id: 'maid-street-tapers',
    type: 'line',
    source: AREAS_SOURCE,
    minzoom: 17,
    filter: ['all', ['==', ['get', 'part'], 'lane'], ['get', 'taper']],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-opacity': 0.8,
      'line-width': ['interpolate', ['linear'], ['zoom'], 17, 0.5, 20, 1.5],
      'line-dasharray': [2, 2],
    },
  },
  {
    id: 'maid-street-kerbs',
    type: 'line',
    source: LINES_SOURCE,
    minzoom: STREET_MIN_ZOOM,
    filter: ['==', ['get', 'kind'], 'kerb'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#e4e4e7',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.5, 20, 2],
    },
  },
  {
    id: 'maid-street-lane-lines',
    type: 'line',
    source: LINES_SOURCE,
    minzoom: 17,
    filter: [
      'all',
      ['match', ['get', 'kind'], ['lane', 'centre'], true, false],
      ['!', ['get', 'assumed']],
    ],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 17, 0.75, 20, 2],
      'line-dasharray': [3, 3],
    },
  },
  {
    // where each lane leads through a junction, by its turn arrows: fine dashes, as guide markings are painted
    id: 'maid-street-guides',
    type: 'line',
    source: LINES_SOURCE,
    minzoom: 18,
    filter: ['==', ['get', 'kind'], 'guide'],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-opacity': 0.6,
      'line-width': ['interpolate', ['linear'], ['zoom'], 18, 0.5, 20, 1.2],
      'line-dasharray': [1, 2],
    },
  },
  {
    id: 'maid-street-arrows',
    type: 'symbol',
    source: ARROWS_SOURCE,
    minzoom: 18,
    layout: {
      'icon-image': ARROW_IMAGE,
      'icon-anchor': 'bottom',
      'icon-rotate': ['get', 'rotate'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 18, 0.4, 21, 1.4],
    },
  },
] as const

const SOURCES: Record<string, 'areas' | 'lines' | 'arrows'> = {
  [AREAS_SOURCE]: 'areas',
  [LINES_SOURCE]: 'lines',
  [ARROWS_SOURCE]: 'arrows',
}

/** Every lane road of the loaded data, drawn as its street */
export function StreetOnMap({ editor }: MapContentProps) {
  const version = useDataVersion(editor.history)
  const beforeId = useBeforeId()
  // one collector per map: it keeps the drawing and draws again only around what changed (street-collect.ts)
  const [collector] = useState(streetCollector)
  // the version is the cache key, passed in so that the React Compiler sees the dependency: the graph object alone does
  // not change when data arrives
  const data = useMemo(
    () => collector.update(editor.history.staging.graph as unknown as StreetGraph, version),
    [collector, version, editor.history],
  )
  // a source only once it has something to draw (as LanesOnMap): a source added empty and then copied over by a rebuild
  // of the map's style keeps its empty data
  return (
    <>
      {Object.entries(SOURCES)
        .filter(([, part]) => data[part].features.length > 0)
        .map(([source, part]) => (
          // only what changed goes to MapLibre (renderer IncrementalSource): the collector keeps the features of every
          // way it did not draw again as the same objects
          <IncrementalSource key={source} id={source} data={data[part]}>
            {LAYERS.filter((layer) => layer.source === source).map((layer) => {
              const { source: _, ...rest } = layer
              return (
                <Layer key={layer.id} beforeId={beforeId} {...(rest as unknown as LayerProps)} />
              )
            })}
          </IncrementalSource>
        ))}
    </>
  )
}
