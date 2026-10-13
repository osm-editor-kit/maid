import { defineModule } from '@osm-editor-kit/maid-core'
import { QuickTagsSection } from './buttons/index.ts'
import { ParkingSidesOnMap } from './lens/index.ts'
import { parkingOperations } from './operations/index.ts'
import { PARKING_RESTRICTION_FIELD_TYPE, RestrictionField } from './restriction/index.ts'

export type ParkingOptions = Record<string, never>

/**
 * The parking editor's module: registers
 * - `inspector.field` the field type `parkingRestriction`
 * - `inspector.section` "Parking" with the quick buttons, on roads
 * - `map.content` the parking sides drawn beside a road
 * - `edit.operation` parkingOperations
 * The presets (parkingPresetChanges), the rules (parkingRules) and the lens (parkingLens) are not registered
 * here: the app's config applies them, as with the other modules (see README.md).
 */
export function parking(options: ParkingOptions = {}) {
  void options
  return defineModule({
    id: 'parking',
    setup(api) {
      api.register('inspector.field', {
        id: 'parking-restriction',
        type: PARKING_RESTRICTION_FIELD_TYPE,
        component: RestrictionField,
      })
      api.register('inspector.section', {
        id: 'parking-quick-tags',
        title: 'Parking',
        when: (entity) =>
          entity.type === 'way' && entity.geometry === 'line' && 'highway' in entity.tags,
        component: QuickTagsSection,
      })
      api.register('map.content', { id: 'parking-sides', component: ParkingSidesOnMap })
      for (const operation of parkingOperations) api.register('edit.operation', operation)
    },
  })
}

export { parkingPresetChanges } from './presets/index.ts'
export {
  SIDES,
  sideKey,
  readSide,
  writeSide,
  type Side,
  type RealSide,
  type TagEdit,
} from './sides.ts'
export { QuickTags, QuickTagsSection, QUICK_TAGS, type QuickTag } from './buttons/index.ts'
export {
  parkingLens,
  parkingSideFeatures,
  ParkingSidesOnMap,
  type ParkingSideWay,
} from './lens/index.ts'
export {
  RestrictionField,
  PARKING_RESTRICTION_FIELD_TYPE,
  parseConditional,
  formatConditional,
  type ConditionalRule,
} from './restriction/index.ts'
export { parkingRules } from './validation/index.ts'
export { parkingOperations } from './operations/index.ts'
export { PARKING_ICONS, type ParkingIconName } from './icons/index.ts'
