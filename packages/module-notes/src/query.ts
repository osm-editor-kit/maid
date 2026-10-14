/**
 * The notes queries: one TanStack query per grid cell, the cells a view wants, and the reads of the
 * cache that the map, the panel and the dock need. The notes are server data: they live in the
 * editor's query client, not in a store. Nothing here sends a request under automation or below the
 * zoom gate (`wantedCells` gives no cells there, and `enabled` is false under automation).
 */
import {
  AutomationBlockedError,
  HttpError,
  isAutomated,
  keys,
  RateLimitedError,
  retryDelayFor,
  shouldRetry,
  type Editor,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import { queryOptions, useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import {
  cellBox,
  cellsOf,
  notesUrl,
  NOTES_LIMIT,
  parseNotes,
  type Bbox,
  type Cell,
  type Note,
  type NotesMode,
} from './model.ts'
import { useNotesSession } from './store.ts'

/**
 * A loaded cell is not asked again for this long. Notes change slowly, and a pan back over a cell
 * that was just loaded asks nothing. After the time, the next view that shows the cell asks again.
 */
export const NOTES_STALE_MS = 5 * 60_000

/** What one cell's request gives: its notes, and whether the answer was cut at the API's limit */
export type CellNotes = { notes: Note[]; truncated: boolean }

/** The key of one cell's query, from the editor's key convention (`keys.notes` in maid-core) */
export function notesKey(apiUrl: string, mode: NotesMode, cell: Cell) {
  return keys.notes(apiUrl, mode, cell.i, cell.j)
}

/**
 * A failure that is never asked again in this session: the request itself is wrong (a 4xx answer), or
 * it was refused under automation. A rate limit is not one: the gate pauses the service instead.
 */
export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof AutomationBlockedError) return true
  return error instanceof HttpError && error.status >= 400 && error.status < 500
}

/** The line the panel shows for a failed request. */
export function failureMessage(error: unknown): string {
  if (error instanceof RateLimitedError) {
    return 'The OpenStreetMap server asked for a pause. The notes load again when it ends.'
  }
  if (error instanceof HttpError) return `The notes could not be loaded (HTTP ${error.status}).`
  return 'The notes could not be loaded.'
}

/**
 * The cells a view needs now. None when the notes are off, when there is no view yet, or when the view
 * is further out than the zoom gate. `view.zoom` and `minZoom` are OSM zoom levels.
 */
export function wantedCells(options: {
  enabled: boolean
  view: { bbox: Bbox; zoom: number } | null
  minZoom: number
}): Cell[] {
  const { enabled, view, minZoom } = options
  if (!enabled || view === null || view.zoom < minZoom) return []
  return cellsOf(view.bbox)
}

/** One request for one cell's box, through the editor's fetch. The signal aborts it when the cell leaves the view. */
async function loadCell(
  remote: RemoteFetch,
  apiUrl: string,
  mode: NotesMode,
  cell: Cell,
  signal: AbortSignal,
): Promise<CellNotes> {
  const response = await remote(notesUrl(apiUrl, cellBox(cell), mode), {
    signal,
    headers: { Accept: 'application/json' },
    service: 'osm',
  })
  const { notes, skipped, count } = parseNotes(await response.json())
  if (skipped > 0) console.warn(`[module-notes] skipped ${skipped} malformed notes`)
  return { notes, truncated: count >= NOTES_LIMIT }
}

/**
 * The query of one cell. Retries and their pauses are the editor's rule (`shouldRetry`: two retries,
 * 1 s then 2 s, none on 4xx, a rate limit or a refused request; `retryDelayFor`). `retryOnMount` stays
 * on, so a cell that failed is asked again when the view shows it again.
 */
export function notesCell(options: {
  remote: RemoteFetch
  apiUrl: string
  mode: NotesMode
  cell: Cell
  enabled: boolean
}) {
  const { remote, apiUrl, mode, cell, enabled } = options
  return queryOptions({
    queryKey: notesKey(apiUrl, mode, cell),
    queryFn: ({ signal }) => loadCell(remote, apiUrl, mode, cell, signal),
    enabled,
    staleTime: NOTES_STALE_MS,
    // session data, as before: loaded notes stay in memory for the visit and are not stored
    gcTime: Infinity,
    retry: shouldRetry,
    retryDelay: retryDelayFor,
  })
}

/** Whether the OSM service is paused for a rate limit (the editor's pause list) */
export function useOsmPaused(editor: Editor): boolean {
  return useSyncExternalStore(
    (listen) => editor.fetchPauses.subscribe(listen),
    () => editor.fetchPauses.list().some((pause) => pause.service === 'osm'),
  )
}

/**
 * One query per cell of the view. A cell whose query is no longer observed (it left the view, or the
 * notes went off and the list is empty) has its request aborted by TanStack. While the OSM service is
 * paused, while automated, or after a permanent failure, a query is disabled: it sends nothing.
 */
export function useNotesCells(options: {
  editor: Editor
  apiUrl: string
  mode: NotesMode
  cells: Cell[]
}) {
  const { editor, apiUrl, mode, cells } = options
  const queries = useQueryClient()
  const paused = useOsmPaused(editor)
  const automated = isAutomated()
  return useQueries({
    queries: cells.map((cell) => {
      const failure = queries.getQueryState(notesKey(apiUrl, mode, cell))?.error
      return notesCell({
        remote: editor.fetch,
        apiUrl,
        mode,
        cell,
        enabled: !paused && !automated && !isPermanentFailure(failure),
      })
    }),
  })
}

/**
 * The note with this id, from the cells the cache holds. A cell keeps its notes after it left the view
 * (its query is not removed), so a chosen note stays in the dock after a pan.
 */
export function cachedNote(queries: QueryClient, id: number): Note | undefined {
  for (const [, data] of queries.getQueriesData<CellNotes>({ queryKey: ['osm', 'notes'] })) {
    const note = data?.notes.find((candidate) => candidate.id === id)
    if (note) return note
  }
  return undefined
}

/** The chosen note (an id in the store), read from the cache */
export function useChosenNote(): Note | undefined {
  const queries = useQueryClient()
  const chosen = useNotesSession((s) => s.chosen)
  return chosen === null ? undefined : cachedNote(queries, chosen)
}
