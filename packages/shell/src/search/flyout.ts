import { isAutomated } from '@osm-editor-kit/maid-core'
import { getSettings } from '@osm-editor-kit/maid-ui'
/**
 * The search flyout's open state, shared by the top bar's button, the Ctrl+F / Cmd+F shortcut and the
 * "Search a place" button of the map's hint. A small zustand store, read through a selector. Opening also
 * asks the input for the focus, so a second Ctrl+F while the flyout is open moves the focus back to the input.
 */
import { create } from 'zustand'

interface SearchFlyoutState {
  open: boolean
  /** Counts the requests for the input's focus */
  focus: number
  /** The start has been looked at: only the first page load can open the flyout by itself */
  started: boolean
}

interface SearchFlyoutActions {
  /** Opens the flyout and asks for the focus */
  open: () => void
  setOpen: (open: boolean) => void
  /** At the first start of the page without a position, opens the flyout once (the rule is written at the action) */
  openAtStart: (hasUrlPosition: boolean) => void
}

type SearchFlyoutStore = SearchFlyoutState & { actions: SearchFlyoutActions }

/** The store is in this file. Components read the state through the hooks below, and the actions through `useSearchActions`. */
const useSearchFlyoutStore = create<SearchFlyoutStore>()((set, get) => ({
  open: false,
  focus: 0,
  started: false,
  actions: {
    open: () => set((state) => ({ open: true, focus: state.focus + 1 })),
    setOpen: (open) => set({ open }),
    /**
     * At the first start of the page without a position (no `map=` in the URL and no last position
     * stored), the flyout opens once by itself. Never under automation, so checks and benchmarks see no change.
     */
    openAtStart: (hasUrlPosition) => {
      if (get().started) return
      set({ started: true })
      if (hasUrlPosition || isAutomated()) return
      if (getSettings().lastView !== undefined) return
      get().actions.open()
    },
  },
}))

/** Whether the flyout is open */
export function useSearchOpen(): boolean {
  return useSearchFlyoutStore((flyout) => flyout.open)
}

/** Counts the requests for the input's focus: each change asks the input for the focus */
export function useSearchFocus(): number {
  return useSearchFlyoutStore((flyout) => flyout.focus)
}

/** The flyout's actions: the object never changes, so a component may destructure it */
export function useSearchActions(): SearchFlyoutActions {
  return useSearchFlyoutStore((flyout) => flyout.actions)
}
