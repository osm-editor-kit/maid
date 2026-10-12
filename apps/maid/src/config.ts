import type { LayerOptions } from '@osm-editor-kit/maid-renderer'
import { PORTS } from '../../../tools/ports'
import { readParams, setupParams, stateParams, type Camera } from './url/params'

/**
 * What the app is started with. Read once from the URL before React renders, so that
 * experiments and the benchmark run the same build.
 * Example: /?scene=dense&fill=full&map=17/52.4845/13.433
 */
export type Config = {
  scene: string
  apiUrl: string
  /** Live OSM data is a manual mode for people. It is refused under automation. */
  live: boolean
  fill: LayerOptions['fill']
  /** Inspector, controls and status bar. `ui=0` leaves only the map. */
  ui: boolean
  labels: boolean
  icons: boolean
  pins: LayerOptions['pins']
  workers: number
  minDataZoom: number
  tolerance: number
  sourceMaxZoom: number
  /** MapLibre's label fade in ms. 0 makes it place symbols on every frame. */
  fade: number
  /** Where the map starts, if the URL says so */
  camera?: Camera
}

export function readConfig(location: Location): Config {
  const setup = readParams(setupParams, location.search)
  const live = setup.live && !navigator.webdriver
  return {
    scene: setup.scene,
    live,
    apiUrl: live
      ? 'https://api.openstreetmap.org'
      : `http://localhost:${PORTS.mockApi}/s/${setup.scene}`,
    fill: setup.fill,
    ui: setup.ui,
    labels: setup.labels,
    icons: setup.icons,
    pins: setup.pins,
    workers: setup.workers,
    minDataZoom: setup.minDataZoom,
    tolerance: setup.tolerance,
    sourceMaxZoom: setup.sourceMaxZoom,
    fade: setup.fade,
    camera: readParams({ map: stateParams.map }, location.search).map ?? undefined,
  }
}
