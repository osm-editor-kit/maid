// The preview of the room being drawn, as UI state: what the mode computed on the last pointer event. Private to the
// module: the map component reads it through the hook, and the mode writes it through `roomActions()`, from the mode's
// callbacks only. The points of the room live in the mode, not here.
import { create } from 'zustand'
import type { Loc } from '../shared/metres.ts'

export type RoomPreview = {
  /** The place on the wall under the pointer, before the first click and when the next click ends the room there */
  wallPoint?: Loc
  /** The room's line so far: the fixed points and the point under the pointer */
  line?: readonly Loc[]
  /** Dashed guides: from the pointer on to the wall it would meet, and the guided end of the room */
  guides?: readonly (readonly Loc[])[]
  /** The outline of the room the next step makes, closed */
  room?: readonly Loc[]
  /** A label at a place: the length of the segment being drawn, or why the room is refused */
  labels?: readonly { at: Loc; text: string; refused?: boolean }[]
}

type RoomActions = {
  show: (preview: RoomPreview) => void
  clear: () => void
}

type RoomState = {
  preview: RoomPreview
  actions: RoomActions
}

const useRoomStore = create<RoomState>()((set) => ({
  preview: {},
  actions: {
    show: (preview) => set({ preview }),
    clear: () => set({ preview: {} }),
  },
}))

/** The actions of the preview. Called from the mode's callbacks, never during render. */
export function roomActions(): RoomActions {
  return useRoomStore.getState().actions
}

/** The preview now, read outside React (the browser check reads it through the module's state) */
export function roomSnapshot(): RoomPreview {
  return useRoomStore.getState().preview
}

/** The preview now */
export function useRoomPreview() {
  return useRoomStore((state) => state.preview)
}
