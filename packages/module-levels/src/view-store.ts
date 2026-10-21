/**
 * Whether the level view is in 3D: the rooms of each level extruded in the map (LevelExtrusion.tsx), turned on and
 * off in the level picker. Per visit, not stored: the map is flat when the editor starts.
 */
import { create } from 'zustand'

type ViewState = {
  threeD: boolean
  actions: { setThreeD: (on: boolean) => void }
}

const useViewStore = create<ViewState>()((set) => ({
  threeD: false,
  actions: { setThreeD: (threeD) => set({ threeD }) },
}))

export const useThreeD = () => useViewStore((state) => state.threeD)
export const levelViewActions = useViewStore.getState().actions
