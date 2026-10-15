/**
 * The lenses the person has chosen and imported, kept in localStorage under `maid:lenses`. The built-in lenses are
 * not stored: the module sets them when it starts.
 *
 * One live state (sync.ts): the URL (`lens`) is the live value. `shownId` is the lens on the map, fed from the URL by
 * the sync: the one place the map, the panel and the parking module read it. `activeId` is the choice the person made
 * last, stored as the default for the next visit; the sync remembers a choice when it writes it to the URL. A link never
 * changes `activeId`.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import type { Lens } from '@osm-editor-kit/maid-style'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { BUILT_IN_LENSES } from './builtin.ts'
import { lensSchema } from './lens-file.ts'
import { NO_LENS } from './url.ts'

/** What is stored. Read back with every load: a stored value that does not fit is not used. */
const storedLenses = z.object({
  activeId: z.string().nullable(),
  imported: z.array(lensSchema),
})

/** The state from storage, over the current (default) state. A value that does not parse is ignored. */
export function restoreLenses<State extends Pick<LensState, 'activeId' | 'imported'>>(
  persisted: unknown,
  current: State,
): State {
  const stored = storedLenses.safeParse(persisted)
  return stored.success ? { ...current, ...stored.data } : current
}

/** A choice the person made that the URL sync has not written yet. A new object for each choice. */
export type LensRequest = { id: string | null }

/** What the lenses module keeps: the choice, the lens shown, the imported lenses, and the built-in ones */
export type LensState = {
  /** The lens the person chose last (stored), or null for none. The default when the URL says nothing. */
  activeId: string | null
  /** The lens on the map, or null for none. The URL decides (sync.ts), which writes it here. Not stored. */
  shownId: string | null
  /** A choice made outside the URL sync, until the sync writes it to the URL and remembers it. Not stored. */
  request: LensRequest | null
  /** Lenses the person imported, in the order they were imported */
  imported: Lens[]
  /** Built-in lenses and the ones the app gave the module. Not stored. */
  builtIn: Lens[]
}

/** The events the lenses module takes. The object never changes. */
export type LensActions = {
  /** The person chose a lens, or none (null): the URL follows and the choice is remembered (sync.ts) */
  setActive: (id: string | null) => void
  /** Shows the lens the URL says, `null` for none (sync.ts). Storage is not written. */
  setShown: (id: string | null) => void
  /** Remembers the person's choice for the next visit, `NO_LENS` for none (sync.ts). */
  remember: (id: string) => void
  /** The sync has written `request` to the URL: it is cleared, unless a newer choice came in meanwhile */
  answer: (request: LensRequest) => void
  /** Adds lenses; a lens with the id of an imported one replaces it */
  importLenses: (lenses: Lens[]) => void
  removeLens: (id: string) => void
  setBuiltIn: (lenses: Lens[]) => void
}

type LensStore = LensState & { actions: LensActions }

/** The store stays here: components read the state through the hooks below, code outside React through `lensChoice` */
const useLensStore = create<LensStore>()(
  persist(
    (set) => ({
      activeId: null,
      shownId: null,
      request: null,
      imported: [],
      builtIn: BUILT_IN_LENSES,
      actions: {
        setActive: (id) => set({ request: { id } }),
        setShown: (shownId) => set({ shownId }),
        remember: (id) => set({ activeId: id === NO_LENS ? null : id }),
        answer: (request) => set((state) => (state.request === request ? { request: null } : {})),
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
      },
    }),
    {
      name: 'maid:lenses',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ activeId, imported }) => ({ activeId, imported }),
      // every stored value is checked on load, not only after a version change
      merge: (persisted, current) => restoreLenses(persisted, current),
    },
  ),
)

/** The id of the lens on the map, or null for the default look */
export function useActiveLensId(): string | null {
  return useLensStore((state) => state.shownId)
}

/** The lens the person chose last (stored), or null for none */
export function useChosenLensId(): string | null {
  return useLensStore((state) => state.activeId)
}

/** A choice made outside the URL sync that the sync has not written yet, or null */
export function useLensRequest(): LensRequest | null {
  return useLensStore((state) => state.request)
}

/** The built-in lenses and the ones the app gave the module */
export function useBuiltInLenses(): Lens[] {
  return useLensStore((state) => state.builtIn)
}

/** The lenses the person imported */
export function useImportedLenses(): Lens[] {
  return useLensStore((state) => state.imported)
}

/** The lens on the map, or null. The same object for as long as the lens does not change. */
export function useActiveLens(): Lens | null {
  return useLensStore((state) => activeLens(state))
}

/** The actions. They never change, so a component that takes them re-renders only for its own state. */
export function useLensActions(): LensActions {
  return useLensStore((state) => state.actions)
}

/** The actions for code outside React (the URL sync, the lenses module at start) */
export const lensActions: LensActions = useLensStore.getState().actions

/**
 * The active lens for code outside React. The parking module reads it, follows it and sets it; the bench sets it.
 * A choice made here is remembered like one in the panel, once the URL sync has written it.
 */
export const lensChoice = {
  getActiveId: (): string | null => useLensStore.getState().shownId,
  setActive: (id: string | null) => useLensStore.getState().actions.setActive(id),
  /** Calls the listener after any change of the lenses. Returns a function that stops it. */
  subscribe: (listener: () => void): (() => void) => useLensStore.subscribe(listener),
}

/** The lens the person chose last (the stored default), for code outside React and for tests */
export function chosenLensId(): string | null {
  return useLensStore.getState().activeId
}

/** The choice asked for and not yet written to the URL, for code outside React and for tests */
export function pendingLensChoice(): LensRequest | null {
  return useLensStore.getState().request
}

/** Every lens the person can choose from: built-in first, then imported */
export function allLenses(state: Pick<LensState, 'builtIn' | 'imported'>) {
  return [...state.builtIn, ...state.imported]
}

/** The lens on the map: the shown one if it still exists, else null */
export function activeLens(state: Pick<LensState, 'shownId' | 'builtIn' | 'imported'>) {
  if (state.shownId === null) return null
  return allLenses(state).find((lens) => lens.id === state.shownId) ?? null
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
