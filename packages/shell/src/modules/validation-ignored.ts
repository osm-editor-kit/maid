/**
 * The warnings the person ignores ("Ignore this issue"), by issue id, kept in localStorage under `maid:validation-ignored`.
 * As iD's ignoredIssueIDs they survive a reload, while the edits do: `clearIgnoredIssues` forgets them after an upload
 * and when the stored edits are discarded, since the ids belong to those edits.
 *
 * A small store of its own, not zustand: the shell does not declare zustand (packages/module-lenses does). It has the
 * shape of the other persisted stores: the stored value is checked with zod on every load, and a value that does not
 * fit is not used.
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'

const KEY = 'maid:validation-ignored'

/** What is stored. Read back with every load: a stored value that does not fit is not used. */
const storedIgnored = z.object({ ids: z.array(z.string()) })

/** The ids stored under the key, or none when there is nothing that fits */
export function restoreIgnored(persisted: unknown): string[] {
  const stored = storedIgnored.safeParse(persisted)
  return stored.success ? stored.data.ids : []
}

function load(): string[] {
  try {
    const raw = moduleStorage().getItem(KEY)
    return raw === null ? [] : restoreIgnored(JSON.parse(raw))
  } catch {
    return []
  }
}

/** The state: a holder, so that the module has no `let` that is reassigned */
const state = { ids: load() as readonly string[] }
const listeners = new Set<() => void>()
/** The same set for as long as the list does not change: the validator reads it at each run */
const setOf = new WeakMap<readonly string[], ReadonlySet<string>>()

function save() {
  try {
    moduleStorage().setItem(KEY, JSON.stringify({ ids: state.ids }))
  } catch {
    // the ignored issues still hold for this visit
  }
}

function set(ids: readonly string[]) {
  state.ids = ids
  save()
  for (const listener of listeners) listener()
}

/** The ignored warnings, as a store that React can subscribe to */
export const ignoredIssues = {
  /** The ids of the ignored warnings, in the order they were ignored */
  getIds: () => state.ids,
  /** Ignores the warning with this id. Errors are not ignored: the validator leaves them out. */
  ignore: (id: string) => {
    if (!state.ids.includes(id)) set([...state.ids, id])
  },
  /** Shows the ignored warnings again */
  showAgain: () => {
    if (state.ids.length > 0) set([])
  },
  /** Called when the ignored warnings change */
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** Forgets the ignored warnings: called after a successful upload and when the stored edits are discarded */
export function clearIgnoredIssues() {
  ignoredIssues.showAgain()
}

/** The ignored ids as a set, for the validator (`ValidatorOptions.ignored`) */
export function ignoredIssueIds(): ReadonlySet<string> {
  const ids = state.ids
  const known = setOf.get(ids)
  if (known) return known
  const set = new Set<string>(ids)
  setOf.set(ids, set)
  return set
}
