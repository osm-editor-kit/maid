// The extrude as the map and the panel show it: the way in metres with its sides, the pull under way and the panel's
// toggle. Private to the module: the map reads it through the hooks below, and the mode writes it through
// `extrudeActions()`, from the mode's callbacks and the panel's button only. The data changes when a pull ends
// (mode.ts); during a pull the map draws the store's result.
import { create } from 'zustand'
import type { ExtrudeResult, ExtrudeWay, Side } from './extrude.ts'

/** The side being pulled, how far, and the way it would make */
export type ExtrudePull = { side: Side; distance: number; result: ExtrudeResult }

type ExtrudeState = {
  /** The way being extruded, in metres; undefined when no extrude is under way */
  way: ExtrudeWay | undefined
  /** Its sides: one handle each */
  sides: readonly Side[]
  /** The pull under way, if any */
  pull: ExtrudePull | undefined
  /** The panel's toggle "Move side": a held Shift turns it round while a handle is dragged */
  moveSide: boolean
}

type ExtrudeActions = {
  /** An extrude of this way starts, or the way changed (a pull ended, an undo): the handles follow it */
  show: (way: ExtrudeWay, sides: readonly Side[]) => void
  /** The pull as it is now, or none */
  pull: (pull: ExtrudePull | undefined) => void
  toggleMoveSide: () => void
  /** The extrude ends: everything is cleared */
  end: () => void
}

type ExtrudeStore = ExtrudeState & { actions: ExtrudeActions }

const CLEARED: ExtrudeState = { way: undefined, sides: [], pull: undefined, moveSide: false }

const useExtrudeStore = create<ExtrudeStore>()((set) => ({
  ...CLEARED,
  actions: {
    show: (way, sides) => set({ way, sides, pull: undefined }),
    pull: (pull) => set({ pull }),
    toggleMoveSide: () => set((state) => ({ moveSide: !state.moveSide })),
    end: () => set(CLEARED),
  },
}))

/** The actions of the extrude. Called from the mode's callbacks and the panel's button, never during render. */
export function extrudeActions(): ExtrudeActions {
  return useExtrudeStore.getState().actions
}

/** The state as it is now, read outside React (the mode and the tests read it this way) */
export function extrudeSnapshot(): ExtrudeState {
  const { actions: _actions, ...state } = useExtrudeStore.getState()
  return state
}

/** The way and its sides */
export function useExtrudeWay() {
  const way = useExtrudeStore((state) => state.way)
  const sides = useExtrudeStore((state) => state.sides)
  return { way, sides }
}

/** The pull under way */
export function useExtrudePull() {
  return useExtrudeStore((state) => state.pull)
}

/** The panel's toggle */
export function useExtrudeMoveSide() {
  return useExtrudeStore((state) => state.moveSide)
}
