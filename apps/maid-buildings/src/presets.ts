/**
 * The presets of Maid Buildings: the tagging schema's, with what modules add to them. Only `maid.config.ts` imports
 * this file, and through `import()`: the schema's data and the country data are a chunk of their own, fetched in
 * parallel with the entry and run after the map exists.
 * - street-level images: one field for a feature's image tags (mapillary, panoramax)
 * - buildings: every building preset shows levels, levels underground and roof levels, the residential ones the number
 *   of dwellings; the building types first in the type picker (the defaults per geometry)
 */
import { buildingPresetChanges, withBuildingDefaults } from '@osm-editor-kit/maid-module-buildings'
import { streetImageryPresetChanges } from '@osm-editor-kit/maid-module-street-imagery'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'

export function makePresets() {
  const base = withChanges(defaultPresetData, streetImageryPresetChanges)
  const data = withChanges(base, buildingPresetChanges(base))
  return createPresets({ ...data, defaults: withBuildingDefaults(data.defaults) })
}
