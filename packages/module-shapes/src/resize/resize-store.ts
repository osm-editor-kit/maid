// The resize as the map and the panel show it: the selection, the box when the resize started, the box now, and the two
// toggles of the panel. Private to the module: the map reads it through the hooks below, and the mode writes it through
// `resizeActions()`, from the mode's callbacks and the panel's buttons only. The data is written by the mode (mode.ts).
import { create } from 'zustand'
import type { Extent } from './box.ts'
import type { ResizeBox } from './resize.ts'

type ResizeState = {
  /** The features being resized; empty when no resize is under way */
  ids: readonly string[]
  /** The box around them when the resize started; undefined when none is under way */
  box: ResizeBox | undefined
  /** The box now */
  extent: Extent | undefined
  /** The panel's toggles: a held Shift or Alt turns its toggle round while a handle is dragged */
  proportional: boolean
  centre: boolean
}

type ResizeActions = {
  /** A resize of these features starts, with the box around them */
  begin: (ids: readonly string[], box: ResizeBox) => void
  /** The resize ends: everything is cleared */
  end: () => void
  /** The box as it is now */
  show: (extent: Extent) => void
  toggleProportional: () => void
  toggleCentre: () => void
}

type ResizeStore = ResizeState & { actions: ResizeActions }

const CLEARED: ResizeState = {
  ids: [],
  box: undefined,
  extent: undefined,
  proportional: false,
  centre: false,
}

const useResizeStore = create<ResizeStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (ids, box) => set({ ...CLEARED, ids, box, extent: box.extent }),
    end: () => set(CLEARED),
    show: (extent) => set({ extent }),
    toggleProportional: () => set((state) => ({ proportional: !state.proportional })),
    toggleCentre: () => set((state) => ({ centre: !state.centre })),
  },
}))

/** The actions of the resize. Called from the mode's callbacks and the panel's buttons, never during render. */
export function resizeActions(): ResizeActions {
  return useResizeStore.getState().actions
}

/** The state of the resize as it is now, read outside React (the mode and the tests read it this way) */
export function resizeSnapshot(): ResizeState {
  const { actions: _actions, ...state } = useResizeStore.getState()
  return state
}

/** The box when the resize started, or undefined when none is under way */
export function useResizeBox() {
  return useResizeStore((state) => state.box)
}

/** The box now */
export function useResizeExtent() {
  return useResizeStore((state) => state.extent)
}

/** The panel's toggles */
export function useResizeToggles() {
  const proportional = useResizeStore((state) => state.proportional)
  const centre = useResizeStore((state) => state.centre)
  return { proportional, centre }
}
