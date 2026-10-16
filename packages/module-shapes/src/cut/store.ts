// The cut as the map shows it: the way being cut, the points clicked so far, the pointer, the chord that Enter would cut
// and the reason the line is refused. Private to the module. Nothing here touches the data: the mode (mode.ts) does that.
import { create, useStore } from 'zustand'
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

export const cutStore = create<CutStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (wayId) => set({ ...CLEARED, wayId }),
    end: () => set(CLEARED),
    setLine: (points, chord, refusal) => set({ points, chord, refusal }),
    setRefusal: (refusal) => set({ refusal }),
    setPointer: (pointer) => set({ pointer }),
  },
}))

/** The actions of the cut. Called from event handlers and the mode, never during render. */
export const cutActions = cutStore.getState().actions

/** The whole state of the cut, read again on each change (the map content and the status text read it) */
export function useCut(): CutState {
  return useStore(cutStore)
}
