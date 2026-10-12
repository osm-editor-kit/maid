import { isAutomated } from './automated.ts'

/**
 * What the stores need from a storage. The same shape as zustand's `StateStorage`, written out
 * here so that core does not depend on zustand.
 */
export type ModuleStorage = {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
}

const NOTHING: ModuleStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/**
 * Where the modules keep their settings: localStorage under the key the store names (the keys
 * are not changed here). Under automation it keeps nothing, so a run starts as if nothing was
 * stored and writes nothing. Where storage is blocked or full, a choice holds for this page visit
 * only. Read once when a store is created.
 */
export function moduleStorage(): ModuleStorage {
  if (isAutomated()) return NOTHING
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
