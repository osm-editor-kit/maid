import { defineModule } from '@osm-editor-kit/maid-core'
import { lazyComponent } from '@osm-editor-kit/maid-ui'

/**
 * The building editor (apps/maid-buildings): `map.content` with the number of dwellings on each building that has one.
 * The lens (`buildingsLens`), the preset changes (`buildingPresetChanges`, `withBuildingDefaults`) and the favourites
 * (`BUILDING_FAVOURITES`) are given to the shell by the app, as with the golf and parking modules.
 */
export function buildings() {
  return defineModule({
    id: 'buildings',
    setup(api) {
      const Flats = lazyComponent(() =>
        import('./FlatsOnMap.tsx').then((part) => ({ default: part.FlatsOnMap })),
      )
      api.register('map.content', { id: 'buildings-flats', component: Flats })
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
