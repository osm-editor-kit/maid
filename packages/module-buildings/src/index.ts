import { defineModule } from '@osm-editor-kit/maid-core'
import { whileLens } from '@osm-editor-kit/maid-renderer'
import type { LensSource } from '@osm-editor-kit/maid-style'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { buildingsLens } from './lens.ts'

export type BuildingsOptions = {
  /**
   * The lens choice of the lenses module (`lensChoice`). With it, the number of dwellings is on the map only while
   * the lens "Buildings" (`buildingsLens`) is the active one, and not in Maid standard or under another lens. Without
   * it the numbers are always drawn.
   */
  lenses?: LensSource
}

/**
 * The building editor (apps/maid-buildings): `map.content` with the number of dwellings on each building that has one,
 * while the buildings lens is the active one. The lens (`buildingsLens`), the preset changes (`buildingPresetChanges`, `withBuildingDefaults`) and the favourites
 * (`BUILDING_FAVOURITES`) are given to the shell by the app, as with the golf and parking modules.
 */
export function buildings(options: BuildingsOptions = {}) {
  return defineModule({
    id: 'buildings',
    setup(api) {
      const Flats = lazyComponent(() =>
        import('./FlatsOnMap.tsx').then((part) => ({ default: part.FlatsOnMap })),
      )
      api.register('map.content', {
        id: 'buildings-flats',
        component: whileLens(options.lenses, buildingsLens.id, Flats),
      })
    },
  })
}

export { buildingsLens, BUILDING_COLOURS, FLATS_RAMP } from './lens.ts'
export { flatsOf, flatsLabels, FLATS_KEYS } from './flats.ts'
export {
  buildingPresetChanges,
  BUILDING_DEFAULTS,
  BUILDING_FAVOURITES,
  withBuildingDefaults,
} from './presets.ts'
