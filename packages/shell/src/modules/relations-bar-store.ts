import { create, useStore } from 'zustand'

// The relations the person works on (a prototype, Tobias, 2026-11-13): "Edit" in a relation list opens the relation
// beside the inspector and lays it into the bar over the map (RelationBar.tsx), where a click opens it again. A click on
// the map still ends the selection and closes the column, as it always does; the bar is the way back. Kept in memory for
// the page, as the session's relations are (relations-session-store.ts): a reload starts again.

type RelationBarState = { ids: readonly EntityID[] }
type RelationBarActions = { add: (id: EntityID) => void; remove: (id: EntityID) => void }
type RelationBarStore = RelationBarState & { actions: RelationBarActions }

const relationBarStore = create<RelationBarStore>()((set) => ({
  ids: [],
  actions: {
    // a relation already in the bar keeps its place, so the pills do not jump
    add: (id) => set((state) => (state.ids.includes(id) ? state : { ids: [...state.ids, id] })),
    remove: (id) => set((state) => ({ ids: state.ids.filter((other) => other !== id) })),
  },
}))

/** The relations in the bar, the first added first */
export function useRelationBarIDs() {
  return useStore(relationBarStore, (state) => state.ids)
}

/** Adds and removes relations. Called from event handlers, never during render. */
export const relationBarActions = relationBarStore.getState().actions
