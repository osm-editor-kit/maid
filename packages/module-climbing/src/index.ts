/**
 * Climbing: crags, boulders and their routes. A section at the top of the inspector for a crag (its routes in the
 * order of the rock), an area (its crags) and a route (its crag, or one near it to add it to), and the climbing fields
 * of id-tagging-schema PR 2793 as preset changes (`climbingPresetChanges`, for the app's presets.ts).
 *
 * The relations themselves are edited with the shell's relation column (Members, Open, reorder); this module adds what
 * is climbing-specific on top. See docs/research/climbing.md.
 */
import { defineModule } from '@osm-editor-kit/maid-core'
import { ClimbingSection } from './ClimbingSection.tsx'
import { kindOf } from './logic.ts'
import { m } from './messages.ts'

export { climbingPresetChanges } from './presets.ts'
export { difficultyBand, gradeOf, GRADE_SYSTEMS, stylesOf } from './grades.ts'
export { cragRoutes, kindOf, nearbyCrags, parentsOf } from './logic.ts'

export function climbing() {
  return defineModule({
    id: 'climbing',
    setup(api) {
      api.register('inspector.section', {
        id: 'climbing',
        get title() {
          return m.climbing_section_title()
        },
        placement: 'top',
        when: (entity) => kindOf(entity.tags) !== undefined,
        component: ClimbingSection,
      })
    },
  })
}
