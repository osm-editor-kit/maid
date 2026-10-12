import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import {
  clampBrightness,
  isAutomatedBrowser,
  parseStored,
  type ImageryStored,
  type View,
} from './helpers.ts'

/** The module's state. The choice is stored; `view` is only what the map is showing now. */
export type ImageryState = ImageryStored & {
  /** Not stored: the viewport, kept by the map layer for the panel */
  view: View | null
  setBackground: (id: string | null) => void
  setOverlay: (id: string, on: boolean) => void
  setBrightness: (value: number) => void
  setView: (view: View) => void
}

export type ImageryStore = ReturnType<typeof createImageryStore>

const NOTHING: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/**
 * localStorage, or nothing in an automated browser or where storage is blocked. A choice then
 * lasts for the page visit only.
 */
function browserStorage(): StateStorage {
  if (isAutomatedBrowser()) return NOTHING
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
      } catch {
        // full or blocked: the choice still holds for this visit
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name)
      } catch {
        // nothing to remove
      }
    },
  }
}

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
        storage: createJSONStorage(() => browserStorage()),
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
