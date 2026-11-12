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
 * The bands and layers are built in scene-bands.ts and layers.ts (pure); this file reads the editor and draws.
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Layer, Source, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { Tags } from '../edit.ts'
import { laneFocus } from '../hover-store.ts'
import { isLaneRoad } from '../roads.ts'
import { osmNumber } from '../scene.ts'
import { arrowPoints } from './arrows.ts'
import { bandFeatures, LANES_LAYERS, LANES_SOURCE, type LanesLayer } from './layers.ts'
import { sceneBands } from './scene-bands.ts'

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

const ARROW_IMAGE = 'maid-lanes-arrow'
const ARROWS_SOURCE = 'maid-lanes-arrows'

/**
 * The arrow icon: white with a dark outline, pointing up, its base at the bottom middle (the icon's anchor, so the
 * arrows of `left;through` fan out from one point). Drawn on a canvas once, with room around it for the outline: a
 * plain image, not an SDF (MapLibre reads an SDF's alpha as a distance, and a filled shape then shows cut edges).
 */
function arrowImage(): ImageData | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = 36
  canvas.height = 56
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.beginPath()
  context.moveTo(18, 5) // tip
  context.lineTo(31, 21)
  context.lineTo(22, 21)
  context.lineTo(22, 52)
  context.lineTo(14, 52)
  context.lineTo(14, 21)
  context.lineTo(5, 21)
  context.closePath()
  context.lineJoin = 'round'
  context.lineWidth = 4
  context.strokeStyle = 'rgba(24, 24, 27, 0.8)'
  context.stroke()
  context.fillStyle = '#ffffff'
  context.fill()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Adds the arrow icon to the map's style, again when a new style dropped it. Imperative on purpose: react-map-gl has no
 * element for style images, and `addImage` is MapLibre's only way to give a symbol layer an icon of our own.
 */
function useArrowImage() {
  const { current: ref } = useMap()
  useEffect(() => {
    const map = ref?.getMap()
    if (!map) return
    const add = () => {
      if (map.hasImage(ARROW_IMAGE)) return
      const image = arrowImage()
      if (image) map.addImage(ARROW_IMAGE, image, { pixelRatio: 2 })
    }
    const onMissing = (event: { id: string }) => {
      if (event.id === ARROW_IMAGE) add()
    }
    add()
    map.on('styleimagemissing', onMissing)
    return () => {
      map.off('styleimagemissing', onMissing)
    }
  }, [ref])
}

/** The arrows on the bands, from zoom 18, rotated with the map */
const ARROW_LAYER = {
  id: 'maid-lanes-arrows',
  type: 'symbol',
  minzoom: 18,
  layout: {
    'icon-image': ARROW_IMAGE,
    'icon-anchor': 'bottom',
    'icon-rotate': ['get', 'rotate'],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 18, 0.5, 21, 1.7],
  },
} as unknown as LayerProps

function isReverseOneway(tags: Tags): boolean {
  const oneway = tags.oneway?.toLowerCase()
  return oneway === '-1' || oneway === 'reverse'
}

/** The lane bands of the selected road. Renders nothing unless exactly one lane road is selected. */
export function LanesOnMap({ editor, engine }: MapContentProps) {
  const graph = useStagingGraph(editor.history)
  const selected = useSelected(engine)
  const { hovered, chosen } = useLaneFocus()
  const beforeId = useBeforeId()
  useArrowImage()
  const way = selectedLaneRoad(graph, selected)
  // the bands and the line change only with the way (a new object per edit of it); the focus only recolours them
  const shape = useMemo(
    () =>
      way
        ? {
            bands: sceneBands(osmNumber(way.id), way.tags),
            coordinates: wayCoordinates(graph, way),
          }
        : undefined,
    // the graph: a moved node changes the line without changing the way
    [way, graph],
  )
  const data = useMemo(
    () => (shape ? bandFeatures(shape.bands, shape.coordinates, { hovered, chosen }) : undefined),
    [shape, hovered, chosen],
  )
  const arrows = useMemo(() => {
    if (!shape || !way) return undefined
    const points = arrowPoints(shape.bands, shape.coordinates, {
      reverseOneway: isReverseOneway(way.tags),
    })
    return {
      type: 'FeatureCollection' as const,
      features: points.map((point) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: point.coordinates },
        properties: { rotate: point.rotate, slotId: point.slotId, token: point.token },
      })),
    }
  }, [shape, way])
  if (!data || data.features.length === 0) return null
  return (
    <>
      <Source id={LANES_SOURCE} type="geojson" data={data}>
        {LANES_LAYERS.map((layer) => (
          <Layer key={layer.id} beforeId={beforeId} {...toLayerProps(layer)} />
        ))}
      </Source>
      {arrows && (
        <Source id={ARROWS_SOURCE} type="geojson" data={arrows}>
          <Layer beforeId={beforeId} {...ARROW_LAYER} />
        </Source>
      )}
    </>
  )
}
