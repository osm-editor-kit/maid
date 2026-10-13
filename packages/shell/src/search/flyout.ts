import { isAutomated } from '@osm-editor-kit/maid-core'
import { useSettings } from '@osm-editor-kit/maid-ui'
/**
 * The search flyout's open state, shared by the top bar's button, the Ctrl+F / Cmd+F shortcut and the
 * "Search a place" button of the map's hint. A small store read with useSyncExternalStore (shell has no
 * store library of its own). Opening also asks the input for the focus, so a second Ctrl+F while the
 * flyout is open moves the focus back to the input.
 */
import { useSyncExternalStore } from 'react'

interface FlyoutState {
  open: boolean
  /** Counts the requests for the input's focus */
  focus: number
  /** The start has been looked at: only the first page load can open the flyout by itself */
  started: boolean
}

const state: { current: FlyoutState } = { current: { open: false, focus: 0, started: false } }
const listeners = new Set<() => void>()

function update(patch: Partial<FlyoutState>) {
  state.current = { ...state.current, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A value of the flyout's state, read inside a component */
export function useSearchFlyout<T>(pick: (flyout: FlyoutState) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state.current))
}

export function openSearch() {
  update({ open: true, focus: state.current.focus + 1 })
}

export function setSearchOpen(open: boolean) {
  update({ open })
}

/**
 * At the first start of the page without a position (no `map=` in the URL and no last position
 * stored), the flyout opens once by itself. Never under automation, so checks and benchmarks see no change.
 */
export function openSearchAtStart(hasUrlPosition: boolean) {
  if (state.current.started) return
  update({ started: true })
  if (hasUrlPosition || isAutomated()) return
  if (useSettings.getState().lastView !== undefined) return
  openSearch()
}
