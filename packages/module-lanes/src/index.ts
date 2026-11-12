import { defineModule } from '@osm-editor-kit/maid-core'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { isLaneRoad } from './roads.ts'

/**
 * The lanes editor (apps/maid-lanes): `inspector.section` "Lanes" above the fields of a road, with the cross-section
 * diagram and the lane table. The section loads as a chunk of its own when it is first shown. The lens (`lanesLens`) is
 * given to `lenses({ lenses })` by the app, as with the parking module.
 */
export function lanes() {
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
      // the lanes of the selected road as bands on the map, from zoom 17
      const LanesOnMap = lazyComponent(() =>
        import('./overlay/LanesOnMap.tsx').then((part) => ({ default: part.LanesOnMap })),
      )
      api.register('map.content', { id: 'lanes-bands', component: LanesOnMap })
      // the lanes lens is the editor's standard and on at the first visit: `lenses({ editorDefault: 'lanes' })`
    },
  })
}

export { lanesLens, LANE_COLOURS } from './lens.ts'
export { isLaneRoad, LANE_ROADS, MAIN_ROADS } from './roads.ts'
export { addLane, laneCounts, removeLane, setLaneValue, type LaneProp } from './edit.ts'
export { laneScene, neighbourAt } from './scene.ts'
export { laneRules, LANE_RULE_IDS } from './rules/lane-rules.ts'
