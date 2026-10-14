/**
 * Keeps the URL and the lens on the map in step. The URL (`lens`) is the live value: when it changes (a link, the
 * history, or the module's own write) the lens shown follows it, and the URL is corrected where it names something
 * else (an unknown id becomes `none`, a missing one the stored choice). A choice of the person (`setActive`) is shown
 * and written to the URL. Storage changes only with a choice, never with a link.
 *
 * Mounted once, in the map's content (module.tsx), so that it is there from the start.
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { useEffect } from 'react'
import { lensActions, useActiveLensId, useLensStarted } from './lens-store.ts'
import { NO_LENS } from './url.ts'

export function useLensUrl(handle: UrlParamHandle<string>): void {
  const [url, setUrl] = useUrlParam(handle)
  const shownId = useActiveLensId()
  const started = useLensStarted()

  // the URL to the lens shown: at the start, and whenever the URL changes. The URL is corrected where it differs.
  useEffect(() => {
    const shown = lensActions.showFromUrl(url)
    if ((url ?? NO_LENS) !== (shown ?? NO_LENS)) void setUrl(shown ?? NO_LENS)
  }, [url, setUrl])

  // the lens shown to the URL: after a choice of the person. Once started, it agrees with what the URL step wrote.
  useEffect(() => {
    if (started) void setUrl(shownId ?? NO_LENS)
  }, [started, shownId, setUrl])
}
