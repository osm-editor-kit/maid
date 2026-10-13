import { isAutomated } from '@osm-editor-kit/maid-core'
import { fromIdDisableFeatures } from '@osm-editor-kit/maid-filters'
import type { LayerOptions } from '@osm-editor-kit/maid-renderer'
import { useSettings, type Server } from '@osm-editor-kit/maid-ui'
import { PORTS } from '../../../tools/ports'
import { customBackgroundLink } from './url/background'
import { readParams, setupParams, stateParams, type Camera } from './url/params'

/**
 * What the app is started with. Read once from the URL before React renders, so that
 * experiments and the benchmark run the same build.
 * Example: /?scene=dense&fill=full&map=17/52.4845/13.433
 */
/** The OSM development server: its own, nearly empty database, for trying login and saving */
export const DEV_API = 'https://master.apis.dev.openstreetmap.org'

/** The real OSM API. Read only from here: nothing is ever saved to it. */
export const OSM_API = 'https://api.openstreetmap.org'

/** `live` in the URL: `0` the local mock API, `1` the OSM API (read only), `dev` the development server */
export type LiveMode = '0' | '1' | 'dev'

/**
 * A build that reads live OSM data by default: GitHub Pages (`.github/workflows/pages.yml` sets
 * `VITE_MAID_DATA=live`). Any other build keeps the local mock unless the URL says otherwise.
 */
export const LIVE_BUILD = import.meta.env?.VITE_MAID_DATA === 'live'

/**
 * Which data the page starts with. The URL's `live` wins, then the person's stored server choice, then the
 * build's default. The stored choice counts only in a live build, so local development and the benchmark
 * keep the mock exactly as before.
 */
export function chooseLiveMode(input: {
  url: LiveMode | null
  stored: Server | undefined
  liveBuild: boolean
}): LiveMode {
  if (input.url) return input.url
  if (input.liveBuild && input.stored) return input.stored === 'dev' ? 'dev' : '1'
  return input.liveBuild ? '1' : '0'
}

export type Config = {
  scene: string
  apiUrl: string
  /** Live OSM data is a manual mode for people. It is refused under automation. */
  live: boolean
  /**
   * The live data is the OSM development server's. Only then can edits be saved: nothing is
   * ever saved to the real map from here (AGENTS.md, core rule 1).
   */
  dev: boolean
  /** The account flyout offers the server choice: in a live build or a live session. Never under automation. */
  serverChoice: boolean
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
  /** Filter states the URL starts with: Maid's `filters`, or iD's `disable_features` */
  filters: string | null
  /** The template of a `background=custom:` link, for this visit only (url/background.ts) */
  background: string | undefined
}

/** Maid's own parameter wins; a link made for iD hides what it lists in `disable_features` */
function readFilters(search: string) {
  const own = readParams({ filters: stateParams.filters }, search).filters
  if (own) return own
  const disabled = new URLSearchParams(search).get('disable_features')
  return disabled ? fromIdDisableFeatures(disabled) : null
}

export function readConfig(
  location: Location,
  choice: { stored: Server | undefined; liveBuild: boolean } = {
    stored: useSettings.getState().server,
    liveBuild: LIVE_BUILD,
  },
) {
  const setup = readParams(setupParams, location.search)
  const mode = chooseLiveMode({ url: setup.live, ...choice })
  const live = mode !== '0' && !isAutomated()
  const dev = live && mode === 'dev'
  return {
    scene: setup.scene,
    live,
    dev,
    serverChoice: !isAutomated() && (live || choice.liveBuild),
    apiUrl: dev ? DEV_API : live ? OSM_API : `http://localhost:${PORTS.mockApi}/s/${setup.scene}`,
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
    filters: readFilters(location.search),
    background: customBackgroundLink(location.search),
  }
}
