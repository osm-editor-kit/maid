/**
 * The warnings the person ignores ("Ignore this issue"), by issue id, kept in localStorage under `maid:validation-ignored`.
 * As iD's ignoredIssueIDs they survive a reload, while the edits do: `clearIgnoredIssues` forgets them after an upload
 * and when the stored edits are discarded, since the ids belong to those edits.
 *
 * A zustand store with persist, like the other stores (packages/ui/src/settings.ts). The stored value keeps its
 * shape from before the store: `{ ids }`, not zustand's `{ state, version }` envelope (see `keyValueStorage`). The
 * stored value is checked with zod on every load, and a value that does not fit is not used.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

const KEY = 'maid:validation-ignored'

/** What is stored. Read back with every load: a stored value that does not fit is not used. */
const storedIgnored = z.object({ ids: z.array(z.string()) })

/** The ids stored under the key, or none when there is nothing that fits */
export function restoreIgnored(persisted: unknown): string[] {
  const stored = storedIgnored.safeParse(persisted)
  return stored.success ? stored.data.ids : []
}

/**
 * The string storage under the key. persist hands over `{ state, version }` as JSON; only `state` (`{ ids }`) is
 * written, so the stored value is what it has always been. On reading, the stored `{ ids }` is wrapped in that
 * envelope again (version 0, the default). A value that is not JSON is not read.
 */
function keyValueStorage(): StateStorage {
  const storage = moduleStorage()
  return {
    getItem: (name) => {
      const raw = storage.getItem(name)
      if (raw === null) return null
      try {
        return JSON.stringify({ state: JSON.parse(raw), version: 0 })
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      const { state } = JSON.parse(value) as { state: unknown }
      storage.setItem(name, JSON.stringify(state))
    },
    removeItem: (name) => storage.removeItem(name),
  }
}

/** The ids of the ignored warnings, in the order they were ignored. Private: see `ignoredIssues`. */
const useIgnoredStore = create<{ ids: string[] }>()(
  persist(() => ({ ids: [] as string[] }), {
    name: KEY,
    storage: createJSONStorage(keyValueStorage),
    partialize: ({ ids }) => ({ ids }),
    // runs on every load: a stored value that does not fit gives no ids
    merge: (persisted, current) => ({ ...current, ids: restoreIgnored(persisted) }),
  }),
)

/** The same set for as long as the list does not change: the validator reads it at each run */
const setOf = new WeakMap<readonly string[], ReadonlySet<string>>()

/** The ignored warnings: the actions, and the subscription the announcements use */
export const ignoredIssues = {
  /** The ids of the ignored warnings, in the order they were ignored */
  getIds: (): readonly string[] => useIgnoredStore.getState().ids,
  /** Ignores the warning with this id. Errors are not ignored: the validator leaves them out. */
  ignore: (id: string) => {
    const { ids } = useIgnoredStore.getState()
    if (!ids.includes(id)) useIgnoredStore.setState({ ids: [...ids, id] })
  },
  /** Shows the ignored warnings again */
  showAgain: () => {
    if (useIgnoredStore.getState().ids.length > 0) useIgnoredStore.setState({ ids: [] })
  },
  /** Called when the ignored warnings change */
  subscribe: (listener: () => void) => useIgnoredStore.subscribe(listener),
}

/** Forgets the ignored warnings: called after a successful upload and when the stored edits are discarded */
export function clearIgnoredIssues() {
  ignoredIssues.showAgain()
}

/** The ignored ids as a set, for the validator (`ValidatorOptions.ignored`) */
export function ignoredIssueIds(): ReadonlySet<string> {
  const ids = useIgnoredStore.getState().ids
  const known = setOf.get(ids)
  if (known) return known
  const set = new Set<string>(ids)
  setOf.set(ids, set)
  return set
}
