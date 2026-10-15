/**
 * The chosen note as the shell's URL `id` shows it (`id=note/<id>`, iD's form). The notes module keeps the note: it
 * loads it, turns the notes switch on, moves the map to it and draws it in the dock. The shell keeps the URL: it asks
 * this handle to select or clear a note, and listens to it so the URL follows. The handle is an extension point item
 * (`note.selection`), so the shell finds it through the editor's registry and needs no import of this module's state.
 */
import { isAutomated, retryDelayFor, shouldRetry, type Editor } from '@osm-editor-kit/maid-core'
import type { NoteSelection } from './extension-points.ts'
import { noteUrl, parseNoteAnswer, type Note } from './model.ts'
import { cachedNote, NOTES_STALE_MS } from './query.ts'
import { useNotesSession } from './store.ts'

/**
 * The note with this id: from the cache, else one request for it through the editor's fetch. Under automation nothing
 * is requested, as for the notes of a view (query.ts: `enabled` is false). The note is stored under a notes key, so
 * `cachedNote` finds it afterwards.
 */
async function loadNote(editor: Editor, apiUrl: string, id: number): Promise<Note | undefined> {
  const cached = cachedNote(editor.queries, id)
  if (cached || isAutomated()) return cached
  const found = await editor.queries.fetchQuery({
    queryKey: ['osm', 'notes', apiUrl, 'note', id],
    queryFn: async ({ signal }) => {
      const response = await editor.fetch(noteUrl(apiUrl, id), {
        signal,
        headers: { Accept: 'application/json' },
        service: 'osm',
      })
      const note = parseNoteAnswer(await response.json())
      return { notes: note ? [note] : [], truncated: false }
    },
    staleTime: NOTES_STALE_MS,
    // session data, as the cells: kept for the visit
    gcTime: Infinity,
    retry: shouldRetry,
    retryDelay: retryDelayFor,
  })
  return found.notes[0]
}

/** The note selection of one editor. Its state is the notes store's `chosen`, so there is one note for the page. */
export function noteSelectionFor(options: { editor: Editor; apiUrl: string }): NoteSelection {
  const { editor, apiUrl } = options
  // each select and each clear makes a new request number; a load that is not the latest does not choose
  let latest = 0
  return {
    id: 'notes',
    current: () => useNotesSession.getState().chosen,
    subscribe: (listener) =>
      useNotesSession.subscribe((state, before) => {
        if (state.chosen !== before.chosen) listener(state.chosen)
      }),
    async select(id, { moveTo }) {
      const request = ++latest
      let note: Note | undefined
      try {
        note = await loadNote(editor, apiUrl, id)
      } catch {
        // the failure is the query's: the note is not chosen, and the URL shows it until the next change
        return
      }
      if (request !== latest || !note) return
      const session = useNotesSession.getState()
      session.requestTurnOn()
      if (moveTo) session.focusOn(id)
      else session.choose(id)
    },
    clear() {
      latest++
      if (useNotesSession.getState().chosen !== null) useNotesSession.getState().choose(null)
    },
  }
}
