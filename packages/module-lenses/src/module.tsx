import { SwatchIcon } from '@heroicons/react/20/solid'
import { defineModule, isAutomated, moduleStorage } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { Lens } from '@osm-editor-kit/maid-style'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { BUILT_IN_LENSES } from './builtin.ts'
import { type DefaultLook, setDefaultLook } from './default-look.ts'
import { lensActions, lensChoice } from './lens-store.ts'
import { useLensUrl } from './sync.ts'
import { parseAsLens } from './url.ts'

/**
 * Map style: a topbar panel that restyles the map with a lens (see `connectLenses`). The app
 * gives its own lenses with `options.lenses`; they are listed next to the built-in ones. The lens on the map is
 * the URL's `lens` (`none` for no lens); the stored choice is the default (url.ts, sync.ts). `options.defaultLook` is
 * what the panel says about the look without a lens, when the app's own look adds to iD's (a description, a legend).
 *
 * Two standards (Tobias, 2026-11-12): the look without a lens is "Maid standard", the same in every editor, and
 * `options.editorDefault` names the lens that is this editor's own standard (its name says so, e.g. "Standard:
 * Parking"). That lens is listed right under Maid standard and is switched on at the first visit; the person can always
 * go back to Maid standard, and that choice is kept.
 */
export function lenses(
  options: { lenses?: Lens[]; defaultLook?: DefaultLook; editorDefault?: string } = {},
) {
  return defineModule({
    id: 'lenses',
    setup(api) {
      // the panel's code is a chunk of its own: it loads when the flyout opens (or in idle time after the first view)
      const LensPanel = lazyComponent(
        () => import('./LensPanel.tsx').then((panel) => ({ default: panel.LensPanel })),
        PANEL_FALLBACK,
      )
      const { editorDefault } = options
      const all = [...BUILT_IN_LENSES, ...(options.lenses ?? [])]
      // the editor's standard first, right under Maid standard
      lensActions.setBuiltIn([
        ...all.filter((lens) => lens.id === editorDefault),
        ...all.filter((lens) => lens.id !== editorDefault),
      ])
      setDefaultLook(options.defaultLook ?? {})
      if (editorDefault && !isAutomated()) {
        // first visit (the mark is not stored yet): start with the editor's standard. The key is the one the parking
        // and lanes modules used before, so a person who came before is not switched again.
        const storage = moduleStorage()
        const key = `maid:${editorDefault}:lens-started`
        if (storage.getItem(key) === null) {
          storage.setItem(key, '1')
          if (lensChoice.getActiveId() === null) lensChoice.setActive(editorDefault)
        }
      }
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
