// The cut as the map shows it: the way being cut, the points clicked so far, the pointer, the chord that Enter would cut
// and the reason the line is refused. Private to the module: the map reads it through the hooks below, and the mode writes
// it through `cutActions()`, from the mode's callbacks only. Nothing here touches the data: the mode (mode.ts) does that.
import { create } from 'zustand'
import type { CutRefusal, Loc } from './cut.ts'

type CutState = {
  /** The closed way being cut; undefined when no cut is under way */
  wayId: string | undefined
  /** The points clicked, in order */
  points: readonly Loc[]
  /** Where the pointer is on the map, for the rubber band; undefined when it is off the map */
  pointer: Loc | undefined
  /** The chord that Enter would cut, when the clicked line makes a valid cut */
  chord: readonly Loc[] | undefined
  /** Why the clicked line is refused (only once there are two points, or when Enter was pressed) */
  refusal: CutRefusal | undefined
}

type CutActions = {
  /** A cut of this way starts: nothing clicked yet */
  begin: (wayId: string) => void
  /** The cut ends: everything is cleared */
  end: () => void
  /** The clicked points, with the chord and the refusal they give */
  setLine: (
    points: readonly Loc[],
    chord: readonly Loc[] | undefined,
    refusal: CutRefusal | undefined,
  ) => void
  /** A refusal for the line as it is (Enter on a line that cannot be cut) */
  setRefusal: (refusal: CutRefusal) => void
  setPointer: (pointer: Loc | undefined) => void
}

type CutStore = CutState & { actions: CutActions }

const CLEARED: CutState = {
  wayId: undefined,
  points: [],
  pointer: undefined,
  chord: undefined,
  refusal: undefined,
}

const useCutStore = create<CutStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (wayId) => set({ ...CLEARED, wayId }),
    end: () => set(CLEARED),
    setLine: (points, chord, refusal) => set({ points, chord, refusal }),
    setRefusal: (refusal) => set({ refusal }),
    setPointer: (pointer) => set({ pointer }),
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

/** The points clicked so far */
export function useCutPoints() {
  return useCutStore((state) => state.points)
}

/** Where the pointer is, for the rubber band */
export function useCutPointer() {
  return useCutStore((state) => state.pointer)
}

/** The chord that Enter would cut */
export function useCutChord() {
  return useCutStore((state) => state.chord)
}

/** Why the line is refused, when it is shown */
export function useCutRefusal() {
  return useCutStore((state) => state.refusal)
}
