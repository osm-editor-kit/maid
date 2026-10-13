import { SwatchIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { Lens } from '@osm-editor-kit/maid-style'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { BUILT_IN_LENSES } from './builtin.ts'
import { useLensStore } from './store.ts'

/**
 * Map style: a topbar panel that restyles the map with a lens (see `connectLenses`). The app
 * gives its own lenses with `options.lenses`; they are listed next to the built-in ones.
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
      useLensStore.getState().setBuiltIn([...BUILT_IN_LENSES, ...(options.lenses ?? [])])
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
