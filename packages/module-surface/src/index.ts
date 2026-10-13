import { defineModule } from '@osm-editor-kit/maid-core'
import { SurfaceSmoothnessField } from './field.tsx'
import { SURFACE_SMOOTHNESS_FIELD_TYPE } from './presets.ts'

/**
 * Registers the surface and smoothness field type (`surfaceSmoothness`) on `inspector.field`. The presets that show it
 * come from `surfacePresetChanges`: the app's config must apply them (see README.md).
 */
export function surface() {
  return defineModule({
    id: 'surface',
    setup(api) {
      api.register('inspector.field', {
        id: 'surface-smoothness',
        type: SURFACE_SMOOTHNESS_FIELD_TYPE,
        component: SurfaceSmoothnessField,
      })
    },
  })
}

export {
  SURFACE_SMOOTHNESS_FIELD_ID,
  SURFACE_SMOOTHNESS_FIELD_TYPE,
  surfacePresetChanges,
} from './presets.ts'
