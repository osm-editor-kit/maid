import { defineModule } from '@osm-editor-kit/maid-core'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'

/**
 * The golf editor (apps/maid-golf): `dock.view` "Holes", the scorecard of the loaded holes (number, par, handicap,
 * length, what is missing). The lens (`golfLens`), the rules (`golfRules`) and the preset changes
 * (`golfPresetChanges`, `withGolfDefaults`) are given to the shell by the app, as with the parking and lanes modules.
 * The plan for what comes next: docs/research/golf/plan.md.
 */
export function golf() {
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
    },
  })
}

export { golfLens, GOLF_COLOURS } from './lens.ts'
export { golfRules, GOLF_RULE_IDS, isGenericName } from './rules.ts'
export { golfPresetChanges, GOLF_DEFAULTS, withGolfDefaults } from './presets.ts'
export { scorecard, distance, type HoleRow, type Scorecard } from './holes.ts'
