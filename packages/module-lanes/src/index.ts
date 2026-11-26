import { defineModule } from '@osm-editor-kit/maid-core'
import { whileLens } from '@osm-editor-kit/maid-renderer'
import type { LensSource } from '@osm-editor-kit/maid-style'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { lanesLens } from './lens.ts'
import { m } from './messages.ts'
import { isLaneRoad } from './roads.ts'

export type LanesOptions = {
  /**
   * The lens choice of the lenses module (`lensChoice`). With it, the street drawing of every lane road is on the map
   * only while the lens "Lanes" (`lanesLens`) is the active one, and not in Maid standard or under another lens. The
   * bands of the selected road stay in every style. Without it the street is always drawn.
   */
  lenses?: LensSource
}

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
      // the lanes of the selected road as bands on the map, from zoom 17
      const LanesOnMap = lazyComponent(() =>
        import('./overlay/LanesOnMap.tsx').then((part) => ({ default: part.LanesOnMap })),
      )
      // every lane road of the loaded data as its street, below the bands of the selected road
      const StreetOnMap = lazyComponent(() =>
        import('./overlay/StreetOnMap.tsx').then((part) => ({ default: part.StreetOnMap })),
      )
      // part of the lens's style: only while the lens is the active one
      api.register('map.content', {
        id: 'lanes-street',
        component: whileLens(options.lenses, lanesLens.id, StreetOnMap),
      })
      api.register('map.content', { id: 'lanes-bands', component: LanesOnMap })
      // the lanes lens is the editor's own style and on at the first visit: `lenses({ editorDefault: 'lanes' })`
    },
  })
}

export { lanesLens, LANE_COLOURS } from './lens.ts'
export { isLaneRoad, LANE_ROADS, MAIN_ROADS } from './roads.ts'
export { addLane, laneCounts, removeLane, setLaneValue, type LaneProp } from './edit.ts'
export { laneScene, neighbourAt } from './scene.ts'
export { laneRules, LANE_RULE_IDS } from './rules/lane-rules.ts'
export { VALUE_RULE_IDS } from './rules/value-rules.ts'
export { isStreetPoint, streetPoints } from './filters.ts'
