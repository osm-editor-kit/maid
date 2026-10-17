import { canBeArea, lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * Compared with apps/maid this app leaves out `surface` (surface and smoothness photos), which a parking mapper
 * does not need, and adds `parking()` with its preset changes, lens and rules. Everything else of apps/maid is kept.
 */
import { defaultFilters } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lensChoice, lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import { parking, parkingLens, parkingRules } from '@osm-editor-kit/maid-module-parking'
import {
  angleSnap,
  cutArea,
  divideArea,
  mergeAreas,
  rectangle,
} from '@osm-editor-kit/maid-module-shapes'
import { streetImagery } from '@osm-editor-kit/maid-module-street-imagery'
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
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // the edit menu: reverse, split, merge, straighten, square, make round, disconnect, extract
    // plus "Turn into an area" for a point whose type can also be mapped as an area
    operations([...defaultOperations, pointToArea({ canBeArea: canBeArea(presets) })]),
    // inspector sections "Members" and "Relations": what a relation contains, what a feature is in
    relations(),
    // checks what was changed here: inspector section and dock view "Issues"; the parking rules come last
    validation({ rules: [...defaultRules, ...parkingRules] }),
    // top bar "Background": aerial imagery and overlays under the OSM data
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": lenses that recolour the map for one theme; "Parking" is this app's
    lenses({ lenses: [parkingLens] }),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // the parking editor: restriction field, quick buttons, parking sides on the map, its edit operations
    parking({ lenses: lensChoice }),
    // drawing tools for buildings and parking spaces (docs/research/drawing-tools): Shift holds right angles,
    // the lengths of the segments while a node is placed: the parking editor only (too busy in the other modes)
    angleSnap({ lengths: true }),
    // the Area button's "Rectangle" (key 4) draws one with three clicks,
    rectangle(),
    // the edit menu merges two areas into one outline,
    mergeAreas(),
    // cuts an area along a drawn line,
    cutArea(),
    // and divides one into rows and columns of parking spaces
    divideArea(),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return { modules, presets, filters: defaultFilters }
}

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-parking',
  brand: { name: 'Maid Parking', detail: 'Street-side parking' },
  version,
  // German unless the URL (`?lang=`), the stored choice or the browser names a language; automation stays English
  defaultLocale: 'de',
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5177',
    envFile: 'apps/maid-parking/.env.local',
  },
  editor: editorConfig,
}
