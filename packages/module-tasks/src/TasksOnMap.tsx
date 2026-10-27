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
 * status (open orange, done green, ignored grey, skipped blue), the current task with a white halo. The data is set
 * once per file; a status change only changes the paint expression.
 */
export function createTasksOnMap(store: TasksStore) {
  return function TasksOnMap(_props: MapContentProps) {
    const geojson = useTasks(store, (state) => state.list?.geojson)
    const statuses = useTasks(store, (state) => state.statuses)
    const currentGeometry = useTasks(store, (state) =>
      state.current === null ? undefined : state.list?.file.features[state.current]?.geometry,
    )
    if (!geojson) return null
    const colour = colourExpression(statuses) as Colour
    return (
      <>
        <Source id="tasks" type="geojson" data={geojson}>
          <Layer
            id="tasks-line"
            type="line"
            filter={NOT_POINT}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colour, 'line-width': 4, 'line-opacity': 0.85 }}
          />
          <Layer
            id="tasks-circle"
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
        {currentGeometry && (
          <Source
            id="tasks-current"
            type="geojson"
            data={{
              type: 'Feature',
              geometry: currentGeometry as GeoJSON.Geometry,
              properties: {},
            }}
          >
            <Layer
              id="tasks-current-line"
              type="line"
              filter={NOT_POINT}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.7 }}
            />
            <Layer
              id="tasks-current-circle"
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
