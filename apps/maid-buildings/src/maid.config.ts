import { canBeArea, lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
import { defaultFilters, type FilterState } from '@osm-editor-kit/maid-filters'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * Maid Buildings: an editor for building mapping campaigns. Compared with apps/maid it leaves out `surface` (surface
 * and smoothness photos) and adds `buildings()` with the buildings map style as the standard (after the kaligrafy iD
 * fork), the building presets first and as suggested favourites, and the drawing tools of the parking editor (rectangle,
 * right angles with lengths, extrude, resize, merge, cut, divide). Square (Q), the merge of very close points, Rotate
 * and Move are in every Maid. Roads, paths, rail, water and power are locked as context.
 */
import {
  BUILDING_FAVOURITES,
  buildings,
  buildingsLens,
} from '@osm-editor-kit/maid-module-buildings'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import {
  angleSnap,
  cutArea,
  divideArea,
  extrude,
  resize,
  mergeAreas,
  rectangle,
} from '@osm-editor-kit/maid-module-shapes'
import { streetImagery } from '@osm-editor-kit/maid-module-street-imagery'
import { tasks } from '@osm-editor-kit/maid-module-tasks'
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
    // checks what was changed here: inspector section and dock view "Issues" (crossing buildings, very close points, ...)
    validation({ rules: defaultRules }),
    // top bar "Background": aerial imagery and overlays under the OSM data
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": "Standard: Buildings" is this editor's standard (every building in red, its type and its number
    // of dwellings in colour), listed under Maid standard and on at the first visit
    lenses({ lenses: [buildingsLens], editorDefault: 'buildings' }),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // the building editor: the number of dwellings on each building that has one, from zoom 17
    buildings(),
    // drawing tools for buildings (docs/research/drawing-tools): Shift holds right angles, with the lengths of the
    // segments while a node is placed
    angleSnap({ lengths: true }),
    // the Area button's "Rectangle" (key 33) draws one with three clicks,
    rectangle(),
    // the edit menu merges two areas into one outline,
    mergeAreas(),
    // cuts an area along a drawn line,
    cutArea(),
    // divides one into rows and columns (a block into row houses),
    divideArea(),
    // and resizes the selection with a box and handles (K; Shift keeps the proportions, Alt the centre)
    resize(),
    // and pulls one side out or in, as JOSM's Extrude (J; Shift moves the side, a click on the outline adds a corner)
    extrude(),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules, presets, filters: buildingFilters }
}

/**
 * The filters of the building editor: buildings, building parts, addresses, points (shops and entrances in a building),
 * landuse and the past and future (building sites, demolished buildings) editable; roads, paths, rail, water and power
 * drawn faint and locked, so a building is drawn and moved without being glued to a road or a fence of the street;
 * pistes, aerialways, indoor and boundaries hidden. The person can change them in the filter panel as in any Maid.
 */
const BUILDING_FILTER_STATES: Record<string, FilterState> = {
  buildings: 'editable',
  building_parts: 'editable',
  address_points: 'editable',
  traffic_roads: 'readonly',
  service_roads: 'readonly',
  paths: 'readonly',
  rail: 'readonly',
  water: 'readonly',
  power: 'readonly',
  indoor: 'hidden',
  pistes: 'hidden',
  aerialways: 'hidden',
  boundaries: 'hidden',
}
const buildingFilters = defaultFilters.map((filter) => ({
  ...filter,
  state: BUILDING_FILTER_STATES[filter.id] ?? filter.state,
}))

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-buildings',
  brand: { name: 'Maid Buildings', detail: 'Building mapping campaigns', logo, favicon },
  version,
  // German unless the URL (`?lang=`), the stored choice or the browser names a language; automation stays English
  defaultLocale: 'de',
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5182',
    envFile: 'apps/maid-buildings/.env.local',
  },
  editor: editorConfig,
  // the favourites a building mapper starts with, while they have none of their own (packages/module-buildings presets.ts)
  favourites: BUILDING_FAVOURITES,
}
