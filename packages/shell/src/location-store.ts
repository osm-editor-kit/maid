import { create } from 'zustand'

/**
 * What "Follow my location" shows: `off` (not following), `waiting` (asked, no position yet), `following`
 * (the map centres on the person), `background` (the person moved the map; the location is still tracked),
 * `error` (the browser could not give a position).
 */
export type FollowState = 'off' | 'waiting' | 'following' | 'background' | 'error'

interface FollowActions {
  /** The person turned the flyout's toggle on or off */
  setWanted: (wanted: boolean) => void
  /** Set by FollowLocation from the events of MapLibre's GeolocateControl */
  setState: (state: FollowState) => void
  /** "Follow again" in the background state: wanted stays on, and FollowLocation starts the control again */
  refollow: () => void
}

interface FollowLocationState {
  wanted: boolean
  state: FollowState
  /** Counts the requests to follow again, so that a request is seen even when `wanted` is already on */
  refollows: number
  actions: FollowActions
}

const useFollowLocationStore = create<FollowLocationState>()((set) => ({
  wanted: false,
  state: 'off',
  refollows: 0,
  actions: {
    setWanted: (wanted) => set({ wanted }),
    setState: (state) => set({ state }),
    refollow: () => set((s) => ({ wanted: true, refollows: s.refollows + 1 })),
  },
}))

/** Whether the person wants the map to follow their location */
export function useFollowWanted() {
  return useFollowLocationStore((state) => state.wanted)
}

export function useFollowState() {
  return useFollowLocationStore((state) => state.state)
}

/** Changes when the person asks to follow again (see `refollow`) */
export function useFollowRefollows() {
  return useFollowLocationStore((state) => state.refollows)
}

/** The state now, for event handlers and effects that must not re-run when it changes */
export function currentFollowState(): FollowState {
  return useFollowLocationStore.getState().state
}

export const followActions = {
  setWanted: (wanted: boolean) => useFollowLocationStore.getState().actions.setWanted(wanted),
  setState: (state: FollowState) => useFollowLocationStore.getState().actions.setState(state),
  refollow: () => useFollowLocationStore.getState().actions.refollow(),
}
