import { defineModule } from '@osm-editor-kit/maid-core'
import { whileLens } from '@osm-editor-kit/maid-renderer'
import type { LensSource } from '@osm-editor-kit/maid-style'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { golfLens } from './lens.ts'
import { m } from './messages.ts'

export type GolfOptions = {
  /**
   * The lens choice of the lenses module (`lensChoice`). With it, the hole numbers are on the map only while the lens
   * "Golf" (`golfLens`) is the active one, and not in Maid standard or under another lens. Without it the numbers are
   * always drawn.
   */
  lenses?: LensSource
}

/**
 * The golf editor (apps/maid-golf): `dock.view` "Holes", the scorecard of the loaded holes (number, par, handicap,
 * length, what is missing), and `map.content` with the number of each hole on its line, while the golf lens is the
 * active one. The lens (`golfLens`), the rules (`golfRules`) and the preset changes
 * (`golfPresetChanges`, `withGolfDefaults`) are given to the shell by the app, as with the parking and lanes modules.
 * The plan for what comes next: docs/research/golf/plan.md.
 */
export function golf(options: GolfOptions = {}) {
  return defineModule({
    id: 'golf',
    setup(api) {
      const View = lazyComponent(() =>
        import('./HolesView.tsx').then((part) => ({ default: part.HolesView })),
      )
      api.register('dock.view', {
        id: 'golf-holes',
        get label() {
          return m.holes_tab()
        },
        component: View,
      })
      // the number of each hole on its line, as OSM Carto labels golf=hole
      const Numbers = lazyComponent(() =>
        import('./HoleNumbersOnMap.tsx').then((part) => ({ default: part.HoleNumbersOnMap })),
      )
      api.register('map.content', {
        id: 'golf-hole-numbers',
        component: whileLens(options.lenses, golfLens.id, Numbers),
      })
    },
  })
}

export { golfLens, GOLF_COLOURS } from './lens.ts'
export { golfRules, GOLF_RULE_IDS, isGenericName } from './rules.ts'
export { golfPresetChanges, GOLF_DEFAULTS, GOLF_FAVOURITES, withGolfDefaults } from './presets.ts'
export { scorecard, distance, type HoleRow, type Scorecard } from './holes.ts'
