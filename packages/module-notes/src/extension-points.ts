/**
 * The extension point of the notes module: the chosen note, for the shell's URL `id` (note-selection.ts). Declared in
 * this file, as every package declares its points in `src/extension-points.ts` (the config check reads them there).
 */

export interface NoteSelection {
  /** The registry id of the one note selection of an editor */
  readonly id: 'notes'
  /** The chosen note's id, or null when no note is chosen */
  current(): number | null
  /** Calls the listener when the chosen note changes (not on a change that keeps it). Returns the unsubscribe. */
  subscribe(listener: (note: number | null) => void): () => void
  /**
   * Chooses the note. It is loaded first when the cache does not have it, through the editor's fetch (never directly).
   * The notes switch turns on, as iD's layer does, and the map moves to the note when `moveTo`. A note that cannot be
   * loaded is not chosen. A `clear` or a newer `select` made meanwhile wins over this one.
   */
  select(note: number, options: { moveTo: boolean }): Promise<void>
  /** Chooses no note. Nothing is requested. */
  clear(): void
}

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'note.selection': NoteSelection
  }
}
