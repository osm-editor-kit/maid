import { create, useStore } from 'zustand'

// The relation that is open beside the inspector (the relation column), or none. Opening it keeps the selection: the
// inspector goes on showing the member, the column lists the relation's members. Kept in memory for the page.

type OpenRelationState = { id: EntityID | null }
type OpenRelationActions = { open: (id: EntityID) => void; close: () => void }
type OpenRelationStore = OpenRelationState & { actions: OpenRelationActions }

const openRelationStore = create<OpenRelationStore>()((set) => ({
  id: null,
  actions: {
    open: (id) => set({ id }),
    close: () => set({ id: null }),
  },
}))

/** The id of the relation open beside the inspector, or null */
export function useOpenRelationId() {
  return useStore(openRelationStore, (state) => state.id)
}

/** Opens and closes the relation column. Called from event handlers, never during render. */
export const openRelationActions = openRelationStore.getState().actions

/** The same id read outside React: an inspector section's `when` asks it */
export function currentOpenRelationId() {
  return openRelationStore.getState().id
}
