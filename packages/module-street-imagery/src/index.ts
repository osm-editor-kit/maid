import { CameraIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentItem } from '@osm-editor-kit/maid-renderer'
import {
  lazyComponent,
  PANEL_FALLBACK,
  type DockView,
  type TopBarPanel,
} from '@osm-editor-kit/maid-ui'
import {
  createStreetImageryConfig,
  registerProviderAdapters,
  setStreetImageryConfig,
} from '@osm-editor-kit/street-imagery'
import { mapillaryAdapter } from '@osm-editor-kit/street-imagery/providers/mapillary'
import { panoramaxAdapter } from '@osm-editor-kit/street-imagery/providers/panoramax'
import { createElement, type ComponentType } from 'react'
import { PHOTOS_VIEW_ID } from './image-actions.ts'
import { STREET_IMAGES_FIELD_TYPE } from './image-keys.ts'
import { StreetImageryLayers } from './map.tsx'
import { m } from './messages.ts'
import { PhotoUrlSync } from './shown.ts'
import { AUTOMATED, streetImageryActions } from './street-imagery-store.ts'
import { PHOTO_PARAM_DECLARATIONS } from './url.ts'

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

/** A lazy component in the app's language for the viewer; the wrapper loads with it, not with this file */
async function inViewerLocale<Props extends object>(component: Promise<ComponentType<Props>>) {
  const [Component, { withViewerLocale }] = await Promise.all([
    component,
    import('./viewer-locale.tsx'),
  ])
  return { default: withViewerLocale(Component) }
}

// The panel, the dock view and the field are chunks of their own (with the photo viewers they use): they load when
// they are first shown, or in idle time after the first view (lazyComponent).
const PhotosPanel = lazyComponent(
  () => inViewerLocale(import('./panel.tsx').then((panel) => panel.PhotosPanel)),
  PANEL_FALLBACK,
)
const PhotosView = lazyComponent(
  () => inViewerLocale(import('./dock.tsx').then((dock) => dock.PhotosView)),
  PANEL_FALLBACK,
)
const StreetImagesField = lazyComponent(() =>
  inViewerLocale(import('./image-field.tsx').then((field) => field.StreetImagesField)),
)

/** The icon of the photos button in the top bar */
const PHOTOS_ICON = createElement(CameraIcon, { 'aria-hidden': true })

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
      // the one trim of the token: the store and the helpers take it as stored (state.ts, image-actions.ts)
      const token = options.mapillaryToken?.trim() ?? ''
      // iD's four photo parameters (url.ts). The handles the module reads and writes are PHOTO_HANDLES, built from the
      // same declarations; the registry keeps the names taken and maps the iD links onto them.
      api.urlParam(PHOTO_PARAM_DECLARATIONS.type)
      api.urlParam(PHOTO_PARAM_DECLARATIONS.overlay)
      api.urlParam(PHOTO_PARAM_DECLARATIONS.dates)
      api.urlParam(PHOTO_PARAM_DECLARATIONS.photo)
      // the writer of the photo settings and the photo's URL; a component of the map's content, mounted from the start
      api.register('map.content', { id: 'street-imagery-url', component: PhotoUrlSync })
      if (!AUTOMATED) {
        // the package reads its configuration when it fetches; Panoramax needs it too
        setStreetImageryConfig(createStreetImageryConfig({ mapillaryToken: token }))
        registerProviderAdapters(token ? [panoramaxAdapter, mapillaryAdapter] : [panoramaxAdapter])
        streetImageryActions.setMapillaryToken(token)
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
      // the labels are read when shown (getters), in the app's language at that time
      const topBar: TopBarPanel = {
        id: 'street-imagery',
        get label() {
          return m.photos_label()
        },
        icon: PHOTOS_ICON,
        component: PhotosPanel,
        width: 'w-[26rem]',
      }
      const dock: DockView = {
        id: PHOTOS_VIEW_ID,
        get label() {
          return m.photos_label()
        },
        component: PhotosView,
      }
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
