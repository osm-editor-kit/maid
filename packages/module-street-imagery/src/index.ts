import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import type { MapContentItem } from '@osm-editor-kit/maid-renderer'
import type { DockView, TopBarPanel } from '@osm-editor-kit/maid-ui'
import {
  createStreetImageryConfig,
  registerProviderAdapters,
  setStreetImageryConfig,
} from '@osm-editor-kit/street-imagery'
import { mapillaryAdapter } from '@osm-editor-kit/street-imagery/providers/mapillary'
import { panoramaxAdapter } from '@osm-editor-kit/street-imagery/providers/panoramax'
import { PhotosView } from './dock.tsx'
import { StreetImageryLayers } from './map.tsx'
import { PHOTOS_ICON, PhotosPanel } from './panel.tsx'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

export { MAP_ID, streetImageryClick } from './map.tsx'
export {
  IMAGERY_PROVIDER_IDS,
  PROVIDER_LABELS,
  activeProviders,
  type ImageryProviderId,
} from './state.ts'

export type StreetImageryOptions = {
  /**
   * Mapillary client token (`VITE_MAPILLARY_TOKEN` in apps/maid). Without one Mapillary is not
   * offered and nothing is ever requested from it. Panoramax needs no token.
   */
  mapillaryToken?: string
}

/**
 * Street-level photos: the photos of the switched-on providers on the map, the photo open in the
 * dock, and the switches and filters in the top bar. Everything is off until a person switches a
 * provider on; in automated browsers nothing is registered for the map and no photo is requested.
 */
export function streetImagery(options: StreetImageryOptions = {}): MaidModule {
  return defineModule({
    id: 'street-imagery',
    setup(api) {
      const token = options.mapillaryToken?.trim() ?? ''
      if (!AUTOMATED) {
        // the package reads its configuration when it fetches; Panoramax needs it too
        setStreetImageryConfig(createStreetImageryConfig({ mapillaryToken: token }))
        registerProviderAdapters(token ? [panoramaxAdapter, mapillaryAdapter] : [panoramaxAdapter])
        useStreetImageryStore.setState({ mapillaryToken: token })
        const layers: MapContentItem = { id: 'street-imagery', component: StreetImageryLayers }
        api.register('map.content', layers)
      }
      const topBar: TopBarPanel = {
        id: 'street-imagery',
        label: 'Photos',
        icon: PHOTOS_ICON,
        component: PhotosPanel,
        width: 'w-[26rem]',
      }
      const dock: DockView = { id: 'street-imagery', label: 'Photos', component: PhotosView }
      api.register('topbar.panel', topBar)
      api.register('dock.view', dock)
    },
  })
}
