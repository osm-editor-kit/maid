import { isAutomated, moduleStorage } from '@osm-editor-kit/maid-core'
import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** iD's MAX_RECENTS_TO_STORE: how many recently used presets are kept (the picker shows fewer, browseOf) */
export const RECENTS_TO_STORE = 30

/**
 * The ids with `id` first, the others in their order, at most `RECENTS_TO_STORE`: a preset that is used again
 * moves to the front, and the least recent one goes when the list is full (iD's setMostRecent). Pure.
 */
export function withRecent(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((other) => other !== id)].slice(0, RECENTS_TO_STORE)
}

/**
 * The stored ids: non-empty strings, each once, at most `RECENTS_TO_STORE`. An item that is not a string is left
 * out and the others are kept. A value that is not a list gives none.
 */
const storedIds = z
  .array(z.unknown())
  .transform((items) => {
    const ids: string[] = []
    for (const item of items) {
      if (typeof item === 'string' && item !== '' && !ids.includes(item)) ids.push(item)
    }
    return ids.slice(0, RECENTS_TO_STORE)
  })
  .catch(() => [])

/** The stored value: `{ ids }`. A value that is not an object gives no ids. */
const storedSchema = z.object({ ids: storedIds }).catch(() => ({ ids: [] as string[] }))

export type RecentsState = {
  /** The ids of the presets the person chose, most recent first */
  ids: string[]
  /** Makes the preset the most recent one. Under automation nothing is recorded (see below). */
  remember: (id: string) => void
}

/**
 * The presets the person chose in the type picker, most recent first, kept in localStorage (`maid:recents`).
 * Under automation the list does not change, so that an automated run lists the defaults only, as a fresh
 * visit does: the checks then pick the same rows every time. Nothing is read or written under automation
 * either (`moduleStorage`).
 */
export const useRecents = create<RecentsState>()(
  persist(
    (set) => ({
      ids: [],
      remember: (id) => {
        if (isAutomated()) return
        set((state) => ({ ids: withRecent(state.ids, id) }))
      },
    }),
    {
      name: 'maid:recents',
      version: 1,
      storage: createJSONStorage(() => moduleStorage()),
      partialize: ({ ids }) => ({ ids }),
      // runs on every load: a stored value that does not fit gives no ids, and the state stays as it is with nothing stored
      merge: (stored, current) =>
        stored === undefined ? current : { ...current, ids: storedSchema.parse(stored).ids },
    },
  ),
)
