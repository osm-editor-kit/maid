/**
 * The table's UI state: how many ways each side shows, the junction choices, the rows that differ only, the folded
 * groups, the batch that waits for a confirmation, and the carry settings (docs/research/way-table.md, 4.3, 4.7, 4.11,
 * 4.12). No data here: the table reads the graph. One store per module (the module makes it in its setup).
 *
 * The store is private: components read it with the named hooks below and act through `actions`.
 */
import { createStore, useStore } from 'zustand'
import type { CarryDirection, CarryMode } from './carry.ts'
import type { GroupId } from './rows.ts'

/** Ways added by "Show 3 more" */
export const SHOW_MORE_STEP = 3

/** The most ways per side the table shows (the design's limit) */
export const MAX_PER_SIDE_LIMIT = 9

/** The batch that waits for a confirmation: a carry from a row, or set on all from a row */
export type Pending = {
  readonly kind: 'carry' | 'set-all'
  readonly referenceId: string
  readonly key: string
}

export type CarrySettings = {
  readonly direction: CarryDirection
  readonly count: number
  readonly mode: CarryMode
}

/** Junction node id to the way id chosen to continue through it */
export type Choices = Readonly<Record<string, string>>

export type WayTableActions = {
  /** Shows more ways on both sides of a reference, up to `MAX_PER_SIDE_LIMIT` */
  readonly showMore: (referenceId: string) => void
  readonly choose: (referenceId: string, nodeId: string, wayId: string) => void
  readonly forgetChoices: (referenceId: string) => void
  readonly toggleOnlyDiffering: () => void
  readonly toggleGroup: (group: GroupId) => void
  readonly startPending: (pending: Pending) => void
  readonly endPending: () => void
  readonly setCarry: (patch: Partial<CarrySettings>) => void
}

export type WayTableState = {
  /** Ways per side before "Show more" (the module's option, 3 at first) */
  readonly defaultLimit: number
  /** Ways per side shown for a reference, when the person asked for more */
  readonly limits: Readonly<Record<string, number>>
  readonly choices: Readonly<Record<string, Choices>>
  readonly onlyDiffering: boolean
  /** True for a group the person folded */
  readonly folded: Readonly<Partial<Record<GroupId, boolean>>>
  readonly pending: Pending | null
  readonly carry: CarrySettings
  readonly actions: WayTableActions
}

export const DEFAULT_CARRY: CarrySettings = { direction: 'forward', count: 1, mode: 'fill-empty' }

export function createWayTableStore(defaultLimit: number) {
  return createStore<WayTableState>()((set, get) => ({
    defaultLimit,
    limits: {},
    choices: {},
    onlyDiffering: false,
    folded: {},
    pending: null,
    carry: DEFAULT_CARRY,
    actions: {
      showMore: (referenceId) => {
        const { limits, defaultLimit: fallback } = get()
        const current = limits[referenceId] ?? fallback
        const next = Math.min(MAX_PER_SIDE_LIMIT, current + SHOW_MORE_STEP)
        set({ limits: { ...limits, [referenceId]: next } })
      },
      choose: (referenceId, nodeId, wayId) => {
        const { choices } = get()
        const own = { ...choices[referenceId], [nodeId]: wayId }
        set({ choices: { ...choices, [referenceId]: own } })
      },
      forgetChoices: (referenceId) => {
        const { choices } = get()
        const rest = { ...choices }
        delete rest[referenceId]
        set({ choices: rest })
      },
      toggleOnlyDiffering: () => set({ onlyDiffering: !get().onlyDiffering }),
      toggleGroup: (group) => {
        const { folded } = get()
        set({ folded: { ...folded, [group]: !folded[group] } })
      },
      startPending: (pending) => set({ pending }),
      endPending: () => set({ pending: null }),
      setCarry: (patch) => set({ carry: { ...get().carry, ...patch } }),
    },
  }))
}

export type WayTableStore = ReturnType<typeof createWayTableStore>

/** Ways per side the table shows for a reference */
export function useWayTableLimit(store: WayTableStore, referenceId: string): number {
  return useStore(store, (state) => state.limits[referenceId] ?? state.defaultLimit)
}

export function useWayTableChoices(store: WayTableStore, referenceId: string): Choices {
  return useStore(store, (state) => state.choices[referenceId] ?? EMPTY_CHOICES)
}

export function useWayTableOnlyDiffering(store: WayTableStore): boolean {
  return useStore(store, (state) => state.onlyDiffering)
}

export function useWayTableFolded(store: WayTableStore): WayTableState['folded'] {
  return useStore(store, (state) => state.folded)
}

export function useWayTablePending(store: WayTableStore): Pending | null {
  return useStore(store, (state) => state.pending)
}

export function useWayTableCarry(store: WayTableStore): CarrySettings {
  return useStore(store, (state) => state.carry)
}

export function useWayTableActions(store: WayTableStore): WayTableActions {
  return useStore(store, (state) => state.actions)
}

const EMPTY_CHOICES: Choices = {}
