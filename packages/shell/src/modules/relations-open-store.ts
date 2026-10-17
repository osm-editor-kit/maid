import { create, useStore } from 'zustand'

// The relation that is open beside the inspector (the relation column), or none. Opening it keeps the selection: the
// inspector goes on showing the member, the column lists the relation's members. `from` is the relation it was entered
// from (a sub-route opened in its superroute's list), so the column's path goes back the way the person came.

type OpenRelationState = { id: EntityID | null; from: EntityID | null }
type OpenRelationActions = { open: (id: EntityID, from?: EntityID) => void; close: () => void }
type OpenRelationStore = OpenRelationState & { actions: OpenRelationActions }

const openRelationStore = create<OpenRelationStore>()((set) => ({
  id: null,
  from: null,
  actions: {
    open: (id, from) => set({ id, from: from ?? null }),
    close: () => set({ id: null, from: null }),
  },
}))

/** The id of the relation open beside the inspector, or null */
export function useOpenRelationId() {
  return useStore(openRelationStore, (state) => state.id)
}

/** The relation the open one was entered from, or null (see above) */
export function useOpenRelationFrom() {
  return useStore(openRelationStore, (state) => state.from)
}

/** Opens and closes the relation column. Called from event handlers, never during render. */
export const openRelationActions = openRelationStore.getState().actions

/** The same id read outside React: an inspector section's `when` asks it */
export function currentOpenRelationId() {
  return openRelationStore.getState().id
}
