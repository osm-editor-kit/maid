import { SwatchIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Lens } from '@osm-editor-kit/maid-style'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { BUILT_IN_LENSES } from './builtin.ts'
import { lensActions } from './lens-store.ts'
import { useLensUrl } from './sync.ts'
import { parseAsLens } from './url.ts'

/**
 * Map style: a topbar panel that restyles the map with a lens (see `connectLenses`). The app
 * gives its own lenses with `options.lenses`; they are listed next to the built-in ones. The lens on the map is
 * the URL's `lens` (`none` for no lens); the stored choice is the default (url.ts, sync.ts).
 */
export function lenses(options: { lenses?: Lens[] } = {}) {
  return defineModule({
    id: 'lenses',
    setup(api) {
      // the panel's code is a chunk of its own: it loads when the flyout opens (or in idle time after the first view)
      const LensPanel = lazyComponent(
        () => import('./LensPanel.tsx').then((panel) => ({ default: panel.LensPanel })),
        PANEL_FALLBACK,
      )
      lensActions.setBuiltIn([...BUILT_IN_LENSES, ...(options.lenses ?? [])])
      // Maid's own name (iD has no lens). Kept when it is the default, so that a link says which lens its author saw.
      const lensUrl = api.urlParam<string>({
        name: 'lens',
        parser: parseAsLens,
        options: { history: 'replace', clearOnDefault: false },
      })
      // the URL and the lens on the map, in step; a component of the map's content, so it is mounted from the start
      function LensUrlSync(_props: MapContentProps) {
        useLensUrl(lensUrl)
        return null
      }
      api.register('map.content', { id: 'lenses', component: LensUrlSync })
      api.register('topbar.panel', {
        id: 'lenses',
        label: 'Map style',
        icon: <SwatchIcon aria-hidden="true" className="size-5" />,
        component: LensPanel,
        width: 'w-96',
      })
    },
  })
}
