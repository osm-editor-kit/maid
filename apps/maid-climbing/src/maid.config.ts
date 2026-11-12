import { lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * Maid Climbing: an editor for climbing and bouldering, crags and their routes (plan: docs/research/climbing.md).
 * Compared with apps/maid it leaves out `surface` and turn restrictions, and adds `climbing()` (the section of a crag,
 * an area and a route, and the fields of id-tagging-schema PR 2793) and `terrain()` (relief and 3D, which lets the map
 * tilt). Routes are grouped in relations, so the shared relation column is the main tool besides the section.
 */
import { defaultFilters, type FilterState } from '@osm-editor-kit/maid-filters'
import { climbing } from '@osm-editor-kit/maid-module-climbing'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import { streetImagery } from '@osm-editor-kit/maid-module-street-imagery'
import { tasks } from '@osm-editor-kit/maid-module-tasks'
import { terrain } from '@osm-editor-kit/maid-module-terrain'
import { defaultOperations } from '@osm-editor-kit/maid-operations'
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
import climbingScene from '../../../fixtures/climbing.meta.json'
import dense from '../../../fixtures/dense.meta.json'
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
  climbing: climbingScene.bbox as Bbox,
  small: small.bbox as Bbox,
  dense: dense.bbox as Bbox,
}

// the imagery module, made once
const background = imagery()

function editorConfig(config: Config) {
  /**
   * The presets of this editor, made after the first picture (see presets.ts): the tagging schema's with what modules
   * add to them. Until they are there, pins and vertices have no icon and the inspector waits.
   */
  const presets = lazyPresets(() => import('./presets').then((module) => module.makePresets()))
  const bbox = fixtureBounds(config, BBOX)
  const modules: MaidModule[] = [
    // private task lists: a GeoJSON file of features to check, the progress in the OSM user preferences (ADR 0013)
    tasks(),
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // the edit menu: reverse, split, merge, straighten, square, make round, disconnect, extract
    operations(defaultOperations),
    // inspector sections "Members" and "Relations" and the relation column: crags and areas are relations of routes
    relations(),
    // checks what was changed here: inspector section and dock view "Issues"
    validation({ rules: defaultRules }),
    // top bar "Background": aerial imagery and overlays under the OSM data (ELI's shaded reliefs are overlays here)
    background,
    // top bar "Terrain": the relief under the data and the ground in 3D; the map may tilt (Mapterhorn, with a notice)
    terrain(),
    // inspector section "Climbing": a crag's routes, an area's crags, a route's crag
    climbing(),
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": the shared lenses
    lenses(),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules, presets, filters: climbingFilters }
}

/**
 * The filters of the climbing editor: points, paths and the rest (crags, routes, cliffs) editable; buildings, land use,
 * water and the like locked, so the map stays on the rock. The person can change them in the filter panel.
 */
const CLIMBING_FILTER_STATES: Record<string, FilterState> = {
  past_future: 'readonly',
  address_points: 'hidden',
  building_parts: 'hidden',
  indoor: 'hidden',
  pistes: 'readonly',
  aerialways: 'readonly',
  power: 'readonly',
  water: 'readonly',
  traffic_roads: 'readonly',
  rail: 'readonly',
  buildings: 'readonly',
  boundaries: 'hidden',
  landuse: 'readonly',
  shops: 'readonly',
}
const climbingFilters = defaultFilters.map((filter) => ({
  ...filter,
  state: CLIMBING_FILTER_STATES[filter.id] ?? filter.state,
}))

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-climbing',
  brand: { name: 'Maid Climbing', detail: 'Climbing and bouldering', logo, favicon },
  version,
  // German unless the URL (`?lang=`), the stored choice or the browser names a language; automation stays English
  defaultLocale: 'de',
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5181',
    envFile: 'apps/maid-climbing/.env.local',
  },
  editor: editorConfig,
}
