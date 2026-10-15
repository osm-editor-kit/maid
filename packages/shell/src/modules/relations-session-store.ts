import { create, useStore } from 'zustand'
import { addSessionIDs } from './relations-logic.ts'

// The relations that got a member in this session (added through the picker or made as a new relation), in the order
// they were first touched. Kept in memory for the page, as iD keeps its list for the edit session: a reload starts
// again. A relation stays in the list after it is gone; the picker lists only the relations the graph holds.

type RelationSessionState = { ids: readonly EntityID[] }
type RelationSessionActions = { touch: (ids: readonly EntityID[]) => void }
type RelationSessionStore = RelationSessionState & { actions: RelationSessionActions }

const relationSessionStore = create<RelationSessionStore>()((set) => ({
  ids: [],
  actions: {
    touch: (ids) => set((state) => ({ ids: addSessionIDs(state.ids, ids) })),
  },
}))

/** The relations that got a member in this session, the first touched first */
export function useSessionRelationIDs() {
  return useStore(relationSessionStore, (state) => state.ids)
}

/** Records that these relations got a member. Called from an event handler, never during render. */
export const relationSessionActions = relationSessionStore.getState().actions

/** The same list read outside React (an edit-menu operation asks it when it runs), the first touched first */
export function currentSessionRelationIDs(): readonly EntityID[] {
  return relationSessionStore.getState().ids
}
