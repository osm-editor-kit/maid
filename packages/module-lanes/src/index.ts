import { defineModule, isAutomated, moduleStorage } from '@osm-editor-kit/maid-core'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { isLaneRoad } from './roads.ts'

/** The lens choice of the lenses module (`lensChoice`): read and set the active lens */
type LensStore = { getActiveId: () => string | null; setActive: (id: string | null) => void }

export type LanesOptions = {
  /** The lens choice of the lenses module. With it, the "Lanes" lens is switched on at the first visit. */
  lenses?: LensStore
}

const FIRST_VISIT_KEY = 'maid:lanes:lens-started'

/**
 * The lanes editor (apps/maid-lanes): `inspector.section` "Lanes" above the fields of a road, with the cross-section
 * diagram and the lane table. The section loads as a chunk of its own when it is first shown. The lens (`lanesLens`) is
 * given to `lenses({ lenses })` by the app, as with the parking module.
 */
export function lanes(options: LanesOptions = {}) {
  return defineModule({
    id: 'lanes',
    setup(api) {
      const Section = lazyComponent(() =>
        import('./LanesSection.tsx').then((part) => ({ default: part.LanesSection })),
      )
      api.register('inspector.section', {
        id: 'lanes',
        get title() {
          return m.section_title()
        },
        placement: 'top',
        when: (entity) =>
          entity.type === 'way' && entity.geometry === 'line' && isLaneRoad(entity.tags),
        component: Section,
      })
      const { lenses } = options
      if (!lenses || isAutomated()) return
      // first visit: start with the lanes lens on, as the parking editor does with its lens
      const storage = moduleStorage()
      if (storage.getItem(FIRST_VISIT_KEY) === null) {
        storage.setItem(FIRST_VISIT_KEY, '1')
        if (lenses.getActiveId() === null) lenses.setActive('lanes')
      }
    },
  })
}

export { lanesLens, LANE_COLOURS } from './lens.ts'
export { isLaneRoad, LANE_ROADS, MAIN_ROADS } from './roads.ts'
export { addLane, laneCounts, removeLane, setLaneValue, type LaneProp } from './edit.ts'
export { laneScene, neighbourAt } from './scene.ts'
