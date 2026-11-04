import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { Layer, type LayerProps, Source } from 'react-map-gl/maplibre'
import { colourExpression } from './list.ts'
import { type TasksStore, useTasks } from './store.ts'

type CircleLayerProps = Extract<LayerProps, { type: 'circle' }>
/** MapLibre's types, taken from the layer props so the module needs no import of maplibre-gl */
type Filter = CircleLayerProps['filter']
type Colour = NonNullable<CircleLayerProps['paint']>['circle-color']

const NOT_POINT: Filter = ['!=', ['geometry-type'], 'Point']
const POINT: Filter = ['==', ['geometry-type'], 'Point']

/**
 * The geometries of the open list on the map: points as circles, lines and polygon outlines as lines, coloured by
 * status (open orange, done green, ignored grey, skipped blue), the current task with a white halo (and the place of
 * each of its "create" options that has a geometry of its own). All under the OSM
 * data (`belowOsm`), so the way to fix and its handles stay on top. The data is set once per file; a status change
 * only changes the paint expression (the React Compiler keeps the current task's data while its geometry is the same).
 */
export function createTasksOnMap(store: TasksStore) {
  return function TasksOnMap({ belowOsm }: MapContentProps) {
    const geojson = useTasks(store, (state) => state.list?.geojson)
    const statuses = useTasks(store, (state) => state.statuses)
    const current = useTasks(store, (state) =>
      state.current === null ? undefined : state.list?.file.features[state.current],
    )
    if (!geojson) return null
    // the current task's geometry, and where its "create" options with a geometry of their own would add a feature
    const currentData: GeoJSON.FeatureCollection | undefined = current && {
      type: 'FeatureCollection',
      features: [current.geometry, ...(current.properties.options ?? []).map((o) => o.geometry)]
        .filter((geometry) => geometry !== undefined)
        .map((geometry) => ({
          type: 'Feature',
          geometry: geometry as GeoJSON.Geometry,
          properties: {},
        })),
    }
    const colour = colourExpression(statuses) as Colour
    return (
      <>
        <Source id="tasks" type="geojson" data={geojson}>
          <Layer
            id="tasks-line"
            beforeId={belowOsm}
            type="line"
            filter={NOT_POINT}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colour, 'line-width': 4, 'line-opacity': 0.85 }}
          />
          <Layer
            id="tasks-circle"
            beforeId={belowOsm}
            type="circle"
            filter={POINT}
            paint={{
              'circle-radius': 6,
              'circle-color': colour,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
            }}
          />
        </Source>
        {currentData && (
          <Source id="tasks-current" type="geojson" data={currentData}>
            <Layer
              id="tasks-current-line"
              beforeId={belowOsm}
              type="line"
              filter={NOT_POINT}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.7 }}
            />
            <Layer
              id="tasks-current-circle"
              beforeId={belowOsm}
              type="circle"
              filter={POINT}
              paint={{
                'circle-radius': 11,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 3,
              }}
            />
          </Source>
        )}
      </>
    )
  }
}
