import { PhotoIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { createElement } from 'react'
import type { Drawn } from './eli.ts'
import { backgroundName, usedNames } from './helpers.ts'
import { createImageryStore, ImageryStoreProvider, type ImageryUrls } from './imagery-store.ts'
import { drawnShown, ImageryLayers } from './ImageryLayers.tsx'
import {
  ID_BACKGROUND,
  ID_OVERLAYS,
  NONE,
  parseAsBackground,
  parseAsBgDisplay,
  parseAsOverlays,
} from './url.ts'

export type ImageryOptions = {
  /** The background before anyone chooses one, by its ELI id. Default: none. */
  default?: string | null
}

/**
 * Imagery under the OSM data: a background (an ELI layer or a custom tile URL template), overlays
 * and a brightness, chosen in the top bar's "Background" panel. Built on
 * `@osm-editor-kit/maplibre-editor-layer-index`.
 *
 * The module declares its URL parameters: `bg` (an ELI id, `none`, or `custom:<template>`; iD's `background`, with
 * iD's `layer` read too), `overlays` (iD's name too) and `bg_display` (the brightness, Maid's own name). The URL is the
 * live state; the store keeps the choices for the next visit (docs/research/url-state-audit.md, section 3).
 */
export function imagery(options: ImageryOptions = {}) {
  const store = createImageryStore(options.default ?? null)
  return defineModule({
    id: 'imagery',
    setup(api) {
      const queries = api.editor.queries
      const urls: ImageryUrls = {
        background: api.urlParam({
          name: 'bg',
          parser: parseAsBackground,
          options: { clearOnDefault: false, history: 'replace' },
          iD: ID_BACKGROUND,
        }),
        overlays: api.urlParam({
          name: 'overlays',
          parser: parseAsOverlays,
          options: { clearOnDefault: false, history: 'replace' },
          iD: ID_OVERLAYS,
        }),
        // no iD name: iD has no such parameter
        display: api.urlParam({
          name: 'bg_display',
          parser: parseAsBgDisplay,
          options: { history: 'replace' },
        }),
      }
      // the panel's code is a chunk of its own: it loads when the flyout opens (or in idle time after the first view)
      const Panel = lazyComponent(
        () =>
          import('./ImageryPanel.tsx').then((panel) => ({
            default: () =>
              createElement(
                ImageryStoreProvider,
                { store, urls },
                createElement(panel.ImageryPanel),
              ),
          })),
        PANEL_FALLBACK,
      )
      api.register('map.content', {
        id: 'imagery',
        component: (props: MapContentProps) =>
          createElement(
            ImageryStoreProvider,
            { store, urls },
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
          const shown = store.getState().shown
          if (shown === null) return []
          const { background, overlays } = drawnShown(queries, shown)
          const names = namesOf([background, ...overlays])
          return usedNames(backgroundOf(shown.background), shown.overlays, names)
        },
        background: () => {
          const shown = store.getState().shown
          if (shown === null) return undefined
          const { background } = drawnShown(queries, shown)
          const names = namesOf([background])
          return backgroundName(backgroundOf(shown.background), names)
        },
        // the background alone, as the measure's magnifier draws it (undefined until it is drawn)
        backgroundSource: () => {
          const shown = store.getState().shown
          if (shown === null) return undefined
          const { background } = drawnShown(queries, shown)
          if (!background) return undefined
          // the brightness the map draws (the URL's, mirrored by the map layer), not the stored choice
          const brightness = store.getState().shownBrightness
          if (brightness === null) return undefined
          return { source: background.source, brightness }
        },
      })
    },
  })
}

/** The layer id of a background value, or null for none (the helpers take null for none) */
function backgroundOf(value: string) {
  return value === NONE ? null : value
}

/** The name of each drawn layer, by its id */
function namesOf(drawn: readonly (Drawn | undefined)[]) {
  return Object.fromEntries(drawn.flatMap((item) => (item ? [[item.id, item.name] as const] : [])))
}
