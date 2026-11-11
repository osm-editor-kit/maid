// Bicycle infrastructure as TILDA (tilda-geo.de) sees it, as the bicycle editor's default look: every highway is
// classified by TILDA's processing (@tilda-geo/bicycle-infrastructure) and its infrastructure drawn over iD's style,
// blue for bicycles alone and pink where it is shared with people on foot (groups.ts), road sides beside the road,
// with a kerb marker for sidepaths and the traffic signs on the line. Presets with TILDA's categories and
// subcategories (presets.ts) and a lens with the legend (lens.ts) come with it. No network request: everything runs on
// the tags of the loaded data, the sign images are the bundled ones of the traffic sign field.
import { defineModule } from '@osm-editor-kit/maid-core'
import { BikeInfraOnMap } from './BikeInfraOnMap.tsx'
import { connectBikeInfra, type LensSource } from './shown.ts'

export type BikeInfrastructureOptions = {
  /**
   * The lens choice of the lenses module (`lensChoice`). With it, the infrastructure is drawn while no lens or the lens
   * "Bicycle infrastructure" (`bikeInfrastructureLens`, which the app gives to `lenses({ lenses })`) is on, and hidden
   * under any other lens. Without it, it is always drawn.
   */
  lenses?: LensSource
}

/**
 * The bicycle infrastructure on the map: registers `map.content` "bike-infrastructure". The presets
 * (`bikePresetChanges`) and the lens (`bikeInfrastructureLens`) are applied by the app's config, as with the other
 * modules.
 */
export function bikeInfrastructure(options: BikeInfrastructureOptions = {}) {
  return defineModule({
    id: 'bike-infrastructure',
    setup(api) {
      api.register('map.content', { id: 'bike-infrastructure', component: BikeInfraOnMap })
      return connectBikeInfra(options.lenses)
    },
  })
}

export { bikeCollection } from './collect.ts'
export { bikeWayFeatures, type BikeProperties, type BikeWay } from './features.ts'
export { GROUPS, groupOf, type Group, type GroupId } from './groups.ts'
export { bikeInfrastructureLens } from './lens.ts'
export { BIKE_PRESET_LIST, bikePresetChanges, presetId } from './presets.ts'
export { BIKE_LENS_ID } from './shown.ts'
