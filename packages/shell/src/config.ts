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

/**
 * Where the data comes from, and `api` in the URL: the local mock API with its fixtures, OpenStreetMap, or the OSM
 * development server. The status texts, the journal's name and the account texts all read it.
 */
export type DataSource = 'mock' | Server

/**
 * A deployed build (GitHub Pages): a production build that does not measure. It reads a real server by default and
 * logs in from the origin it is served from. Dev servers and the builds of `bun run bench` and `bun run compare`
 * (`VITE_BENCH=1`) read the mock unless the URL says otherwise.
 */
export const DEPLOYED = import.meta.env?.PROD === true && import.meta.env?.VITE_BENCH !== '1'

/** The servers an editor offers when its app config names none (`AppConfig.osm.servers`): both, OpenStreetMap first */
const BOTH_SERVERS: readonly Server[] = ['osm', 'dev']

/**
 * Where the data of this visit comes from. The URL's `api` wins, then the person's stored server choice, then the
 * build's default. The stored choice counts only in a deployed build, so local development and the benchmark
 * keep the mock. A deployed build opens only the servers it offers: a link or a stored choice for another one
 * gets its first server.
 */
export function chooseSource(input: {
  url: DataSource | null
  stored: Server | undefined
  deployed: boolean
  servers?: readonly Server[]
}): DataSource {
  const servers = input.servers ?? BOTH_SERVERS
  const first = servers[0] ?? 'osm'
  if (input.url)
    return input.deployed && input.url !== 'mock' && !servers.includes(input.url)
      ? first
      : input.url
  if (input.deployed && input.stored && servers.includes(input.stored)) return input.stored
  return input.deployed ? first : 'mock'
}

export type Config = {
  scene: string
  apiUrl: string
  /** Where the data comes from. A server only for a person: under automation always the mock (AGENTS.md, core rule 1). */
  source: DataSource
  /**
   * Where "Log in" goes and edits are saved: the server of the data. With the mock the login goes to the
   * development server, and nothing is saved.
   */
  loginServer: Server
  /** A deployed build (`DEPLOYED`): it logs in from the origin it is served from */
  deployed: boolean
  /**
   * The account flyout offers the server choice: in a deployed build or on a server, when the editor offers both.
   * Never under automation.
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
  choice: { stored: Server | undefined; deployed: boolean; servers?: readonly Server[] } = {
    stored: getSettings().server,
    deployed: DEPLOYED,
  },
) {
  const setup = readParams(setupParams, location.search)
  const servers = choice.servers ?? BOTH_SERVERS
  // one answer for the whole run: a browser does not become automated while the page is open
  const automated = isAutomated()
  const source: DataSource = automated
    ? 'mock'
    : chooseSource({ url: setup.api, ...choice, servers })
  const loginServer: Server = source === 'osm' ? 'osm' : 'dev'
  return {
    scene: setup.scene,
    source,
    loginServer,
    deployed: choice.deployed,
    serverChoice: !automated && (source !== 'mock' || choice.deployed) && servers.length > 1,
    apiUrl:
      source === 'dev'
        ? DEV_API
        : source === 'osm'
          ? OSM_API
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
    blankLoupe: setup.loupe === 'blank',
    camera: readParams({ map: stateParams.map }, location.search).map ?? undefined,
    filters: readFilters(location.search),
    background: customBackgroundLink(location.search),
  }
}
