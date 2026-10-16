import { create } from 'zustand'

interface NewFeatureActions {
  /** Call before selecting a feature that was just made */
  mark: (id: string) => void
  /** A selection that is not exactly the new feature ends its "new" state */
  keepOnly: (next: readonly string[]) => void
}

/**
 * The feature that was just added by drawing or by placing a point, until something else is selected. The inspector
 * opens the type picker for it when it has no type yet, as iD's inspector does for its `newFeature`; selecting the
 * same feature again later shows its fields. The store is private: the hook and the functions below are its only way out.
 */
interface NewFeatureState {
  id: string | null
  actions: NewFeatureActions
}

const useNewFeatureStore = create<NewFeatureState>()((set, get) => ({
  id: null,
  actions: {
    mark: (id) => set({ id }),
    keepOnly: (next) => {
      const { id } = get()
      if (id !== null && !(next.length === 1 && next[0] === id)) set({ id: null })
    },
  },
}))

export function useNewFeatureId() {
  return useNewFeatureStore((state) => state.id)
}

/** Call before selecting a feature that was just made */
export function markNewFeature(id: string) {
  useNewFeatureStore.getState().actions.mark(id)
}

/** A selection that is not exactly the new feature ends its "new" state */
export function keepNewFeatureOnly(next: readonly string[]) {
  useNewFeatureStore.getState().actions.keepOnly(next)
}
