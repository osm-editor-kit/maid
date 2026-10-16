import { create, useStore } from 'zustand'

// The "Also add" offers after a paste (iD issue 9359). Each paste remembers which feature every copy came from; the
// relations section of a copy then offers the relations its original is in. Kept in memory for the page, as the
// session list is: a reload starts again. An offer leaves the list when it is added or dismissed (settled).

/** A copy's origin: the feature it was copied from, and the features copied in the same paste (the set is that paste's) */
export type PasteOrigin = { original: EntityID; copied: ReadonlySet<EntityID> }

type PasteOffersState = {
  /** Each copy of the pastes so far, with where it was copied from */
  origins: ReadonlyMap<EntityID, PasteOrigin>
  /** Per copy: the relations whose offer was added or dismissed; they are not offered again */
  settled: ReadonlyMap<EntityID, readonly EntityID[]>
}
type PasteOffersActions = {
  remember: (origins: ReadonlyMap<EntityID, EntityID>) => void
  settle: (copy: EntityID, relation: EntityID) => void
}
type PasteOffersStore = PasteOffersState & { actions: PasteOffersActions }

const pasteOffersStore = create<PasteOffersStore>()((set) => ({
  origins: new Map(),
  settled: new Map(),
  actions: {
    remember: (origins) =>
      set((state) => {
        if (origins.size === 0) return state
        // the originals of this paste only: a relation copied in an earlier paste does not count for this one
        const copied: ReadonlySet<EntityID> = new Set(origins.values())
        const next = new Map(state.origins)
        for (const [copy, original] of origins) next.set(copy, { original, copied })
        return { origins: next }
      }),
    settle: (copy, relation) =>
      set((state) => {
        const done = state.settled.get(copy) ?? []
        if (done.includes(relation)) return state
        return { settled: new Map(state.settled).set(copy, [...done, relation]) }
      }),
  },
}))

/** The origins of the copies, one hook per part of the state so that a change of the other part does not render */
export function usePasteOrigins(): ReadonlyMap<EntityID, PasteOrigin> {
  return useStore(pasteOffersStore, (state) => state.origins)
}

/** The settled offers, per copy */
export function usePasteSettled(): ReadonlyMap<EntityID, readonly EntityID[]> {
  return useStore(pasteOffersStore, (state) => state.settled)
}

/** Records the copies of a paste. Called from an event handler, never during render. */
export const pasteOfferActions = pasteOffersStore.getState().actions
