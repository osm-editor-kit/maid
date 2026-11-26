/**
 * The lists this browser keeps, for the overview in the dock and the count on its tab: read from the file cache when
 * the module starts and again after a list was opened or deleted. Its own small store: it lives beside the open list.
 */
import { createStore, useStore } from 'zustand'
import type { CachedFile } from './local.ts'
import type { OpenDeps } from './open.ts'

export type KeptList = Omit<CachedFile, 'text'>

type OverviewState = {
  kept: KeptList[]
  /** The overview is shown instead of the open list ("<" beside the list's title) */
  browsing: boolean
}

export const overviewStore = createStore<OverviewState>()(() => ({ kept: [], browsing: false }))

export function useOverview<T>(pick: (state: OverviewState) => T): T {
  return useStore(overviewStore, pick)
}

/** Reads the kept lists again (IndexedDB, no request) */
export async function refreshKept(deps: Pick<OpenDeps, 'cache'>) {
  overviewStore.setState({ kept: await deps.cache.list() })
}

export function setBrowsing(browsing: boolean) {
  overviewStore.setState({ browsing })
}
