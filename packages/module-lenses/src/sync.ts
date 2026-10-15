/**
 * Keeps the URL and the lens on the map in step, with core's `useUrlSetting` (one live state, as in
 * docs/research/url-state-audit.md). The URL (`lens`) is the live value: it names the lens on the map, an id that is
 * not a lens here shows none (and the URL is corrected to `none`), and no key shows the stored choice. A choice of the
 * person is written to the URL and remembered for the next visit; a link never writes storage.
 *
 * The lens on the map is fed from the hook's value into the store (`setShown`): the one place the map, the panel and
 * the parking module read it. A choice made outside the URL (the panel, the parking module, the bench) is a request in
 * the store; this component writes it through the hook, so it reaches the URL and storage the same way.
 *
 * Mounted once, in the map's content (module.tsx), so that it is there from the start.
 */
import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlSetting } from '@osm-editor-kit/maid-core/react'
import { useEffect, useMemo } from 'react'
import {
  allLenses,
  lensActions,
  useBuiltInLenses,
  useChosenLensId,
  useImportedLenses,
  useLensRequest,
} from './lens-store.ts'
import { NO_LENS, resolveLens } from './url.ts'

export function useLensUrl(handle: UrlParamHandle<string>): void {
  const stored = useChosenLensId()
  const builtIn = useBuiltInLenses()
  const imported = useImportedLenses()
  const request = useLensRequest()
  const known = useMemo(
    () => allLenses({ builtIn, imported }).map((lens) => lens.id),
    [builtIn, imported],
  )
  const { value, choose } = useUrlSetting(handle, {
    stored,
    fallback: NO_LENS,
    remember: lensActions.remember,
    resolve: (id) => resolveLens(id, known),
  })

  // the lens on the map is what the URL shows
  useEffect(() => {
    lensActions.setShown(value === NO_LENS ? null : value)
  }, [value])

  // a choice made outside the URL: written after the hook's own write above (effects run in declaration order)
  useEffect(() => {
    if (request === null) return
    choose(request.id ?? NO_LENS)
    lensActions.answer(request)
  }, [request, choose])
}
