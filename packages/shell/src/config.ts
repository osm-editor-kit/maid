import { isAutomated } from '@osm-editor-kit/maid-core'
import { fromIdDisableFeatures } from '@osm-editor-kit/maid-filters'
import type { LayerOptions } from '@osm-editor-kit/maid-renderer'
import { getSettings, type Server } from '@osm-editor-kit/maid-ui'
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

/** The real OSM API. A person logged in there saves to the real map (decided by Tobias on 2026-10-14). */
export const OSM_API = 'https://api.openstreetmap.org'

/** Where a changeset of each server is shown */
export const CHANGESET_URL = {
  osm: 'https://www.openstreetmap.org/changeset/',
  dev: `${DEV_API}/changeset/`,
} as const

/** `live` in the URL: `0` the local mock API, `1` the OSM API, `dev` the development server */
export type LiveMode = '0' | '1' | 'dev'

/**
 * A build that reads live OSM data by default: GitHub Pages (`.github/workflows/pages.yml` sets
 * `VITE_MAID_DATA=live`). Any other build keeps the local mock unless the URL says otherwise.
 */
export const LIVE_BUILD = import.meta.env?.VITE_MAID_DATA === 'live'

const BOTH_SERVERS: readonly Server[] = ['osm', 'dev']

/**
 * The servers a build offers, as iD's `ID_API_CONNECTION`: `VITE_MAID_SERVERS` is `osm`, `dev` or `osm,dev`,
 * the first is the default. Unset or unknown: both, OpenStreetMap first. A fork that releases only to the
 * development server (staging) or only to OpenStreetMap sets one; the server choice then does not show.
 */
export function parseServers(value: string | undefined) {
  const servers = new Set<Server>()
  for (const part of (value ?? '').split(',')) {
    const name = part.trim()
    if (name === 'osm' || name === 'dev') servers.add(name)
  }
  return servers.size > 0 ? [...servers] : [...BOTH_SERVERS]
}

/** The servers of this build (`VITE_MAID_SERVERS`, set by `.github/workflows/pages.yml` from `deploy.env`) */
export const SERVERS = parseServers(import.meta.env?.VITE_MAID_SERVERS)

const modeOf = (server: Server): LiveMode => (server === 'dev' ? 'dev' : '1')

/**
 * Which data the page starts with. The URL's `live` wins, then the person's stored server choice, then the
 * build's default. The stored choice counts only in a live build, so local development and the benchmark
 * keep the mock exactly as before. A live build opens only the servers it offers: a link or a stored choice
 * for another one gets the build's first server.
 */
export function chooseLiveMode(input: {
  url: LiveMode | null
  stored: Server | undefined
  liveBuild: boolean
  servers?: readonly Server[]
}): LiveMode {
  const servers = input.servers ?? BOTH_SERVERS
  const first = modeOf(servers[0] ?? 'osm')
  const offered = (mode: LiveMode) => servers.includes(mode === 'dev' ? 'dev' : 'osm')
  if (input.url)
    return input.liveBuild && input.url !== '0' && !offered(input.url) ? first : input.url
  if (input.liveBuild && input.stored && servers.includes(input.stored)) return modeOf(input.stored)
  return input.liveBuild ? first : '0'
}

/**
 * Where the data of this visit comes from: a fixture of the local mock API, the OSM API, or the OSM
 * development server. The status texts, the journal's name and the account texts all read it.
 */
export type DataSource = 'fixture' | 'osm' | 'dev'

export type Config = {
  scene: string
  apiUrl: string
  /** Live OSM data is a manual mode for people. It is refused under automation. */
  live: boolean
  /** The live data is the OSM development server's */
  dev: boolean
  /** The data's source: `dev` when `dev`, `osm` when `live`, else `fixture` */
  source: DataSource
  /**
   * Where "Log in" goes and edits are saved: the server of the live data. With a fixture the login goes to the
   * development server, and nothing is saved.
   */
  loginServer: Server
  /** This build reads live data by default (a GitHub Pages build): it logs in from the origin it is served from */
  liveBuild: boolean
  /**
   * The account flyout offers the server choice: in a live build or a live session, when the build offers both
   * servers. Never under automation.
   */
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
  /** `?loupe=blank`: the measure's magnifier is drawn with an empty style (the browser check has no imagery) */
  blankLoupe: boolean
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
  choice: { stored: Server | undefined; liveBuild: boolean; servers?: readonly Server[] } = {
    stored: getSettings().server,
    liveBuild: LIVE_BUILD,
    servers: SERVERS,
  },
) {
  const setup = readParams(setupParams, location.search)
  const servers = choice.servers ?? BOTH_SERVERS
  const mode = chooseLiveMode({ url: setup.live, ...choice, servers })
  // one answer for the whole run: a browser does not become automated while the page is open
  const automated = isAutomated()
  const live = mode !== '0' && !automated
  const dev = live && mode === 'dev'
  const source: DataSource = dev ? 'dev' : live ? 'osm' : 'fixture'
  const loginServer: Server = source === 'osm' ? 'osm' : 'dev'
  return {
    scene: setup.scene,
    live,
    dev,
    source,
    loginServer,
    liveBuild: choice.liveBuild,
    serverChoice: !automated && (live || choice.liveBuild) && servers.length > 1,
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
    blankLoupe: setup.loupe === 'blank',
    camera: readParams({ map: stateParams.map }, location.search).map ?? undefined,
    filters: readFilters(location.search),
    background: customBackgroundLink(location.search),
  }
}
