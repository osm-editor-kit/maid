import type { MaidModule } from '@osm-editor-kit/maid-core'
/**
 * What this editor is: the modules it is made of, one per line so that one can be commented out.
 * The run-time settings (scene, live data, ...) come from the URL and are read once, in config.ts.
 */
import { defaultFilters } from '@osm-editor-kit/maid-filters'
import { dataLayers } from '@osm-editor-kit/maid-module-data-layers'
import { imagery } from '@osm-editor-kit/maid-module-imagery'
import { lenses } from '@osm-editor-kit/maid-module-lenses'
import { notes } from '@osm-editor-kit/maid-module-notes'
import {
  streetImagery,
  streetImageryPresetChanges,
} from '@osm-editor-kit/maid-module-street-imagery'
import { surface, surfacePresetChanges } from '@osm-editor-kit/maid-module-surface'
import { defaultOperations, pointToArea } from '@osm-editor-kit/maid-operations'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
// import { examplePresetChanges } from './preset-changes.example'
import { operations } from '@osm-editor-kit/maid-renderer'
import { defaultRules } from '@osm-editor-kit/maid-validation'
import dense from '../../../fixtures/dense.meta.json'
import medium from '../../../fixtures/medium.meta.json'
import small from '../../../fixtures/small.meta.json'
import type { Config } from './config'
import { elementInfo } from './modules/element-info'
import { relations } from './modules/relations'
import { type Bbox, sceneBounds } from './modules/scene-bounds'
import { validation } from './modules/validation'

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
 * The presets of this editor: the tagging schema's, with what modules add to them. Further
 * changes are chained the same way: `withChanges(withChanges(data, a), b)`.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - surface and smoothness: one field for both tags on roads and paths, with bundled photos
 */
const presets = createPresets(
  withChanges(withChanges(defaultPresetData, streetImageryPresetChanges), surfacePresetChanges),
  // withChanges(…, examplePresetChanges): see preset-changes.example.ts
)

/**
 * Whether a point with these tags has a type that can also be an area: the type the presets
 * give the point lists "area" among its geometries (a playground does, a bench does not).
 */
const canBeArea = (tags: Record<string, string>) =>
  tags.area !== 'no' && presets.match(tags, 'point').geometry.includes('area')

export function editorConfig(config: Config) {
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
    validation({ rules: defaultRules }),
    // top bar "Background": aerial imagery and overlays under the OSM data
    imagery(),
    // top bar "Data layers": GeoJSON, PMTiles and vector tiles to look at next to the OSM data
    dataLayers(),
    // top bar "Map style": lenses that recolour the map for one theme (surface, lit, max speed)
    lenses(),
    // top bar and dock "Photos": street-level photos; Mapillary needs VITE_MAPILLARY_TOKEN
    streetImagery({ mapillaryToken: import.meta.env.VITE_MAPILLARY_TOKEN || undefined }),
    // inspector field "Surface and smoothness" on roads and paths: a photo per value, bundled, no network
    surface(),
    // top bar and dock "Notes": OSM notes of the same API the data comes from, read-only
    notes({ apiUrl: config.apiUrl, minZoom: config.minDataZoom }),
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
