/**
 * The warnings the person ignores ("Ignore this issue"), by issue id, kept in localStorage under `maid:validation-ignored`.
 * As iD's ignoredIssueIDs they survive a reload, while the edits do: `clearIgnoredIssues` forgets them after an upload
 * and when the stored edits are discarded, since the ids belong to those edits.
 *
 * A zustand store with persist, like the other stores (packages/ui/src/settings.ts). The stored value keeps the shape it
 * has always had, `{ ids }`, with a `version` beside it (`VERSION`): a value stored before the version was written is
 * read as it always was (`migrate`), see `keyValueStorage`. The stored value is checked with zod on every load, and a
 * value that does not fit is not used.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

const KEY = 'maid:validation-ignored'

/** The version of what is stored. A value without one (version 0) is what was stored before it had one. */
const VERSION = 1

/** What is stored. Read back with every load: a stored value that does not fit is not used. */
const storedIgnored = z.object({ ids: z.array(z.string()) })

/** The ids stored under the key, or none when there is nothing that fits */
export function restoreIgnored(persisted: unknown): string[] {
  const stored = storedIgnored.safeParse(persisted)
  return stored.success ? stored.data.ids : []
}

/**
 * The string storage under the key. persist hands over `{ state, version }` as JSON; only `state` (`{ ids }`) is
 * written, with its `version` beside it. On reading, the stored `{ ids }` is given its version (0 when it has none)
 * and wrapped in that envelope. A value that is not JSON is not read.
 */
function keyValueStorage(): StateStorage {
  const storage = moduleStorage()
  return {
    getItem: (name) => {
      const raw = storage.getItem(name)
      if (raw === null) return null
      try {
        const { version, ...state } = JSON.parse(raw) as Record<string, unknown>
        return JSON.stringify({ state, version: typeof version === 'number' ? version : 0 })
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      const { state, version } = JSON.parse(value) as { state: object; version: number }
      storage.setItem(name, JSON.stringify({ ...state, version }))
    },
    removeItem: (name) => storage.removeItem(name),
  }
}

interface IgnoredActions {
  /** Ignores the warning with this id. Errors are not ignored: the validator leaves them out. */
  ignore: (id: string) => void
  /** Shows the ignored warnings again */
  showAgain: () => void
}

/** The ids of the ignored warnings, in the order they were ignored. Private: the functions below are its only way out. */
const useIgnoredStore = create<{ ids: string[]; actions: IgnoredActions }>()(
  persist(
    (set, get) => ({
      ids: [] as string[],
      actions: {
        ignore: (id) => {
          const { ids } = get()
          if (!ids.includes(id)) set({ ids: [...ids, id] })
        },
        showAgain: () => {
          if (get().ids.length > 0) set({ ids: [] })
        },
      },
    }),
    {
      name: KEY,
      version: VERSION,
      storage: createJSONStorage(keyValueStorage),
      partialize: ({ ids }) => ({ ids }),
      // a value stored before the version was written (version 0) is read as it always was
      migrate: (persisted) => ({ ids: restoreIgnored(persisted) }),
      // runs on every load: a stored value that does not fit gives no ids
      merge: (persisted, current) => ({ ...current, ids: restoreIgnored(persisted) }),
    },
  ),
)

/** The same set for as long as the list does not change: the validator reads it at each run */
const setOf = new WeakMap<readonly string[], ReadonlySet<string>>()

/** The ids of the ignored warnings, in the order they were ignored */
export function getIgnoredIds(): readonly string[] {
  return useIgnoredStore.getState().ids
}

/** Ignores the warning with this id. Errors are not ignored: the validator leaves them out. */
export function ignoreIssue(id: string) {
  useIgnoredStore.getState().actions.ignore(id)
}

/** Shows the ignored warnings again */
export function showAgainIssues() {
  useIgnoredStore.getState().actions.showAgain()
}

/** Called when the ignored warnings change: the subscription the announcements use */
export function subscribeIgnored(listener: () => void): () => void {
  return useIgnoredStore.subscribe(listener)
}

/** Forgets the ignored warnings: called after a successful upload and when the stored edits are discarded */
export function clearIgnoredIssues() {
  showAgainIssues()
}

/** The ignored ids as a set, for the validator (`ValidatorOptions.ignored`) */
export function ignoredIssueIds(): ReadonlySet<string> {
  const ids = getIgnoredIds()
  const known = setOf.get(ids)
  if (known) return known
  const set = new Set<string>(ids)
  setOf.set(ids, set)
  return set
}
