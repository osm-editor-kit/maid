import { isAutomated } from '@osm-editor-kit/maid-core'
import { getSettings } from '@osm-editor-kit/maid-ui'
/**
 * The search flyout's open state, shared by the top bar's button, the Ctrl+F / Cmd+F shortcut and the
 * "Search a place" button of the map's hint. A small zustand store, read through a selector. Opening also
 * asks the input for the focus, so a second Ctrl+F while the flyout is open moves the focus back to the input.
 */
import { create } from 'zustand'

interface SearchFlyoutStore {
  open: boolean
  /** Counts the requests for the input's focus */
  focus: number
  /** The start has been looked at: only the first page load can open the flyout by itself */
  started: boolean
}

/** The store stays here: components read the state through the hooks below, the functions change it */
const useSearchFlyoutStore = create<SearchFlyoutStore>()(() => ({
  open: false,
  focus: 0,
  started: false,
}))

/** Whether the flyout is open */
export function useSearchOpen(): boolean {
  return useSearchFlyoutStore((flyout) => flyout.open)
}

/** Counts the requests for the input's focus: each change asks the input for the focus */
export function useSearchFocus(): number {
  return useSearchFlyoutStore((flyout) => flyout.focus)
}

export function openSearch() {
  useSearchFlyoutStore.setState((state) => ({ open: true, focus: state.focus + 1 }))
}

export function setSearchOpen(open: boolean) {
  useSearchFlyoutStore.setState({ open })
}

/**
 * At the first start of the page without a position (no `map=` in the URL and no last position
 * stored), the flyout opens once by itself. Never under automation, so checks and benchmarks see no change.
 */
export function openSearchAtStart(hasUrlPosition: boolean) {
  if (useSearchFlyoutStore.getState().started) return
  useSearchFlyoutStore.setState({ started: true })
  if (hasUrlPosition || isAutomated()) return
  if (getSettings().lastView !== undefined) return
  openSearch()
}
