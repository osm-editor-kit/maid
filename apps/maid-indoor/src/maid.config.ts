import { canBeArea, lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 *
 * The indoor editor: the level mode of `levels()` with its rules, and the drawing tools of module-shapes for rooms
 * (right angles, rectangles, merge, cut, divide, resize). Compared with apps/maid it leaves out turn restrictions and
 * the surface photos, which an indoor mapper does not need. The fixture made for it is `?scene=indoor` (Berlin
 * Hauptbahnhof).
 */
import { defaultFilters } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { levels } from '@osm-editor-kit/maid-module-levels'
import { notes } from '@osm-editor-kit/maid-module-notes'
import {
  angleSnap,
  cutArea,
  divideArea,
  drawRoom,
  mergeAreas,
  rectangle,
  resize,
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
import {
  defaultRules,
  missingLevel,
  stairsLevelMissing,
  stairsLevelUnreached,
} from '@osm-editor-kit/maid-validation'
import dense from '../../../fixtures/dense.meta.json'
import indoor from '../../../fixtures/indoor.meta.json'
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
  indoor: indoor.bbox as Bbox,
}

/**
 * The presets of this editor, made after the first picture: the tagging schema's with what modules add to them
 * (see presets.ts, which holds the data and the changes, so that they are a chunk of their own that is not read
 * before the map exists). Until they are there, pins and vertices have no icon and the inspector waits.
 */
const presets = lazyPresets(() => import('./presets').then((module) => module.makePresets()))

// the imagery module, made once
const background = imagery()

function editorConfig(config: Config) {
  const bbox = fixtureBounds(config, BBOX)
  const modules: MaidModule[] = [
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // the edit menu: reverse, split, merge, straighten, square, make round, disconnect, extract
    // plus "Turn into an area" for a point whose type can also be mapped as an area (a playground)
    operations([...defaultOperations, pointToArea({ canBeArea: canBeArea(presets) })]),
    // inspector sections "Members" and "Relations": what a relation contains, what a feature is in
    relations(),
    // checks what was changed here: inspector section and dock view "Issues"
    // with the level mode: a station or shop with layer but no level gets a hint and can take the layer's value;
    // stairs between two levels get both levels and the direction they climb in
    validation({
      rules: [...defaultRules, missingLevel, stairsLevelMissing, stairsLevelUnreached],
    }),
    // top bar "Background": aerial imagery and overlays under the OSM data
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": lenses that recolour the map for one theme (surface, lit, max speed)
    lenses(),
    // building levels: a floor picker on the map, the other levels dimmed and locked, rooms in 3D (`level=` in the URL)
    levels(),
    // top bar and dock "Photos": street-level photos; Mapillary uses the token of apps/mapillary-token.ts
    streetImagery({ mapillaryToken: mapillaryToken() }),
    // drawing tools for rooms and corridors (docs/research/drawing-tools): Shift holds right angles, with the
    // lengths of the segments while a node is placed
    angleSnap({ lengths: true }),
    // the Area button's "Rectangle" (key 33) draws one with three clicks,
    rectangle(),
    // the button "Room" beside it, on while one building is selected: a room drawn into it from wall to wall,
    // tagged indoor=room on the level being edited (Tobias, 2026-11-03)
    drawRoom(),
    // the edit menu merges two areas into one outline,
    mergeAreas(),
    // cuts an area along a drawn line,
    cutArea(),
    // divides one into rows and columns (a row of rooms along a corridor),
    divideArea(),
    // and resizes the selection with a box and handles (K; Shift keeps the proportions, Alt the centre)
    resize(),
    // top bar and dock "Notes": OSM notes from the same API as the data, read-only, shown from zoom 12 as in iD
    notes({ apiUrl: config.apiUrl }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return {
    modules,
    presets,
    filters: defaultFilters,
  }
}

/** The app: its name, its login to OpenStreetMap and its development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-indoor',
  brand: { name: 'Maid Indoor', detail: 'Indoor and building levels', logo, favicon },
  version,
  osm: {
    servers: ['osm', 'dev'],
    clientId: import.meta.env.VITE_OSM_CLIENT_ID || undefined,
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5178',
    envFile: 'apps/maid-indoor/.env.local',
  },
  editor: editorConfig,
}
