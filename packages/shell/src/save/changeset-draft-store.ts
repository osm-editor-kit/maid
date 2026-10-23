/**
 * The changeset draft the save flyout edits, as iD's `context.changeset` tags. It starts when the flyout first opens
 * after the page loads or after an upload (iD's `commit()` → `initChangeset`), prefilled from the address's links
 * (read once, `readLinks`). Each left field is kept in localStorage (`maid:changeset`, two days, as iD's prefs),
 * and an upload that succeeds clears it (iD's `clearSaved` and `flush`). The links stay, so the next changeset
 * starts with them again, as in iD.
 *
 * Kept in memory while the page runs; the stored draft is checked with zod on every load (changeset-draft.ts).
 * The store is private: `useChangesetDraft` and `useChangesetDraftActions` are its only way out in React.
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

interface DraftActions {
  /** Reads the address's links once; later calls change nothing (iD's `initialHashParams`) */
  readLinks: (links: Links) => void
  /** iD's `initChangeset`: starts the draft unless there is one already. Kept in memory: a link is a prefill, not a change. */
  open: (now: number, suggested?: string) => void
  /** A change as the person types it (iD's `onInput`): kept in memory only */
  edit: (patch: Partial<Draft>) => void
  /** A field is left (iD's `changeTags` without `onInput`): cleaned, the hashtags recomputed, stored */
  commit: (now: number) => void
  /** After a successful upload (iD's `clearSaved` and `flush`) */
  reset: () => void
}

interface DraftState {
  /** The address's links, read once at load. `undefined` until read. */
  links: Links | undefined
  /** The changeset's draft, or `undefined` before the flyout opens and after an upload */
  draft: Draft | undefined
  actions: DraftActions
}

const useDraftStore = create<DraftState>()((set, get) => ({
  links: undefined,
  draft: undefined,
  actions: {
    readLinks: (links) => {
      if (get().links === undefined) set({ links })
    },
    open: (now, suggested) => {
      if (get().draft !== undefined) return
      // in memory only: the link's values prefill the dialog, and storage is written by the person's own commit (A link never writes storage)
      const { comment, hashtags, source } = prefillDraft(
        readStored(),
        get().links ?? {},
        now,
        suggested,
      )
      set({ draft: { comment, hashtags, source } })
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
  },
}))

/** The changeset's draft as the flyout shows it, or `undefined` before it starts */
export function useChangesetDraft(): Draft | undefined {
  return useDraftStore((state) => state.draft)
}

/** The draft's actions, in a component. The object never changes. */
export function useChangesetDraftActions(): DraftActions {
  return useDraftStore((state) => state.actions)
}

/** The draft outside React (checks and tests). */
export function currentDraft(): Draft | undefined {
  return useDraftStore.getState().draft
}

/** The draft's actions outside React (checks and tests). The object never changes. */
export const changesetDraftActions: DraftActions = useDraftStore.getState().actions
