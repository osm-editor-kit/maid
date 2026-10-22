import { serializeTags } from '@osm-editor-kit/maid-ui'
import { create } from 'zustand'

type Tags = Readonly<Record<string, string>>

/** Merge: the copied tags are added, and overwrite the same keys; Replace: the feature gets exactly the copied tags */
export type PasteMode = 'merge' | 'replace'

/** The tags a paste writes to one feature. Empty copied tags with Replace leave the feature without tags. */
export function pastedTags(current: Tags, copied: Tags, mode: PasteMode): Record<string, string> {
  return mode === 'replace' ? { ...copied } : { ...current, ...copied }
}

interface TagClipboardActions {
  /** Keeps the tags for "Paste tags" and writes them to the system clipboard as key=value lines */
  copy: (tags: Tags) => void
  /** Opens the paste dialog for these features, in Merge mode */
  openPaste: (ids: readonly string[]) => void
  setPasteMode: (mode: PasteMode) => void
  closePaste: () => void
}

interface TagClipboardState {
  /** The copied tags; null until something was copied */
  tags: Tags | null
  /** The paste dialog: the features it pastes to and the mode; null when it is closed */
  paste: { readonly ids: readonly string[]; readonly mode: PasteMode } | null
  actions: TagClipboardActions
}

/** The browser refuses a write without a user gesture or permission: the copy in the store stays either way */
function writeSystemClipboard(text: string) {
  try {
    void navigator.clipboard.writeText(text).catch(() => undefined)
  } catch {
    // no clipboard API in this context
  }
}

const useTagClipboardStore = create<TagClipboardState>()((set) => ({
  tags: null,
  paste: null,
  actions: {
    copy: (tags) => {
      set({ tags: { ...tags } })
      writeSystemClipboard(serializeTags(tags))
    },
    openPaste: (ids) => set({ paste: { ids: [...ids], mode: 'merge' } }),
    setPasteMode: (mode) =>
      set((state) => (state.paste ? { paste: { ...state.paste, mode } } : state)),
    closePaste: () => set({ paste: null }),
  },
}))

export const tagClipboardActions = useTagClipboardStore.getState().actions

/** The copied tags, or null when nothing was copied */
export function useCopiedTags() {
  return useTagClipboardStore((state) => state.tags)
}

/** The open paste dialog's features and mode, or null when it is closed */
export function usePasteDialog() {
  return useTagClipboardStore((state) => state.paste)
}
