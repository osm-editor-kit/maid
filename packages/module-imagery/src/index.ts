import { PhotoIcon } from '@heroicons/react/20/solid'
import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { createElement } from 'react'
import { ImageryLayers } from './ImageryLayers.tsx'
import { ImageryPanel } from './ImageryPanel.tsx'
import { createImageryStore } from './store.ts'

export type ImageryOptions = {
  /** The background before anyone chooses one, by its ELI id. Default: none. */
  default?: string | null
}

/**
 * Imagery under the OSM data: a background (one ELI layer), overlays and a brightness, chosen in
 * the top bar's "Background" panel. Built on `@osm-editor-kit/maplibre-editor-layer-index`.
 */
export function imagery(options: ImageryOptions = {}): MaidModule {
  const store = createImageryStore(options.default ?? null)
  return defineModule({
    id: 'imagery',
    setup(api) {
      api.register('map.content', {
        id: 'imagery',
        component: (props: MapContentProps) =>
          createElement(ImageryLayers, { store, belowOsm: props.belowOsm }),
      })
      api.register('topbar.panel', {
        id: 'imagery',
        label: 'Background',
        icon: createElement(PhotoIcon, { 'aria-hidden': true }),
        component: () => createElement(ImageryPanel, { store }),
        width: 'w-96',
      })
    },
  })
}
