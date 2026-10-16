// The division the person is making, as UI state: the area, the columns and rows, and a refusal to show. Private to the
// module: the panel reads it through `divideStore`, and the mode and the keys change it through `divideActions`. Nothing
// here touches the data (mode.ts does that when the division is applied).
import { create } from 'zustand'
import type { DivideRefusal } from './divide.ts'
import { stepDivision, withAxis, type Axis } from './division.ts'

type DivideState = {
  /** The area being divided; undefined when no division is under way */
  wayId: string | undefined
  columns: number
  rows: number
  /** Why the last Apply was refused; cleared by any change */
  refusal: DivideRefusal | undefined
}

type DivideActions = {
  /** Starts a division of this area, with the defaults: two columns, one row */
  begin: (wayId: string) => void
  /** Ends it: everything is cleared */
  stop: () => void
  /** Sets one number from the panel's field (kept in range) */
  set: (axis: Axis, value: number) => void
  /** Moves one number by a key: +1 or -1 */
  step: (axis: Axis, delta: 1 | -1) => void
  /** Shows why the division was refused, or clears it */
  refuse: (reason: DivideRefusal | undefined) => void
}

type DivideStore = DivideState & { actions: DivideActions }

const CLEARED: DivideState = { wayId: undefined, columns: 2, rows: 1, refusal: undefined }

export const divideStore = create<DivideStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (wayId) => set({ ...CLEARED, wayId }),
    stop: () => set(CLEARED),
    set: (axis, value) => set((state) => ({ ...withAxis(state, axis, value), refusal: undefined })),
    step: (axis, delta) =>
      set((state) => ({ ...stepDivision(state, axis, delta), refusal: undefined })),
    refuse: (reason) => set({ refusal: reason }),
  },
}))

/** The division's actions, for the mode and the panel's handlers */
export const divideActions = divideStore.getState().actions
