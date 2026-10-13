import { lazyPresets, type MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in the shell's config.ts.
 */
import { defaultFilters } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import { streetImagery } from '@osm-editor-kit/maid-module-street-imagery'
import { surface } from '@osm-editor-kit/maid-module-surface'
import { trafficSigns } from '@osm-editor-kit/maid-module-traffic-signs'
import {
  turnRestrictionRules,
  turnRestrictions,
} from '@osm-editor-kit/maid-module-turn-restrictions'
import { defaultOperations, pointToArea } from '@osm-editor-kit/maid-operations'
import { operations } from '@osm-editor-kit/maid-renderer'
import {
  type AppConfig,
  type Bbox,
  type Config,
  elementInfo,
  relations,
  sceneBounds,
  validation,
} from '@osm-editor-kit/maid-shell'
import { defaultRules } from '@osm-editor-kit/maid-validation'
import dense from '../../../fixtures/dense.meta.json'
import medium from '../../../fixtures/medium.meta.json'
import small from '../../../fixtures/small.meta.json'
import { MAPILLARY_TOKEN } from '../../mapillary-token.ts'
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

/**
 * The presets of this editor, made after the first picture: the tagging schema's with what modules add to them
 * (see presets.ts, which holds the data and the changes, so that they are a chunk of their own that is not read
 * before the map exists). Until they are there, pins and vertices have no icon and the inspector waits.
 */
const presets = lazyPresets(() => import('./presets').then((module) => module.makePresets()))

/**
 * Whether a point with these tags has a type that can also be an area: the type the presets
 * give the point lists "area" among its geometries (a playground does, a bench does not).
 * False while the presets are not there yet.
 */
const canBeArea = (tags: Record<string, string>) =>
  tags.area !== 'no' && (presets.current?.match(tags, 'point').geometry.includes('area') ?? false)

// the imagery module, made once: a `background=custom:` link is shown through its visitBackground
const background = imagery()

function editorConfig(config: Config) {
  // live data and unknown scenes have no fixture area to outline
  const bbox = config.live ? undefined : BBOX[config.scene]
  const modules: MaidModule[] = [
    // inspector section "Element": id, version and upload state of the selected object
    elementInfo(),
    // the edit menu: reverse, split, merge, straighten, square, make round, disconnect, extract
    // plus "Turn into an area" for a point whose type can also be mapped as an area (a playground)
    operations([...defaultOperations, pointToArea({ canBeArea })]),
    // inspector sections "Members" and "Relations": what a relation contains, what a feature is in
    relations(),
    // checks what was changed here: inspector section and dock view "Issues"
    validation({ rules: [...defaultRules, ...turnRestrictionRules] }),
    turnRestrictions(),
    // top bar "Background": aerial imagery and overlays under the OSM data
    background,
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": lenses that recolour the map for one theme (surface, lit, max speed)
    lenses(),
    // top bar and dock "Photos": street-level photos; Mapillary uses the apps' token, or the app's own
    // VITE_MAPILLARY_TOKEN when it is set (apps/mapillary-token.ts)
    streetImagery({ mapillaryToken: import.meta.env.VITE_MAPILLARY_TOKEN || MAPILLARY_TOKEN }),
    // inspector field "Surface and smoothness" on roads and paths: a photo per value, bundled, no network
    surface(),
    // inspector field "Traffic Sign" on roads and paths (what makes this app differ from apps/maid)
    trafficSigns({ country: 'DE' }),
    // top bar and dock "Notes": OSM notes of the same API the data comes from, read-only.
    // From OSM zoom 14 (iD and Rapid use 12; the data itself loads from 16). minZoom is an OSM zoom.
    notes({ apiUrl: config.apiUrl, minZoom: 14 }),
  ]
  // dashed outline around the area the fixture covers
  if (bbox) modules.push(sceneBounds({ bbox }))
  return {
    modules,
    presets,
    // to use the example changes, replace the line above with this one (see preset-changes.example.ts):
    filters: defaultFilters,
  }
}

/** The app: its name, its login to the OSM development server, and the editor above */
export const app: AppConfig = {
  id: 'maid-bicycle',
  brand: { name: 'Maid Bicycle', detail: 'Cycling infrastructure' },
  version,
  osm: {
    devClientId: import.meta.env.VITE_OSM_DEV_CLIENT_ID || undefined,
    loginOrigin: 'http://127.0.0.1:5176',
    envFile: 'apps/maid-bicycle/.env.local',
  },
  editor: editorConfig,
  visitBackground: (template) => background.visitBackground(template),
}
