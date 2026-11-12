import { defineModule } from '@osm-editor-kit/maid-core'
import { QuickTagsSection } from './buttons/QuickTags.tsx'
import { ParkingSidesOnMap } from './lens/side-features.tsx'
import { connectParkingSides, type LensSource } from './lens/side-state.ts'
import { m } from './messages.ts'
import { parkingOperations } from './operations/index.ts'
import {
  PARKING_RESTRICTION_FIELD_TYPE,
  RestrictionField,
} from './restriction/RestrictionField.tsx'

/** The lens choice as the module uses it: `lensChoice` from `@osm-editor-kit/maid-module-lenses` has this shape */
type LensStore = LensSource & { setActive: (id: string | null) => void }

export type ParkingOptions = {
  /**
   * The lens choice of the lenses module (`lensChoice`). With it, the parking sides are drawn beside the roads while the "Parking" lens
   * (`parkingLens`, which the app gives to `lenses({ lenses, editorDefault: 'parking' })`) is the active one. Without
   * it no side line is drawn.
   */
  lenses?: LensStore
  /** Also draw the side of a road that has no parking tag (the gap check). Default: no. */
  showMissing?: boolean
}

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
        get title() {
          return m.section_title()
        },
        // the reason for this editor: above the fields
        placement: 'top',
        multiple: true,
        when: (entity) =>
          entity.type === 'way' && entity.geometry === 'line' && 'highway' in entity.tags,
        component: QuickTagsSection,
      })
      api.register('map.content', { id: 'parking-sides', component: ParkingSidesOnMap })
      for (const operation of parkingOperations) api.register('edit.operation', operation)
      const { lenses } = options
      if (!lenses) return
      // the parking lens is the editor's standard and on at the first visit: `lenses({ editorDefault: 'parking' })`
      return connectParkingSides(lenses, { showMissing: options.showMissing })
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
export { QuickTags, QuickTagsSection } from './buttons/QuickTags.tsx'
export { QUICK_TAGS, type QuickTag } from './buttons/quick-tags.ts'
export { parkingLens } from './lens/parking-lens.ts'
export { parkingSideFeatures, type ParkingWay as ParkingSideWay } from './lens/features.ts'
export { ParkingSidesOnMap } from './lens/side-features.tsx'
export {
  RestrictionField,
  PARKING_RESTRICTION_FIELD_TYPE,
} from './restriction/RestrictionField.tsx'
export {
  parseConditional,
  formatConditional,
  type ConditionalRule,
} from './restriction/conditional.ts'
export { parkingRules } from './validation/index.ts'
export { parkingOperations } from './operations/index.ts'
export { PARKING_ICONS, type ParkingIconName } from './icons/index.ts'
