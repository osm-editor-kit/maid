// The reroute the person is making, as UI state: the route relation, the edit under way (the start and the end of the
// stretch and the points the new path passes), which occurrence of a stretch that occurs more than once they picked,
// their answers to the role questions, and what the last edit changed. Private to the module: the
// components read it through the named hooks below and change it through `rerouteActions`, from event handlers only.
// Nothing here touches the data (the apply port does that).
import { create, useStore } from 'zustand'

/** A handle on the map: the start, the end, or a via point by its index (`via-0`, `via-1`, …) */
export type ViaHandle = 'start' | 'end' | `via-${number}`

/** A point the person set, as longitude and latitude (snapped to the routing graph later, in the preview) */
export type ViaPoint = { lon: number; lat: number; member?: number }

type RerouteState = {
  /** The route relation being rerouted; undefined when no reroute is under way */
  relationId: EntityID | undefined
  start: ViaPoint | undefined
  end: ViaPoint | undefined
  /** The points the new path must pass, in order from the start to the end */
  vias: readonly ViaPoint[]
  /** The member index of the way the reroute was started from (the edit menu), or undefined (the inspector section) */
  anchor: number | undefined
  /**
   * What was selected when the reroute began (the way of the edit menu, or the relation): a selection without it ends
   * the reroute
   */
  selected: EntityID | undefined
  /** The occurrence of the stretch the mapper picked (0 is the first); used when the stretch occurs more than once */
  occurrence: number
  /** The answers to the role questions, by route segment index. They belong to one route: a moved point clears them. */
  roleChoices: Readonly<Record<number, string>>
  /** Counts the drops: a new value asks the map to write the edit under way (RerouteOnMap) */
  commitAsked: number
  /** What the last written edit changed: the ways that left the route and those that joined it */
  lastChange: RouteChange | undefined
  /** Why the last drop could not be written, as the port or the plan says */
  failure: string | undefined
}

/** The ways an edit took out of the route and put into it */
export type RouteChange = { removed: readonly EntityID[]; added: readonly EntityID[] }

type RerouteActions = {
  /** Starts a reroute of this relation from its inspector section: everything is cleared, the clicks set the points */
  begin: (relationId: EntityID) => void
  /**
   * Starts the route planner mode of this relation (the edit menu on a way, or the inspector section): the route is a
   * line with support points; `selected` is what is selected now (a selection without it and the relation ends it)
   */
  beginRoute: (relationId: EntityID, selected: EntityID) => void
  /** An edit begins: a press on the line or on a support point (chain.ts `editAt`, `editOfAnchor`) */
  edit: (input: { start: ViaPoint; end: ViaPoint; via: ViaPoint; anchor: number }) => void
  /** The drag ends: the map writes the edit (see `commitAsked`) */
  drop: () => void
  /** The edit was written: it is cleared, and its change is kept to show */
  applied: (change: RouteChange) => void
  /** The edit could not be written: it stays, with the reason */
  failed: (reason: string) => void
  /** Drops the edit under way, the mode stays */
  discard: () => void
  /** Forgets the last change (it was undone) */
  forgetChange: () => void
  /** A via point dragged out of the line: inserted at `index` among the via points */
  addVia: (index: number, point: ViaPoint) => void
  /** Removes a via point; with no index, the last one */
  removeVia: (index?: number) => void
  /** Removes every via point */
  clearVias: () => void
  /** Ends the reroute: everything is cleared */
  stop: () => void
  /** A click on the map: the first sets the start, the next sets the end, and each after that adds a via point */
  click: (point: ViaPoint) => void
  /** A handle is dragged (or dropped) to a new place */
  moveVia: (handle: ViaHandle, point: ViaPoint) => void
  setOccurrence: (occurrence: number) => void
  setRoleChoice: (segment: number, role: string) => void
}

/** A rough distance for ordering points: degrees, with the longitude shrunk by the latitude */
function roughDistance(a: ViaPoint, b: ViaPoint): number {
  const k = Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((a.lon - b.lon) * k, a.lat - b.lat)
}

/**
 * Where a new via point goes among the via points: between the pair of neighbouring points (start, vias, end) whose
 * detour through it is the shortest. Returns the index among the via points.
 */
export function viaIndexFor(points: readonly ViaPoint[], point: ViaPoint): number {
  let best = 0
  let bestDetour = Number.POSITIVE_INFINITY
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!
    const b = points[k]!
    const detour = roughDistance(a, point) + roughDistance(point, b) - roughDistance(a, b)
    if (detour < bestDetour) {
      bestDetour = detour
      best = k - 1
    }
  }
  return best
}

type RerouteStore = RerouteState & { actions: RerouteActions }

const CLEARED: RerouteState = {
  relationId: undefined,
  start: undefined,
  end: undefined,
  vias: [],
  anchor: undefined,
  selected: undefined,
  occurrence: 0,
  roleChoices: {},
  commitAsked: 0,
  lastChange: undefined,
  failure: undefined,
}

/** No edit under way: the parts of the state an edit sets */
const NO_EDIT = {
  start: undefined,
  end: undefined,
  vias: [],
  anchor: undefined,
  occurrence: 0,
  roleChoices: {},
  failure: undefined,
} as const

const rerouteStore = create<RerouteStore>()((set) => ({
  ...CLEARED,
  actions: {
    begin: (relationId) => set({ ...CLEARED, relationId, selected: relationId }),
    beginRoute: (relationId, selected) => set({ ...CLEARED, relationId, selected }),
    edit: ({ start, end, via, anchor }) =>
      set((state) =>
        state.relationId === undefined
          ? {}
          : { ...NO_EDIT, start, end, vias: [via], anchor, lastChange: undefined },
      ),
    drop: () => set((state) => ({ commitAsked: state.commitAsked + 1 })),
    applied: (change) => set({ ...NO_EDIT, lastChange: change }),
    failed: (failure) => set({ failure }),
    discard: () => set({ ...NO_EDIT }),
    forgetChange: () => set({ lastChange: undefined }),
    addVia: (index, point) =>
      set((state) => {
        const vias = [...state.vias]
        vias.splice(Math.max(0, Math.min(index, vias.length)), 0, point)
        return { vias, roleChoices: {} }
      }),
    removeVia: (index) =>
      set((state) => {
        if (state.vias.length === 0) return {}
        const at = index ?? state.vias.length - 1
        return { vias: state.vias.filter((_, k) => k !== at), roleChoices: {} }
      }),
    stop: () => set(CLEARED),
    click: (point) =>
      set((state) => {
        if (state.relationId === undefined) return {}
        if (state.start === undefined) return { start: point, roleChoices: {}, occurrence: 0 }
        if (state.end === undefined) return { end: point, roleChoices: {}, occurrence: 0 }
        // both are set: the click is a via point, between the two points it lies best between
        const points = [state.start, ...state.vias, state.end]
        const vias = [...state.vias]
        vias.splice(viaIndexFor(points, point), 0, point)
        return { vias, roleChoices: {} }
      }),
    moveVia: (handle, point) =>
      set((state) => {
        if (handle === 'start') return { start: point, roleChoices: {}, occurrence: 0 }
        if (handle === 'end') return { end: point, roleChoices: {}, occurrence: 0 }
        const index = Number(handle.slice('via-'.length))
        if (!Number.isInteger(index) || index < 0 || index >= state.vias.length) return {}
        return { vias: state.vias.map((via, k) => (k === index ? point : via)), roleChoices: {} }
      }),
    clearVias: () => set({ vias: [], roleChoices: {} }),
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

export function useRerouteVias() {
  return useStore(rerouteStore, (state) => state.vias)
}

export function useRerouteAnchor() {
  return useStore(rerouteStore, (state) => state.anchor)
}

/** What was selected when the reroute began */
export function useRerouteSelected() {
  return useStore(rerouteStore, (state) => state.selected)
}

export function useRerouteCommitAsked() {
  return useStore(rerouteStore, (state) => state.commitAsked)
}

export function useRerouteLastChange() {
  return useStore(rerouteStore, (state) => state.lastChange)
}

export function useRerouteFailure() {
  return useStore(rerouteStore, (state) => state.failure)
}

export function useRerouteOccurrence() {
  return useStore(rerouteStore, (state) => state.occurrence)
}

export function useRerouteRoleChoices() {
  return useStore(rerouteStore, (state) => state.roleChoices)
}

/** The state as it is now, for code outside React (the map's handlers and the tests) */
export function readReroute(): RerouteState {
  const { actions: _actions, ...state } = rerouteStore.getState()
  return state
}
