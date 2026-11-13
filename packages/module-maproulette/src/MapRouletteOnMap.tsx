import { toOsmZoom, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { lineStrings } from '@osm-editor-kit/maid-maproulette'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useEffect, useRef } from 'react'
import {
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  Source,
  useMap,
} from 'react-map-gl/maplibre'
import { goToTask, type Shared } from './shared.ts'
import { shownStatus, tasksShown, useMapRoulette } from './store.ts'
import type { MapRouletteLink } from './url.ts'

type CircleLayerProps = Extract<LayerProps, { type: 'circle' }>
/** MapLibre's types, taken from the layer props so the module needs no import of maplibre-gl */
type Colour = NonNullable<CircleLayerProps['paint']>['circle-color']

/** The layers whose clicks the module takes (`map.content` clickLayers): a click on a pin chooses its task */
export const PIN_LAYER = 'maproulette-pins'
export const CLICK_LAYERS = [PIN_LAYER] as const

/** Waits this long after the map stops before it asks for the tasks of the view */
const VIEW_DELAY_MS = 300

/**
 * The colours of a task by what it shows now (store.ts shownStatus): open in MapRoulette's teal, done (fixed, already
 * fixed) in Maid's emerald, not an issue and too hard grey, skipped light teal; a task waiting for the upload is done
 * already. The same in light and dark, as the other data on the map.
 */
const COLOUR: Colour = [
  'match',
  ['get', 'status'],
  0,
  '#0d9488',
  1,
  '#10b981',
  5,
  '#10b981',
  2,
  '#9ca3af',
  6,
  '#9ca3af',
  3,
  '#5eead4',
  '#0d9488',
]

/**
 * The tasks on the map: the ways of each task as teal lines under the OSM data (so the way to fix and its handles stay
 * on top), a pin per task above it (a click on it opens the task), the current task with a white halo. It also keeps
 * the `maproulette` parameter and the store in step, and asks for the tasks of the view after each move.
 */
export function createMapRouletteOnMap(shared: Shared, param: UrlParamHandle<MapRouletteLink>) {
  const { store, controller } = shared

  return function MapRouletteOnMap({ belowOsm, engine }: MapContentProps) {
    const { current: map } = useMap()
    const [link, setLink] = useUrlParam(param)
    const challengeId = useMapRoulette(store, (state) => state.challengeId)
    const currentTaskId = useMapRoulette(store, (state) => state.currentTaskId)
    const tasks = useMapRoulette(store, (state) => state.tasks)
    const finished = useMapRoulette(store, (state) => state.finished)
    const earmarks = useMapRoulette(store, (state) => state.earmarks)
    const linkRead = useRef(false)

    useEffect(() => {
      shared.engine = engine
      return () => {
        shared.engine = undefined
      }
    }, [engine])

    // the link of the page: its challenge and task, once, when the map is up
    useEffect(() => {
      if (linkRead.current) return
      linkRead.current = true
      if (!link) return
      controller.openChallenge(link.challengeId)
      if (link.taskId) controller.chooseTask(link.taskId)
    }, [link])

    // afterwards the URL follows what is open (read from the store: the link's own effect above has just set it)
    useEffect(() => {
      if (!linkRead.current) return
      const open = store.getState()
      void setLink(
        open.challengeId === null && open.currentTaskId === null
          ? null
          : { challengeId: open.challengeId, taskId: open.currentTaskId },
      )
    }, [challengeId, currentTaskId, setLink])

    // a task of a link that is not in view yet: the map goes there once its details are read
    const currentDetail = useMapRoulette(store, (state) =>
      state.currentTaskId === null ? undefined : state.details[state.currentTaskId],
    )
    const placed = useRef<string | null>(null)
    useEffect(() => {
      if (currentTaskId === null || placed.current === currentTaskId) return
      if (store.getState().tasks[currentTaskId]) {
        placed.current = currentTaskId
        return
      }
      if (currentDetail?.state !== 'ready') return
      placed.current = currentTaskId
      const points = lineStrings(currentDetail.value.geometries).flat()
      if (points.length === 0) return
      const lons = points.map((p) => p[0])
      const lats = points.map((p) => p[1])
      engine?.camera.fitBounds([
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      ])
    }, [currentTaskId, currentDetail, engine])

    // the tasks of the view, after each move. A child of the map has no moveend prop of its own: it listens here.
    useEffect(() => {
      if (!map) return
      let timer: ReturnType<typeof setTimeout> | undefined
      const update = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const bounds = map.getBounds()
          const center = map.getCenter()
          void controller.loadView({
            bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
            zoom: toOsmZoom(map.getZoom()),
            center: [center.lng, center.lat],
          })
        }, VIEW_DELAY_MS)
      }
      update()
      map.on('moveend', update)
      return () => {
        clearTimeout(timer)
        map.off('moveend', update)
      }
    }, [map])

    // a click on a pin opens its task; the shell selects nothing under it (clickLayers)
    useEffect(() => {
      if (!map) return
      const choose = (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties.id
        if (typeof id === 'string') goToTask(shared, id)
      }
      const enter = () => {
        map.getCanvas().style.cursor = 'pointer'
      }
      const leave = () => {
        map.getCanvas().style.cursor = ''
      }
      map.on('click', PIN_LAYER, choose)
      map.on('mouseenter', PIN_LAYER, enter)
      map.on('mouseleave', PIN_LAYER, leave)
      return () => {
        map.off('click', PIN_LAYER, choose)
        map.off('mouseenter', PIN_LAYER, enter)
        map.off('mouseleave', PIN_LAYER, leave)
      }
    }, [map])

    const shown = tasksShown({ tasks, challengeId })
    const lines: GeoJSON.Feature[] = []
    const pins: GeoJSON.Feature[] = []
    for (const task of shown) {
      const id = String(task.id)
      const { status } = shownStatus({ finished, earmarks }, task)
      const current = id === currentTaskId
      for (const line of lineStrings(task.geometries))
        lines.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: line },
          properties: { id, status, current },
        })
      const pin = controller.locationOf(id)
      if (pin)
        pins.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pin },
          properties: { id, status, current },
        })
    }

    return (
      <>
        <Source
          id="maproulette-lines"
          type="geojson"
          data={{ type: 'FeatureCollection', features: lines }}
        >
          <Layer
            id="maproulette-current-halo"
            beforeId={belowOsm}
            type="line"
            filter={['==', ['get', 'current'], true]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#ffffff', 'line-width': 12, 'line-opacity': 0.8 }}
          />
          <Layer
            id="maproulette-lines"
            beforeId={belowOsm}
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': COLOUR,
              'line-width': ['case', ['==', ['get', 'current'], true], 7, 5],
              'line-opacity': 0.75,
            }}
          />
        </Source>
        <Source
          id="maproulette-pins"
          type="geojson"
          data={{ type: 'FeatureCollection', features: pins }}
        >
          <Layer
            id={PIN_LAYER}
            type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'current'], true], 8, 6],
              'circle-color': COLOUR,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': ['case', ['==', ['get', 'current'], true], 3, 1.5],
            }}
          />
        </Source>
      </>
    )
  }
}
