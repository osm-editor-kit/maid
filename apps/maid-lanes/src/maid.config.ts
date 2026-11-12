import { canBeArea, lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * Maid Lanes: an editor for the lanes of roads. Compared with apps/maid it leaves out `surface` (surface and
 * smoothness photos), and adds `lanes()` with its lens, the traffic sign field and the way table (the lanes of the ways
 * along a street side by side). Everything else of apps/maid is kept.
 */
import { defaultFilters, type FilterState } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { laneRules, lanes, lanesLens } from '@osm-editor-kit/maid-module-lanes'
import { lensChoice, lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import { streetImagery } from '@osm-editor-kit/maid-module-street-imagery'
import { tasks } from '@osm-editor-kit/maid-module-tasks'
import { trafficSigns } from '@osm-editor-kit/maid-module-traffic-signs'
import {
  turnRestrictionRules,
  turnRestrictions,
} from '@osm-editor-kit/maid-module-turn-restrictions'
import { wayTable } from '@osm-editor-kit/maid-module-way-table'
import { defaultOperations, pointToArea } from '@osm-editor-kit/maid-operations'
import { operations } from '@osm-editor-kit/maid-renderer'
import {
  type AppConfig,
  type Bbox,
  type Config,
  elementInfo,
  fixtureBounds,
  relations,
  sceneBounds,
  validation,
} from '@osm-editor-kit/maid-shell'
import { defaultRules } from '@osm-editor-kit/maid-validation'
import dense from '../../../fixtures/dense.meta.json'
import medium from '../../../fixtures/medium.meta.json'
import small from '../../../fixtures/small.meta.json'
import { mapillaryToken } from '../../mapillary-token.ts'
import { version } from '../package.json'
import favicon from './brand/favicon.svg'
import logo from './brand/logo.svg'

/**
 * Extent of each fixture, from its meta file. The casts stay on purpose: JSON imports as number[], not
 * as the four-number tuple, and the committed fixtures are trusted, so no runtime check is needed.
 */
const BBOX: Record<string, Bbox> = {
  small: small.bbox as Bbox,
  medium: medium.bbox as Bbox,
  dense: dense.bbox as Bbox,
}

// the imagery module, made once
const background = imagery()

function editorConfig(config: Config) {
  /**
   * The presets of this editor, made after the first picture (see presets.ts, which holds the data and the changes, so
   * that they are a chunk of their own that is not read before the map exists): the tagging schema's with what modules
   * add to them, in German when the visit is German. The language of the visit is set before the editor is made
   * (mount.tsx) and the presets are made later still. Until they are there, pins and vertices have no icon and the
   * inspector waits.
   */
  const presets = lazyPresets(() => import('./presets').then((module) => module.makePresets()))
  const bbox = fixtureBounds(config, BBOX)
  const modules: MaidModule[] = [
    // private task lists: a GeoJSON file of features to check, the progress in the OSM user preferences (ADR 0013)
    tasks(),
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // the edit menu: reverse, split, merge, straighten, square, make round, disconnect, extract
    // plus "Turn into an area" for a point whose type can also be mapped as an area
    operations([...defaultOperations, pointToArea({ canBeArea: canBeArea(presets) })]),
    // inspector sections "Members" and "Relations": what a relation contains, what a feature is in
    relations(),
    // checks what was changed here: inspector section and dock view "Issues"
    validation({ rules: [...defaultRules, ...turnRestrictionRules, ...laneRules] }),
    // inspector section "Turn restrictions" on a junction: lanes and turns are mapped together
    turnRestrictions(),
    // top bar "Background": aerial imagery and overlays under the OSM data
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": lenses that recolour the map for one theme; "Lanes" is this app's
    lenses({ lenses: [lanesLens] }),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // the lanes editor: section "Lanes" above the fields of a road, with the cross-section and the lane table;
    // the lanes lens is on at the first visit
    lanes({ lenses: lensChoice }),
    // the German traffic sign field on roads (bus lanes, cycle lanes, turn arrows)
    trafficSigns({ country: 'DE' }),
    // dock "Way table": the selected way next to the ways before and after it, tag by tag
    wayTable(),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules, presets, filters: lanesFilters }
}

/**
 * The filters of the lanes editor: roads and paths editable, the rest locked or hidden, so the map stays on the street
 * (Tobias, 2026-11-12). The person can change them in the filter panel as in any Maid.
 */
const LANES_FILTER_STATES: Record<string, FilterState> = {
  past_future: 'readonly',
  address_points: 'hidden',
  building_parts: 'hidden',
  indoor: 'hidden',
  pistes: 'readonly',
  aerialways: 'readonly',
  power: 'readonly',
  water: 'readonly',
  buildings: 'readonly',
  boundaries: 'hidden',
  landuse: 'readonly',
  shops: 'readonly',
  points: 'readonly',
  others: 'readonly',
}
const lanesFilters = defaultFilters.map((filter) => ({
  ...filter,
  state: LANES_FILTER_STATES[filter.id] ?? filter.state,
}))

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-lanes',
  brand: { name: 'Maid Lanes', detail: 'Lanes of roads', logo, favicon },
  version,
  // German unless the URL (`?lang=`), the stored choice or the browser names a language; automation stays English
  defaultLocale: 'de',
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5179',
    envFile: 'apps/maid-lanes/.env.local',
  },
  editor: editorConfig,
}
