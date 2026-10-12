import { SwatchIcon } from '@heroicons/react/20/solid'
import { defineModule, type MaidModule } from '@osm-editor-kit/maid-core'
import type { Lens } from '@osm-editor-kit/maid-style'
import { BUILT_IN_LENSES } from './builtin.ts'
import { LensPanel } from './LensPanel.tsx'
import { useLensStore } from './store.ts'

/**
 * Map style: a topbar panel that restyles the map with a lens (see `connectLenses`). The app
 * gives its own lenses with `options.lenses`; they are listed next to the built-in ones.
 */
export function lenses(options: { lenses?: Lens[] } = {}): MaidModule {
  return defineModule({
    id: 'lenses',
    setup(api) {
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
