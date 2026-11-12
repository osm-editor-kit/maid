import { canBeArea, lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * Maid Golf, a prototype: an editor for golf courses (plan: docs/research/golf/plan.md). Compared with apps/maid it
 * leaves out `surface` (surface and smoothness photos), and adds `golf()` with its scorecard in the dock, the golf lens
 * as the standard map style, the golf rules and presets, and the drawing tools of the parking editor for greens,
 * bunkers and tees. Roads, buildings and shops are locked by the filters.
 */
import { defaultFilters, type FilterState } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { golf, golfLens, golfRules } from '@osm-editor-kit/maid-module-golf'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import {
  angleSnap,
  cutArea,
  mergeAreas,
  rectangle,
  resize,
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
import golfScene from '../../../fixtures/golf.meta.json'
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
  golf: golfScene.bbox as Bbox,
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
    // checks what was changed here: inspector section and dock view "Issues"; the golf rules come last
    validation({ rules: [...defaultRules, ...golfRules] }),
    // top bar "Background": aerial imagery and overlays under the OSM data; golf courses are traced from it
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": "Standard: Golf" is this editor's standard, listed under Maid standard and on at the first visit
    lenses({ lenses: [golfLens], editorDefault: 'golf' }),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // the golf editor: dock view "Holes", the scorecard of the loaded holes
    golf(),
    // drawing tools for greens, bunkers, tees and the clubhouse: Shift holds right angles, with the segment lengths,
    angleSnap({ lengths: true }),
    // the Area button's "Rectangle" (a tee box) draws one with three clicks,
    rectangle(),
    // the edit menu merges two areas into one outline (a fairway and its green with a fringe),
    mergeAreas(),
    // cuts an area along a drawn line (the rough around a fairway),
    cutArea(),
    // and resizes the selection with a box and handles (K; Shift keeps the proportions, Alt the centre)
    resize(),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules, presets, filters: golfFilters }
}

/**
 * The filters of the golf editor: what a course is made of editable (landuse, natural, water, paths and the rest), the
 * streets, buildings, rail, power and shops around it locked, address points, building parts, indoor and boundaries
 * hidden. The person can change them in the filter panel as in any Maid.
 */
const GOLF_FILTER_STATES: Record<string, FilterState> = {
  past_future: 'readonly',
  address_points: 'hidden',
  building_parts: 'hidden',
  indoor: 'hidden',
  pistes: 'hidden',
  aerialways: 'hidden',
  power: 'readonly',
  traffic_roads: 'readonly',
  service_roads: 'readonly',
  rail: 'readonly',
  buildings: 'readonly',
  boundaries: 'hidden',
  shops: 'readonly',
}
const golfFilters = defaultFilters.map((filter) => ({
  ...filter,
  state: GOLF_FILTER_STATES[filter.id] ?? filter.state,
}))

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-golf',
  brand: { name: 'Maid Golf', detail: 'Golf courses', logo, favicon },
  version,
  // English unless the URL (`?lang=`), the stored choice or the browser names a language: golf mapping is international
  defaultLocale: 'en',
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5180',
    envFile: 'apps/maid-golf/.env.local',
  },
  editor: editorConfig,
}
