/**
 * The notes switch, from the URL (`notes`) and the stored choice (`maid:notes`). The URL is the live value; a choice
 * writes both (the URL and the stored value), and a link writes storage never. Without a URL value the stored choice
 * is shown. Both hooks take the handle the module declared (notes.tsx).
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { useEffect } from 'react'
import { useNotesSettings } from './store.ts'
import { notesValueFor, shownNotes } from './url.ts'

/** Whether the notes are on, and the person's choice of it: a choice writes the URL and the stored value */
export function useNotesSwitch(handle: UrlParamHandle<true>) {
  const [url, setUrl] = useUrlParam(handle)
  const stored = useNotesSettings((state) => state.enabled)
  const setStored = useNotesSettings((state) => state.setEnabled)
  return {
    enabled: shownNotes(url, stored),
    setEnabled: (enabled: boolean) => {
      void setUrl(notesValueFor(enabled))
      setStored(enabled)
    },
  }
}

/**
 * Once the map layer is mounted, the URL says what is shown: `notes=1` when they are on (from a stored choice or a
 * link), no key when they are off. It writes the URL only, never storage.
 */
export function useNotesStart(handle: UrlParamHandle<true>): void {
  const [url, setUrl] = useUrlParam(handle)
  const stored = useNotesSettings((state) => state.enabled)
  const want = notesValueFor(shownNotes(url, stored))
  useEffect(() => {
    if (url !== want) void setUrl(want)
  }, [url, want, setUrl])
}
