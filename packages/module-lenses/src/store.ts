import { moduleStorage } from '@osm-editor-kit/maid-core'
/**
 * The lenses the person has chosen and imported, kept in localStorage under `maid:lenses`. The
 * built-in lenses are not stored: the module sets them when it starts.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { BUILT_IN_LENSES } from './builtin.ts'

export type LensState = {
  /** The id of the lens on the map, or null for the default look */
  activeId: string | null
  /** Lenses the person imported, in the order they were imported */
  imported: Lens[]
  /** Built-in lenses and the ones the app gave the module. Not stored. */
  builtIn: Lens[]
  setActive: (id: string | null) => void
  /** Adds lenses; a lens with the id of an imported one replaces it */
  importLenses: (lenses: Lens[]) => void
  removeLens: (id: string) => void
  setBuiltIn: (lenses: Lens[]) => void
}

export const useLensStore = create<LensState>()(
  persist(
    (set) => ({
      activeId: null,
      imported: [],
      builtIn: BUILT_IN_LENSES,
      setActive: (activeId) => set({ activeId }),
      importLenses: (lenses) =>
        set((state) => {
          const ids = new Set(lenses.map((lens) => lens.id))
          return { imported: [...state.imported.filter((lens) => !ids.has(lens.id)), ...lenses] }
        }),
      removeLens: (id) =>
        set((state) => ({
          imported: state.imported.filter((lens) => lens.id !== id),
          activeId: state.activeId === id ? null : state.activeId,
        })),
      setBuiltIn: (builtIn) => set({ builtIn }),
    }),
    {
      name: 'maid:lenses',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ activeId, imported }) => ({ activeId, imported }),
    },
  ),
)

/** Every lens the person can choose from: built-in first, then imported */
export function allLenses(state: Pick<LensState, 'builtIn' | 'imported'>) {
  return [...state.builtIn, ...state.imported]
}

/** The lens on the map: the active one if it still exists, else null */
export function activeLens(state: Pick<LensState, 'activeId' | 'builtIn' | 'imported'>) {
  if (state.activeId === null) return null
  return allLenses(state).find((lens) => lens.id === state.activeId) ?? null
}

/** The part of the map engine that connectLenses needs */
export type LensTarget = { setLens: (lens: Lens | null) => void }

/**
 * Puts the active lens on the map and keeps it there: the app calls this once with its engine
 * (`connectLenses(engine)`). Returns a function that stops the connection.
 */
export function connectLenses(engine: LensTarget) {
  let current: Lens | null | undefined
  const apply = () => {
    const lens = activeLens(useLensStore.getState())
    // the same lens object is passed on, so the engine does nothing when nothing changed
    if (lens === current) return
    current = lens
    engine.setLens(lens)
  }
  apply()
  return useLensStore.subscribe(apply)
}
