import { PhotoIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { createElement } from 'react'
import type { Drawn } from './eli.ts'
import { backgroundName, usedNames } from './helpers.ts'
import {
  createImageryStore,
  ImageryStoreProvider,
  shownBackgroundId,
  type ImageryStoreHook,
} from './imagery-store.ts'
import { ImageryLayers, drawnShown } from './ImageryLayers.tsx'

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
  const store: ImageryStoreHook = createImageryStore(options.default ?? null)
  const module = defineModule({
    id: 'imagery',
    setup(api) {
      const queries = api.editor.queries
      // the panel's code is a chunk of its own: it loads when the flyout opens (or in idle time after the first view)
      const Panel = lazyComponent(
        () =>
          import('./ImageryPanel.tsx').then((panel) => ({
            default: () =>
              createElement(ImageryStoreProvider, { store }, createElement(panel.ImageryPanel)),
          })),
        PANEL_FALLBACK,
      )
      api.register('map.content', {
        id: 'imagery',
        component: (props: MapContentProps) =>
          createElement(
            ImageryStoreProvider,
            { store },
            createElement(ImageryLayers, { belowOsm: props.belowOsm }),
          ),
      })
      api.register('topbar.panel', {
        id: 'imagery',
        label: 'Background',
        icon: createElement(PhotoIcon, { 'aria-hidden': true }),
        component: Panel,
        width: 'w-96',
      })
      // what the map shows now, read by the measure and the changeset (the app reads it outside React).
      // The names and the drawn source are the draws' results, read from the query cache.
      api.register('imagery.used', {
        id: 'imagery',
        used: () => {
          const state = store.getState()
          const { background, overlays } = drawnShown(queries, state)
          const names = namesOf([background, ...overlays])
          return usedNames(shownBackgroundId(state), state.overlayIds, names)
        },
        background: () => {
          const state = store.getState()
          const { background } = drawnShown(queries, state)
          const names = namesOf([background])
          return backgroundName(shownBackgroundId(state), names)
        },
        // the background alone, as the measure's magnifier draws it (undefined until it is drawn)
        backgroundSource: () => {
          const state = store.getState()
          const { background } = drawnShown(queries, state)
          if (!background) return undefined
          return { source: background.source, brightness: state.brightness }
        },
      })
    },
  })
  return {
    ...module,
    visitBackground: (template: string) => store.getState().actions.visitBackground(template),
  }
}

/** The name of each drawn layer, by its id */
function namesOf(drawn: readonly (Drawn | undefined)[]) {
  return Object.fromEntries(drawn.flatMap((item) => (item ? [[item.id, item.name] as const] : [])))
}
