import { OsmRelation, type Graph } from '@osm-editor-kit/maid-model'
/**
 * The relation on the map while it is selected: a route shows the ends of its gaps and the direction of its ways; a
 * superrelation shows its own ways strong and its sub-routes lighter, and only the sub-route the sidebar points at
 * strong. Nothing is drawn while no relation is selected, or when the selection is several entities.
 *
 * Registered on `map.content` (relations.tsx). The shapes are computed by relations-map-shapes.ts (pure); this file has the
 * component, the graph read after each change, and the layers.
 */
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { SELECTED_ARROW_HEIGHT, SELECTED_ARROW_IMAGE } from '@osm-editor-kit/maid-renderer'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre'
import { useEngine } from '../shell-context'
import { drawingOf, onSubRouteHovered, subRouteHovered } from './relations-map-shapes.ts'

const GROUPS = 'relation-map-groups'
const ARROWS = 'relation-map-arrows'
const GAPS = 'relation-map-gaps'
const LABELS = 'relation-map-labels'

/** Amber, as the gap warning of the sidebar: the ring at each end of a gap */
const GAP_AMBER = '#f59e0b'

/** Arrows from this zoom on: a route's arrows are many, and at a small zoom they are only noise */
const ARROWS_MIN_ZOOM = 14

/** The layers as react-map-gl takes them. Their expressions are JSON arrays of the style spec, typed by maplibre-gl. */
function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

/**
 * The graph of the editor's history, read again after each change of it (a load, an edit, undo). The graph itself is not
 * a React value, so each change stores a new snapshot object. The same as the parking lens (side-features.tsx).
 */
function useGraph(history: MapContentProps['editor']['history']): Graph {
  const [snapshot, setSnapshot] = useState(() => ({ graph: history.staging.graph }))
  useEffect(() => {
    const bump = () => setSnapshot({ graph: history.staging.graph })
    const stops = [
      history.on('merge', bump),
      history.on('stagingchange', bump),
      history.on('historyjump', bump),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  }, [history])
  return snapshot.graph
}

/**
 * The selected relation on the map. `belowOsm` is the layer under the OSM data: the lines of a superrelation's
 * ways go there, as a glow under the roads; the arrows, the gap rings and the labels are drawn on top.
 */
export function RelationsOnMap({ editor, belowOsm }: MapContentProps) {
  const selection = useEngine((engine) => engine.selection)
  // the sub-route the sidebar points at (relations-sections.tsx sets it); only a superrelation uses it
  const hovered = useSyncExternalStore(onSubRouteHovered, subRouteHovered)
  const graph = useGraph(editor.history)
  const drawing = useMemo(() => {
    if (selection.length !== 1) return undefined
    const relation = graph.hasEntity(selection[0]!)
    if (!(relation instanceof OsmRelation)) return undefined
    return drawingOf(graph, relation, hovered)
  }, [graph, selection, hovered])
  if (!drawing) return null
  return (
    <>
      <Source id={GROUPS} type="geojson" data={drawing.groups}>
        <Layer
          {...asLayer({
            id: 'relation-map-glow',
            type: 'line',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'colour'],
              'line-width': ['case', ['==', ['get', 'strong'], 1], 7, 4],
              'line-opacity': ['case', ['==', ['get', 'strong'], 1], 0.85, 0.3],
            },
          })}
          beforeId={belowOsm}
        />
      </Source>
      <Source id={ARROWS} type="geojson" data={drawing.arrows}>
        <Layer
          {...asLayer({
            id: 'relation-map-arrows',
            type: 'line',
            minzoom: ARROWS_MIN_ZOOM,
            layout: { 'line-cap': 'butt' },
            // the white arrow of the selected way (renderer direction-images.ts): it points along the line
            paint: { 'line-pattern': SELECTED_ARROW_IMAGE, 'line-width': SELECTED_ARROW_HEIGHT },
          })}
        />
      </Source>
      <Source id={GAPS} type="geojson" data={drawing.gaps}>
        <Layer
          {...asLayer({
            id: 'relation-map-gap',
            type: 'circle',
            paint: {
              'circle-radius': 6,
              'circle-color': '#fff',
              'circle-stroke-color': GAP_AMBER,
              'circle-stroke-width': 2.5,
            },
          })}
        />
      </Source>
      <Source id={LABELS} type="geojson" data={drawing.labels}>
        <Layer
          {...asLayer({
            id: 'relation-map-label',
            type: 'symbol',
            minzoom: 11,
            layout: {
              'symbol-placement': 'line',
              'text-field': ['get', 'label'],
              'text-font': ['Open Sans Semibold'],
              'text-size': 12,
            },
            paint: {
              'text-color': ['get', 'colour'],
              'text-halo-color': '#fff',
              'text-halo-width': 1.5,
            },
          })}
        />
      </Source>
    </>
  )
}
