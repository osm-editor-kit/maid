// The cut as the map shows it: the way being cut, the points of the line, the pieces the line would make and the reason
// it is refused. Private to the module: the map reads it through the hooks below, and the mode writes it through
// `cutActions()`, from the mode's callbacks only. Nothing here touches the data: the mode (mode.ts) does that.
import { create } from 'zustand'
import type { CutRefusal } from './cut.ts'
import type { Line, Ring } from './line.ts'

type CutState = {
  /** The closed way being cut; undefined when no cut is under way */
  wayId: string | undefined
  /** The points of the line, the first and the last are the ends; undefined until the line is set */
  points: Line | undefined
  /** The pieces the line makes; undefined while the line is refused */
  pieces: readonly Ring[] | undefined
  /** Why the line is refused; undefined while it cuts */
  refusal: CutRefusal | undefined
}

type CutActions = {
  /** A cut of this way starts: no line yet */
  begin: (wayId: string) => void
  /** The cut ends: everything is cleared */
  end: () => void
  /** The line as it is now, with the pieces it makes or the reason it is refused */
  show: (points: Line, pieces: readonly Ring[] | undefined, refusal: CutRefusal | undefined) => void
}

type CutStore = CutState & { actions: CutActions }

const CLEARED: CutState = {
  wayId: undefined,
  points: undefined,
  pieces: undefined,
  refusal: undefined,
}

const useCutStore = create<CutStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (wayId) => set({ ...CLEARED, wayId }),
    end: () => set(CLEARED),
    show: (points, pieces, refusal) => set({ points, pieces, refusal }),
  },
}))

/** The actions of the cut. Called from the mode's callbacks, never during render. */
export function cutActions(): CutActions {
  return useCutStore.getState().actions
}

/** The state of the cut as it is now, read outside React (the mode and the tests read it this way) */
export function cutSnapshot(): Omit<CutStore, 'actions'> {
  const { actions: _actions, ...state } = useCutStore.getState()
  return state
}

/** The way being cut, or undefined when no cut is under way */
export function useCutWayId() {
  return useCutStore((state) => state.wayId)
}

/** The points of the line */
export function useCutPoints() {
  return useCutStore((state) => state.points)
}

/** The pieces the line makes, when it cuts */
export function useCutPieces() {
  return useCutStore((state) => state.pieces)
}

/** Why the line is refused, when it is */
export function useCutRefusal() {
  return useCutStore((state) => state.refusal)
}
