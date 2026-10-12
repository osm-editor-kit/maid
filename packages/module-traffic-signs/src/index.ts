import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import { signFieldComponent } from './field.tsx'
import { TRAFFIC_SIGN_FIELD_TYPE } from './presets.ts'

export type TrafficSignsOptions = {
  /** The country whose signs the field offers (ISO 3166-1 alpha-2). Default `DE`. */
  country?: string
}

/**
 * Registers the traffic sign field type (`trafficSign`) on `inspector.field`. The presets that show it come from
 * `trafficSignPresetChanges`: the app's config must apply them (see README.md).
 */
export function trafficSigns(options: TrafficSignsOptions = {}): MaidModule {
  const component = signFieldComponent(options.country ?? 'DE')
  return defineModule({
    id: 'traffic-signs',
    setup(api) {
      api.register('inspector.field', {
        id: 'traffic-signs',
        type: TRAFFIC_SIGN_FIELD_TYPE,
        component,
      })
    },
  })
}

export {
  TRAFFIC_SIGN_FIELD_TYPE,
  TRAFFIC_SIGN_FIELDS,
  trafficSignPresetChanges,
} from './presets.ts'
export { applySignTagChanges, type SignTagChanges } from './tag-changes.ts'
