/**
 * The lanes of the selected road on the map, as bands beside its centre line: `LanesOnMap` is registered on
 * `map.content`. It draws when exactly one entity is selected and it is a lane road (roads.ts), from zoom 17 on. The
 * lane under the pointer in the table or the diagram (`laneFocus`, hover-store.ts) is amber, the chosen one blue and
 * wider.
 *
 * The bands go above the lines of the OSM data and below their labels, midpoint handles and vertices (the layers of
 * the editor named in BEFORE, as the bicycle infrastructure does): they cover the road's own colour, which says less
 * than the lanes while the road is selected, but never hide a vertex the person wants to drag.
 *
 * The bands and layers are built in lane-bands.ts and layers.ts (pure); this file reads the editor and draws.
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { Tags } from '../edit.ts'
import { laneFocus } from '../hover-store.ts'
import { isLaneRoad } from '../roads.ts'
import { osmNumber } from '../scene.ts'
import { laneBands } from './lane-bands.ts'
import { bandFeatures, LANES_LAYERS, LANES_SOURCE, type LanesLayer } from './layers.ts'

/** The editor layers ours go below, the first one on the map wins (renderer layers.ts): labels of lines, midpoints */
const BEFORE = ['label-line', 'highlight-midpoint']

/** What the overlay reads of an entity of the staging graph */
type Entity = {
  readonly id: string
  readonly type?: string
  readonly tags: Tags
  readonly nodes?: readonly string[]
  readonly loc?: readonly [number, number] | readonly number[]
}
type Graph = { hasEntity(id: string): Entity | undefined }

/**
 * The staging graph of the editor's history, read again after each change of it (a load or an edit), as the parking
 * sides read it (module-parking side-features.tsx). The graph is a new object per edit, so it is the snapshot.
 */
function useStagingGraph(history: MapContentProps['editor']['history']): Graph {
  // stable for one history: a new subscribe function would make the hook unsubscribe and subscribe on every render
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
  return useSyncExternalStore(subscribe, () => history.staging.graph) as unknown as Graph
}

const noEngine = () => () => {}
const NONE: readonly string[] = []

/** The ids the map shows as selected; none without an engine */
function useSelected(engine: MapContentProps['engine']): readonly string[] {
  return useSyncExternalStore(engine?.subscribe ?? noEngine, () => engine?.selected() ?? NONE)
}

const subscribeFocus = (listener: () => void) => laneFocus.subscribe(listener)

/** The hovered and the chosen lane of the table and the diagram */
function useLaneFocus() {
  const hovered = useSyncExternalStore(subscribeFocus, laneFocus.hovered)
  const chosen = useSyncExternalStore(subscribeFocus, laneFocus.chosen)
  return { hovered, chosen }
}

/** The line of a way as [lon, lat] pairs; nodes not loaded are left out */
function wayCoordinates(graph: Graph, way: Entity): [number, number][] {
  const coordinates: [number, number][] = []
  for (const id of way.nodes ?? []) {
    const loc = graph.hasEntity(id)?.loc
    if (loc && loc.length >= 2) coordinates.push([loc[0]!, loc[1]!])
  }
  return coordinates
}

/** The id of the first editor layer of BEFORE on the map, undefined while there is none (then ours go on top) */
function useBeforeId() {
  const { current: map } = useMap()
  if (!map) return undefined
  return BEFORE.find((id) => map.getLayer(id) !== undefined)
}

/** The layers as react-map-gl takes them (the expressions are checked by the layer tests) */
function toLayerProps(layer: LanesLayer): LayerProps {
  return layer as unknown as LayerProps
}

/** The selected lane road, or undefined when the selection is not exactly one such way */
function selectedLaneRoad(graph: Graph, selected: readonly string[]): Entity | undefined {
  if (selected.length !== 1) return undefined
  const id = selected[0]!
  if (!id.startsWith('w')) return undefined
  const way = graph.hasEntity(id)
  if (!way || !isLaneRoad(way.tags)) return undefined
  return way
}

/** The lane bands of the selected road. Renders nothing unless exactly one lane road is selected. */
export function LanesOnMap({ editor, engine }: MapContentProps) {
  const graph = useStagingGraph(editor.history)
  const selected = useSelected(engine)
  const { hovered, chosen } = useLaneFocus()
  const beforeId = useBeforeId()
  const way = selectedLaneRoad(graph, selected)
  // the bands and the line change only with the way (a new object per edit of it); the focus only recolours them
  const shape = useMemo(
    () =>
      way
        ? { bands: laneBands(osmNumber(way.id), way.tags), coordinates: wayCoordinates(graph, way) }
        : undefined,
    // the graph: a moved node changes the line without changing the way
    [way, graph],
  )
  const data = useMemo(
    () => (shape ? bandFeatures(shape.bands, shape.coordinates, { hovered, chosen }) : undefined),
    [shape, hovered, chosen],
  )
  if (!data || data.features.length === 0) return null
  return (
    <Source id={LANES_SOURCE} type="geojson" data={data}>
      {LANES_LAYERS.map((layer) => (
        <Layer key={layer.id} beforeId={beforeId} {...toLayerProps(layer)} />
      ))}
    </Source>
  )
}
