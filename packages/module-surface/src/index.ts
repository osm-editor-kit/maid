import { defineModule } from '@osm-editor-kit/maid-core'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import { SURFACE_SMOOTHNESS_FIELD_TYPE } from './presets.ts'

// the field, with the bundled photos and the catalogue, is a chunk of its own: it loads when a field of this type is
// shown, or in idle time after the first view (lazyComponent)
const SurfaceSmoothnessField = lazyComponent(() =>
  import('./field.tsx').then((field) => ({ default: field.SurfaceSmoothnessField })),
)

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
