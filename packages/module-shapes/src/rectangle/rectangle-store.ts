// The preview of the rectangle being drawn, as UI state: the wall and the rectangle the mode computed on the last
// pointer event. Private to the module: the map component reads it through the hook, and the mode writes it through
// `rectangleActions()`, from the mode's callbacks only. The stage of the drawing lives in the mode, not here.
import { create } from 'zustand'
import type { Preview } from './state.ts'

type RectangleActions = {
  show: (preview: Preview) => void
  clear: () => void
}

type RectangleState = {
  preview: Preview
  actions: RectangleActions
}

const useRectangleStore = create<RectangleState>()((set) => ({
  preview: {},
  actions: {
    show: (preview) => set({ preview }),
    clear: () => set({ preview: {} }),
  },
}))

/** The actions of the preview. Called from the mode's callbacks, never during render. */
export function rectangleActions(): RectangleActions {
  return useRectangleStore.getState().actions
}

/** The preview now: nothing, the wall, or the wall and the rectangle */
export function useRectanglePreview() {
  return useRectangleStore((state) => state.preview)
}
