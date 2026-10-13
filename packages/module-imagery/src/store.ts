import { moduleStorage } from '@osm-editor-kit/maid-core'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { clampBrightness, parseStored, type ImageryStored, type View } from './helpers.ts'

/** The module's state. The choice is stored; `view` is only what the map is showing now. */
export type ImageryState = ImageryStored & {
  /** Not stored: the viewport, kept by the map layer for the panel */
  view: View | null
  /** Not stored: the name iD cites for each layer that is drawn, by layer id (see `usedNames`) */
  names: Record<string, string>
  setBackground: (id: string | null) => void
  setOverlay: (id: string, on: boolean) => void
  setBrightness: (value: number) => void
  setView: (view: View) => void
  remember: (names: Record<string, string>) => void
}

export type ImageryStore = ReturnType<typeof createImageryStore>

/**
 * The module's store, one per `imagery()` call so that the default background is its own.
 * Stored as `maid:imagery`, version 1. A stored entry is read with `parseStored`, which fills in
 * defaults for anything missing or of the wrong shape.
 */
export function createImageryStore(defaultBackground: string | null) {
  return create<ImageryState>()(
    persist(
      (set) => ({
        backgroundId: defaultBackground,
        overlayIds: [],
        brightness: 1,
        view: null,
        names: {},
        remember: (names) => set((state) => ({ names: { ...state.names, ...names } })),
        setBackground: (backgroundId) => set({ backgroundId }),
        setOverlay: (id, on) =>
          set((state) => ({
            overlayIds: on
              ? [...state.overlayIds.filter((other) => other !== id), id]
              : state.overlayIds.filter((other) => other !== id),
          })),
        setBrightness: (value) => set({ brightness: clampBrightness(value) }),
        setView: (view) => set({ view }),
      }),
      {
        name: 'maid:imagery',
        version: 1,
        storage: createJSONStorage(() => moduleStorage()),
        partialize: ({ backgroundId, overlayIds, brightness }) => ({
          backgroundId,
          overlayIds,
          brightness,
        }),
        merge: (persisted, current) => ({
          ...current,
          ...parseStored(persisted, { backgroundId: defaultBackground }),
        }),
      },
    ),
  )
}
