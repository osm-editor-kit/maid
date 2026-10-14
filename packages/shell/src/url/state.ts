import { throttle, useQueryState } from 'nuqs'
import { stateParams } from './params'

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

/** Selected feature in the URL, e.g. `id=w123`, like iD */
export function useSelectedId() {
  return useQueryState('id', stateParams.id.withOptions({ history: 'replace' }))
}
