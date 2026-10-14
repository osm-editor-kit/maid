/**
 * The photo kind and the URL (`photo_type`), in step. The URL is the live value: when it changes (a link, or the
 * history) the kind shown follows it. A choice of the person (`setPhotoKind`) is shown and written to the URL. A link
 * changes the shown kind and never the stored choice; a URL without the key shows the stored choice.
 *
 * Mounted once, in the map's content (index.ts), so that it runs from the start, also under automation (nothing is
 * requested by it).
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { useEffect } from 'react'
import type { PhotoKind } from './state.ts'
import { storedPhotoKind, streetImageryActions, useShownPhotoKind } from './street-imagery-store.ts'

export function useSyncedPhotoKind(handle: UrlParamHandle<PhotoKind>): void {
  const [url, setUrl] = useUrlParam(handle)
  const shown = useShownPhotoKind()

  // the URL to the kind shown: at the start, and whenever the URL changes (a missing key is the stored choice)
  useEffect(() => {
    streetImageryActions.adoptPhotoKind(url ?? storedPhotoKind())
  }, [url])

  // the kind shown to the URL: after a choice, and once the start has set it. Not compared with the URL here, so that
  // a URL change in the same render is not written back over.
  useEffect(() => {
    if (shown !== null) void setUrl(shown)
  }, [shown, setUrl])
}
