import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlSetting } from '@osm-editor-kit/maid-core/react'
import { useSettingsActions, useStoredTheme, type Theme } from '@osm-editor-kit/maid-ui'
import { throttle, useQueryState } from 'nuqs'
import { stateParams } from './params'

/** The `theme` parameter as a handle for core's `useUrlSetting`: replaces the history entry, as the others do */
const themeHandle: UrlParamHandle<Theme> = {
  name: 'theme',
  parser: stateParams.theme,
  options: { history: 'replace' },
}

/**
 * Theme: the URL's `theme` decides while it is there (a link), else the stored choice, else `system`. Choosing writes
 * the URL and remembers the choice; `system` removes the key. A link never writes storage. `value` is what is shown:
 * the page's dark class follows it (`useAppliedTheme` in the ui package).
 */
export function useThemeSetting() {
  const stored = useStoredTheme()
  const { setTheme } = useSettingsActions()
  return useUrlSetting(themeHandle, {
    stored,
    fallback: 'system',
    remember: setTheme,
    omitFallback: true,
  })
}

/**
 * Map position in the URL. Written on move end, replacing the history entry. Updates are limited to one per
 * 300 ms (nuqs' `throttle`, which replaced the deprecated `throttleMs`).
 */
export function useCameraParam() {
  return useQueryState(
    'map',
    stateParams.map.withOptions({ history: 'replace', limitUrlUpdates: throttle(300) }),
  )
}

/** Filter states in the URL, only what differs from the editor's filters */
export function useFiltersParam() {
  return useQueryState('filters', stateParams.filters.withOptions({ history: 'replace' }))
}

/** What the map shows of the data in the URL: `wireframe` or `edits`, none for the normal look (url/display.ts) */
export function useDisplayParam() {
  return useQueryState('display', stateParams.display.withOptions({ history: 'replace' }))
}

/** Selected feature in the URL, e.g. `id=w123`, like iD */
export function useSelectedId() {
  return useQueryState('id', stateParams.id.withOptions({ history: 'replace' }))
}
