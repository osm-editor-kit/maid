import { defineModule } from '@osm-editor-kit/maid-core'
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
import { StreetImagesField } from './image-field.tsx'
import { STREET_IMAGES_FIELD_TYPE } from './image-keys.ts'
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
export {
  STREET_IMAGES_FIELD_TYPE,
  IMAGE_KEYS,
  isImageKey,
  providerOfKey,
  idFromText,
  appendId,
  removeId,
  splitIds,
  joinIds,
  targetKey,
  planUse,
  type ImageProvider,
} from './image-keys.ts'
export {
  STREET_IMAGES_FIELD_ID,
  streetImageryPresetChanges,
  type StreetImagesPresetChanges,
} from './image-presets.ts'

/** The query-key prefixes of the package's provider hooks (street-imagery-react, `useProviderPhotos` and the others) */
const PACKAGE_QUERY_PREFIXES = ['provider-photos', 'provider-sequences', 'provider-map-features']

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
 * It also brings the "Street-level images" field type (`streetImages`): its preset change is
 * `streetImageryPresetChanges`.
 */
export function streetImagery(options: StreetImageryOptions = {}) {
  return defineModule({
    id: 'street-imagery',
    setup(api) {
      const token = options.mapillaryToken?.trim() ?? ''
      if (!AUTOMATED) {
        // the package reads its configuration when it fetches; Panoramax needs it too
        setStreetImageryConfig(createStreetImageryConfig({ mapillaryToken: token }))
        registerProviderAdapters(token ? [panoramaxAdapter, mapillaryAdapter] : [panoramaxAdapter])
        useStreetImageryStore.setState({ mapillaryToken: token })
        // The package names its provider queries by these prefixes, and keys them by the box and the
        // zoom. The box is snapped to tiles (snap.ts), so the same tiles are the same key, and a key
        // is asked once for the session: its data is not stale. A rename by the package would stop
        // this without an error (the photos would then be asked again on each move).
        for (const prefix of PACKAGE_QUERY_PREFIXES) {
          api.editor.queries.setQueryDefaults([prefix], { staleTime: Infinity })
        }
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
      // the field edits tags only: nothing of it is network or automation-sensitive
      api.register('inspector.field', {
        id: 'street-imagery-images',
        type: STREET_IMAGES_FIELD_TYPE,
        component: StreetImagesField,
      })
    },
  })
}
