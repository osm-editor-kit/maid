import { PhotoIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { createElement } from 'react'
import { backgroundName, usedNames } from './helpers.ts'
import { ImageryLayers } from './ImageryLayers.tsx'
import { ImageryPanel } from './ImageryPanel.tsx'
import { createImageryStore, shownBackgroundId } from './store.ts'

export type ImageryOptions = {
  /** The background before anyone chooses one, by its ELI id. Default: none. */
  default?: string | null
}

/**
 * Imagery under the OSM data: a background (an ELI layer or a custom tile URL template), overlays
 * and a brightness, chosen in the top bar's "Background" panel. Built on
 * `@osm-editor-kit/maplibre-editor-layer-index`.
 *
 * The returned module also has `visitBackground(template)`: the app calls it with the template of a
 * `background=custom:<template>` link. It shows that template for this visit only and stores nothing
 * (see `visit` in the store). It returns why a template is refused, or the id it is shown as.
 */
export function imagery(options: ImageryOptions = {}) {
  const store = createImageryStore(options.default ?? null)
  const module = defineModule({
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
      // what the map shows now, read by the measure and the changeset (the app reads it outside React)
      api.register('imagery.used', {
        id: 'imagery',
        used: () => {
          const state = store.getState()
          return usedNames(shownBackgroundId(state), state.overlayIds, state.names)
        },
        background: () => {
          const state = store.getState()
          return backgroundName(shownBackgroundId(state), state.names)
        },
      })
    },
  })
  return {
    ...module,
    visitBackground: (template: string) => store.getState().visitBackground(template),
  }
}
