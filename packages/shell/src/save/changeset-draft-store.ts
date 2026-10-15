/**
 * The changeset draft the save flyout edits, as iD's `context.changeset` tags. It starts when the flyout first opens
 * after the page loads or after an upload (iD's `commit()` → `initChangeset`), prefilled from the address's links
 * (read once, `readLinks`). Each left field is kept in localStorage (`maid:changeset`, two days, as iD's prefs),
 * and an upload that succeeds clears it (iD's `clearSaved` and `flush`). The links stay, so the next changeset
 * starts with them again, as in iD.
 *
 * Kept in memory while the page runs; the stored draft is checked with zod on every load (changeset-draft.ts).
 */
import { moduleStorage } from '@osm-editor-kit/maid-core'
import { create } from 'zustand'
import {
  commitDraft,
  parseStoredDraft,
  prefillDraft,
  type Draft,
  type Links,
  type StoredDraft,
} from './changeset-draft.ts'

const KEY = 'maid:changeset'
const storage = moduleStorage()

function readStored(): StoredDraft | undefined {
  return parseStoredDraft(storage.getItem(KEY))
}

function writeStored(draft: Draft, commentDate: number) {
  storage.setItem(KEY, JSON.stringify({ ...draft, commentDate }))
}

type DraftStore = {
  /** The address's links, read once at load (iD's `initialHashParams`). `undefined` until read. */
  links: Links | undefined
  /** The changeset's draft, or `undefined` before the flyout opens and after an upload */
  draft: Draft | undefined
  readLinks: (links: Links) => void
  /** iD's `initChangeset`: starts the draft unless there is one already */
  open: (now: number) => void
  /** A change as the person types it (iD's `onInput`): kept in memory only */
  edit: (patch: Partial<Draft>) => void
  /** A field is left (iD's `changeTags` without `onInput`): cleaned, the hashtags recomputed, stored */
  commit: (now: number) => void
  /** After a successful upload (iD's `clearSaved` and `flush`) */
  reset: () => void
}

export const useChangesetDraft = create<DraftStore>()((set, get) => ({
  links: undefined,
  draft: undefined,
  readLinks: (links) => {
    if (get().links === undefined) set({ links })
  },
  open: (now) => {
    if (get().draft !== undefined) return
    const stored = prefillDraft(readStored(), get().links ?? {}, now)
    const { commentDate, ...draft } = stored
    writeStored(draft, commentDate)
    set({ draft })
  },
  edit: (patch) => {
    const draft = get().draft ?? { comment: '' }
    set({ draft: { ...draft, ...patch } })
  },
  commit: (now) => {
    const draft = get().draft
    if (draft === undefined) return
    const committed = commitDraft(draft)
    writeStored(committed, now)
    set({ draft: committed })
  },
  reset: () => {
    storage.removeItem(KEY)
    set({ draft: undefined })
  },
}))
