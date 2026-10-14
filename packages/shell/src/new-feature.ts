import { create } from 'zustand'

/**
 * The feature that was just added by drawing or by placing a point, until something else is selected. The inspector
 * opens the type picker for it when it has no type yet, as iD's inspector does for its `newFeature`; selecting the
 * same feature again later shows its fields.
 */
const useNewFeatureStore = create<{ id: string | null }>()(() => ({ id: null }))

export function useNewFeatureId() {
  return useNewFeatureStore((state) => state.id)
}

/** Call before selecting a feature that was just made */
export function markNewFeature(id: string) {
  useNewFeatureStore.setState({ id })
}

/** A selection that is not exactly the new feature ends its "new" state */
export function keepNewFeatureOnly(next: readonly string[]) {
  const { id } = useNewFeatureStore.getState()
  if (id !== null && !(next.length === 1 && next[0] === id))
    useNewFeatureStore.setState({ id: null })
}
