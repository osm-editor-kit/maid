import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlSetting } from '@osm-editor-kit/maid-core/react'
import { useNotesSettingsActions, useStoredNotesOn } from './store.ts'

/**
 * Whether the notes are on, and the person's choice of it. The URL (`notes`) is the live value, the stored choice
 * (`maid:notes`) is the default for the next visit, and a link never writes storage (core's `useUrlSetting`). With
 * `omitFallback`, off is no key once the URL says what is shown.
 *
 * One component writes the key: the map layer (notes.tsx), which passes `ready` (false while a turn-on request is
 * pending, the map layer's own effect writes it then). Every other caller reads and chooses only, with `ready: false`,
 * so the key has one writer at a time. `choose` writes the URL whatever `ready` is.
 */
export function useNotesSwitch(handle: UrlParamHandle<boolean>, options: { ready?: boolean } = {}) {
  const stored = useStoredNotesOn()
  const { setEnabled } = useNotesSettingsActions()
  const { value, choose } = useUrlSetting(handle, {
    stored,
    fallback: false,
    remember: setEnabled,
    omitFallback: true,
    ready: options.ready,
  })
  return { enabled: value, setEnabled: choose }
}
