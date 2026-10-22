/**
 * The map engine for the parts of the module outside the map (the inspector's level section): the map content parts
 * get it as a prop and put it here when they mount (module.tsx withEngine).
 */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { create } from 'zustand'

const useEngineStore = create<{ engine: MaidEngine | null }>()(() => ({ engine: null }))

/** The engine, or null before the map is there (or in an app that gives the map content none) */
export const useLevelEngine = () => useEngineStore((state) => state.engine)
/** The engine outside React, for a section's `when` */
export const currentLevelEngine = () => useEngineStore.getState().engine
export const levelEngineActions = {
  set: (engine: MaidEngine | null) => useEngineStore.setState({ engine }),
}
