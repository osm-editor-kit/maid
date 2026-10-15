// The reroute the person is making, as UI state: the route relation, the two points they set, which occurrence of a
// stretch that occurs more than once they picked, and their answers to the role questions. Private to the module: the
// components read it through the named hooks below and change it through `rerouteActions`, from event handlers only.
// Nothing here touches the data (the apply port does that).
import { create, useStore } from 'zustand'

export type ViaHandle = 'start' | 'end'

/** A point the person set, as longitude and latitude (snapped to the routing graph later, in the preview) */
export type ViaPoint = { lon: number; lat: number }

type RerouteState = {
  /** The route relation being rerouted; undefined when no reroute is under way */
  relationId: EntityID | undefined
  start: ViaPoint | undefined
  end: ViaPoint | undefined
  /** The occurrence of the stretch the mapper picked (0 is the first); used when the stretch occurs more than once */
  occurrence: number
  /** The answers to the role questions, by route segment index. They belong to one route: a moved point clears them. */
  roleChoices: Readonly<Record<number, string>>
}

type RerouteActions = {
  /** Starts a reroute of this relation: everything is cleared */
  begin: (relationId: EntityID) => void
  /** Ends the reroute: everything is cleared */
  stop: () => void
  /** A click on the map: the first sets the start, the next sets the end (a click again moves the end) */
  click: (point: ViaPoint) => void
  /** A handle is dragged (or dropped) to a new place */
  moveVia: (handle: ViaHandle, point: ViaPoint) => void
  setOccurrence: (occurrence: number) => void
  setRoleChoice: (segment: number, role: string) => void
}

type RerouteStore = RerouteState & { actions: RerouteActions }

const CLEARED: RerouteState = {
  relationId: undefined,
  start: undefined,
  end: undefined,
  occurrence: 0,
  roleChoices: {},
}

const rerouteStore = create<RerouteStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (relationId) => set({ ...CLEARED, relationId }),
    stop: () => set(CLEARED),
    click: (point) =>
      set((state) => {
        if (state.relationId === undefined) return {}
        return state.start === undefined
          ? { start: point, roleChoices: {}, occurrence: 0 }
          : { end: point, roleChoices: {}, occurrence: 0 }
      }),
    moveVia: (handle, point) =>
      set(
        handle === 'start'
          ? { start: point, roleChoices: {}, occurrence: 0 }
          : { end: point, roleChoices: {}, occurrence: 0 },
      ),
    setOccurrence: (occurrence) => set({ occurrence }),
    setRoleChoice: (segment, role) =>
      set((state) => ({ roleChoices: { ...state.roleChoices, [segment]: role } })),
  },
}))

/** The actions of the reroute. Called from event handlers, never during render. */
export const rerouteActions = rerouteStore.getState().actions

/** The relation being rerouted, or undefined when none is */
export function useRerouteRelationId() {
  return useStore(rerouteStore, (state) => state.relationId)
}

export function useRerouteStart() {
  return useStore(rerouteStore, (state) => state.start)
}

export function useRerouteEnd() {
  return useStore(rerouteStore, (state) => state.end)
}

export function useRerouteOccurrence() {
  return useStore(rerouteStore, (state) => state.occurrence)
}

export function useRerouteRoleChoices() {
  return useStore(rerouteStore, (state) => state.roleChoices)
}

/** The state as it is now, for code outside React (the map's handlers and the tests) */
export function readReroute(): RerouteState {
  const { relationId, start, end, occurrence, roleChoices } = rerouteStore.getState()
  return { relationId, start, end, occurrence, roleChoices }
}
