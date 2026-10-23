/**
 * The person's own history of changeset comments and sources (changeset-history.ts), in memory and in localStorage
 * (`maid:changeset-history`, versioned). Read once when the store is made; written after a successful upload only.
 * Where storage is blocked or full (or under automation) the list lives for this page visit.
 *
 * The store is private: `useChangesetHistory` and `changesetHistoryActions` are its only way out.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { create } from 'zustand'
import {
  parseHistory,
  remember,
  serializeHistory,
  type ChangesetHistory,
} from './changeset-history.ts'

const KEY = 'maid:changeset-history'
const storage = moduleStorage()

interface HistoryActions {
  /** After a successful upload: adds its comment and the single values of its source, and stores the list */
  remember: (upload: { comment: string; source?: string | undefined }) => void
}

interface HistoryState {
  history: ChangesetHistory
  actions: HistoryActions
}

const useHistoryStore = create<HistoryState>()((set, get) => ({
  history: parseHistory(storage.getItem(KEY)),
  actions: {
    remember: (upload) => {
      const history = remember(get().history, upload)
      storage.setItem(KEY, serializeHistory(history))
      set({ history })
    },
  },
}))

/** The comments and sources this person uploaded with, most recent first */
export function useChangesetHistory(): ChangesetHistory {
  return useHistoryStore((state) => state.history)
}

/** The history's actions outside React and in event handlers. The object never changes. */
export const changesetHistoryActions: HistoryActions = useHistoryStore.getState().actions

/** The history outside React (tests). */
export function currentHistory(): ChangesetHistory {
  return useHistoryStore.getState().history
}
