import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlSetting } from '@osm-editor-kit/maid-core/react'
import { useNotesSettings } from './store.ts'

/**
 * Whether the notes are on, and the person's choice of it. The URL (`notes`) is the live value, the stored choice
 * (`maid:notes`) is the default for the next visit, and a link never writes storage (core's `useUrlSetting`). With
 * `omitFallback`, off is no key once the URL says what is shown; the map layer's call writes that at start.
 * The map layer and the panel both call it, so each reads the same URL and the same stored choice.
 */
export function useNotesSwitch(handle: UrlParamHandle<boolean>) {
  const stored = useNotesSettings((state) => state.enabled)
  const setStored = useNotesSettings((state) => state.setEnabled)
  const { value, choose } = useUrlSetting(handle, {
    stored,
    fallback: false,
    remember: setStored,
    omitFallback: true,
  })
  return { enabled: value, setEnabled: choose }
}
