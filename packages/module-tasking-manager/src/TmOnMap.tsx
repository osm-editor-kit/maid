import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useEffect, useRef } from 'react'
import { Layer, type LayerProps, Source, useMap } from 'react-map-gl/maplibre'
import { showTask, type Shared } from './shared.ts'
import { openProject, useTm } from './store.ts'
import type { TmLink } from './url.ts'

type LineLayerProps = Extract<LayerProps, { type: 'line' }>
/** MapLibre's types, taken from the layer props so the module needs no import of maplibre-gl */
type Colour = NonNullable<LineLayerProps['paint']>['line-color']

/**
 * The colour of a task by its status, after the TM's map: available white, mapped yellow, validated green, more mapping
 * needed red, locked grey, unavailable (bad imagery) black. The same in light and dark: they lie on the aerial imagery.
 */
const STATUS_COLOUR: Colour = [
  'match',
  ['get', 'status'],
  'MAPPED',
  '#facc15',
  'VALIDATED',
  '#22c55e',
  'INVALIDATED',
  '#ef4444',
  'LOCKED_FOR_MAPPING',
  '#94a3b8',
  'LOCKED_FOR_VALIDATION',
  '#94a3b8',
  'BADIMAGERY',
  '#18181b',
  '#ffffff',
]

/** HOT's red, for the task the person works on */
const CURRENT = '#d73f3f'

/**
 * The project on the map: its area of interest as a dashed outline, its tasks as squares in the colour of their
 * status, faintly filled under the OSM data, and the current task with a thick red outline and no fill, so the aerial
 * imagery inside it stays clear. The squares take no clicks: a click inside a task selects the building under it.
 *
 * It also opens the project of the `tm` link once the map is up, moves the map to the task when the project is read,
 * and keeps the link in step with what is open.
 */
export function createTmOnMap(
  shared: Shared,
  param: UrlParamHandle<TmLink>,
  open: (link: TmLink) => void,
) {
  const { store } = shared

  return function TmOnMap({ belowOsm, engine }: MapContentProps) {
    const { current: map } = useMap()
    const [link, setLink] = useUrlParam(param)
    const projectId = useTm(store, (state) => state.projectId)
    const taskId = useTm(store, (state) => state.taskId)
    const loaded = useTm(store, (state) => state.loaded)
    const linkRead = useRef(false)
    const placed = useRef<string | null>(null)

    useEffect(() => {
      shared.engine = engine
      return () => {
        shared.engine = undefined
      }
    }, [engine])

    // the link of the page, once, when the map is up
    useEffect(() => {
      if (linkRead.current) return
      linkRead.current = true
      if (link) open(link)
    }, [link])

    // afterwards the URL follows what is open
    useEffect(() => {
      if (!linkRead.current) return
      void setLink(projectId === null ? null : { projectId, taskId })
    }, [projectId, taskId, setLink])

    // the map goes to the task (or the project) once the project is read, and again when another task is chosen
    useEffect(() => {
      if (loaded?.state !== 'ready' || !engine || !map) return
      const key = `${loaded.project.projectId}/${taskId ?? ''}`
      if (placed.current === key) return
      // after the map is idle: the dock that opens with the project resizes the map, which stops an easing that has
      // just started, and the first view of the link is set while the map loads
      const place = () => {
        if (showTask(shared)) placed.current = key
      }
      map.once('idle', place)
      map.triggerRepaint()
      return () => {
        map.off('idle', place)
      }
    }, [loaded, taskId, engine, map])

    const project = loaded?.state === 'ready' ? openProject(store.getState()) : undefined
    if (loaded?.state !== 'ready') return null
    const tasks: GeoJSON.Feature[] = loaded.tasks.map((task) => ({
      type: 'Feature',
      geometry: task.geometry,
      properties: { id: task.taskId, status: task.status, current: task.taskId === taskId },
    }))
    const aoi: GeoJSON.Feature[] = project?.areaOfInterest
      ? [{ type: 'Feature', geometry: project.areaOfInterest, properties: {} }]
      : []

    return (
      <>
        <Source id="tm-aoi" type="geojson" data={{ type: 'FeatureCollection', features: aoi }}>
          <Layer
            id="tm-aoi"
            beforeId={belowOsm}
            type="line"
            paint={{
              'line-color': CURRENT,
              'line-width': 2,
              'line-dasharray': [3, 2],
              'line-opacity': 0.8,
            }}
          />
        </Source>
        <Source id="tm-tasks" type="geojson" data={{ type: 'FeatureCollection', features: tasks }}>
          <Layer
            id="tm-task-fill"
            beforeId={belowOsm}
            type="fill"
            filter={['!=', ['get', 'current'], true]}
            paint={{ 'fill-color': STATUS_COLOUR, 'fill-opacity': 0.18 }}
          />
          <Layer
            id="tm-task-line"
            beforeId={belowOsm}
            type="line"
            filter={['!=', ['get', 'current'], true]}
            paint={{ 'line-color': STATUS_COLOUR, 'line-width': 1.5, 'line-opacity': 0.9 }}
          />
          <Layer
            id="tm-task-current"
            beforeId={belowOsm}
            type="line"
            filter={['==', ['get', 'current'], true]}
            layout={{ 'line-join': 'round' }}
            paint={{ 'line-color': CURRENT, 'line-width': 4 }}
          />
        </Source>
      </>
    )
  }
}
