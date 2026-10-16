import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/20/solid'
import { defineModule, toOsmZoom, type Editor } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { lazyComponent, notify, PANEL_FALLBACK, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { Time } from '@osm-editor-kit/maid-ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Layer, Source, useMap, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import {
  loadsAt,
  markersOf,
  notesIn,
  NOTES_MIN_ZOOM,
  summaryLine,
  truncationNotice,
  TRUNCATED_NOTICE_ID,
  TRUNCATED_NOTICE_TEXT,
  type Note,
  type NotesMode,
} from './model.ts'
import { noteSelectionFor } from './note-selection.ts'
import { cachedNote, failureMessage, useNotesCells, wantedCells } from './query.ts'
import { useNotesSwitch } from './shown.ts'
import {
  notesSessionActions,
  useChosenNoteId,
  useMapView,
  useNoticeShown,
  useNotesFocus,
  useNotesSessionActions,
  useNotesSettingsActions,
  useNotesTurnOn,
  useShowClosedNotes,
} from './store.ts'
import { ID_NOTES, parseAsNotes } from './url.ts'

// the dock view (the chosen note, its comments) is a chunk of its own: loaded when it is shown, or in idle time after the first view
const NotesDock = lazyComponent(
  () => import('./details.tsx').then((details) => ({ default: details.NotesDock })),
  PANEL_FALLBACK,
)

const SOURCE = 'maid-notes'
const MARKERS = 'maid-notes-markers'
const RING = 'maid-notes-ring'

/**
 * The layers of the note markers. A click on one of them chooses the note. The app's map click
 * handler must return early when the click hits one of these layers (for example with
 * `map.queryRenderedFeatures(point, { layers: NOTES_LAYER_IDS })`), or the OSM feature under the
 * marker is selected too.
 */
export const NOTES_LAYER_IDS: string[] = [MARKERS, RING]

const OPEN = '#e8421b'
const CLOSED = '#8e96a3'

/** OSM zoom at which a chosen note is shown */
const FOCUS_ZOOM = 17

/**
 * What the notes view shows now: the view, its notes, and whether they are loading, cut short or failed. `enabled` is
 * the switch as the URL and the stored choice give it (shown.ts). The map layer and the panel both call it: they
 * observe the same cell queries, so a cell is asked once.
 */
function useNotesView(editor: Editor, apiUrl: string, enabled: boolean) {
  const showClosed = useShowClosedNotes()
  const view = useMapView()
  const mode: NotesMode = showClosed ? 'all' : 'open'
  const active = enabled && view !== null && loadsAt(view.zoom)
  const results = useNotesCells({
    editor,
    apiUrl,
    mode,
    cells: wantedCells({ enabled, view, minZoom: NOTES_MIN_ZOOM }),
  })
  // a note in two neighbouring cells (on their shared edge) is kept once
  const byId = new Map<number, Note>()
  for (const result of results) for (const note of result.data?.notes ?? []) byId.set(note.id, note)
  const failed = results.find((result) => result.isError)
  return {
    view,
    active,
    notes: [...byId.values()],
    loading: results.some((result) => result.isFetching),
    truncated: results.some((result) => result.data?.truncated === true),
    error: failed ? failureMessage(failed.error) : null,
  }
}

/**
 * The notes module: the notes of the view as markers on the map, a panel to switch them on and
 * list them, and a dock view with the chosen note. Read-only: nothing is sent to the API.
 * `apiUrl` is the API root (the mock API in development and tests, api.openstreetmap.org in
 * production). The notes load from `NOTES_MIN_ZOOM` (OSM zoom 12, as iD). That is the one zoom gate,
 * set here and not by the app.
 */
export function notes(options: { apiUrl: string }) {
  const { apiUrl } = options

  return defineModule({
    id: 'notes',
    setup(api) {
      // iD's name, read once at start by iD and written by Maid (url.ts): a link can turn the notes on
      const notesUrl = api.urlParam<boolean>({
        name: 'notes',
        parser: parseAsNotes,
        options: { history: 'replace' },
        iD: ID_NOTES,
      })

      /** The markers, above the OSM data. Only when on and zoomed in far enough. */
      function NotesOnMap(_props: MapContentProps) {
        const { current: map } = useMap()
        const queries = useQueryClient()
        const session = useNotesSessionActions()
        // a note chosen by a link turns the notes on, in the URL only: a link never writes the stored choice (shown.ts)
        const turnOn = useNotesTurnOn()
        const [, setNotesOn] = useUrlParam(notesUrl)
        // This component is the one writer of the `notes` key: mounted with the map, so the URL says what is shown from
        // the start. While a turn-on request is pending it writes nothing; the effect below writes the key instead, so
        // the two never race and the result does not depend on the order the effects run in.
        const { enabled } = useNotesSwitch(notesUrl, { ready: turnOn === null })
        useEffect(
          function turnNotesOnForLink() {
            if (!turnOn) return
            void setNotesOn(true)
            session.clearTurnOn()
          },
          [turnOn, setNotesOn, session],
        )
        const showClosed = useShowClosedNotes()
        const focus = useNotesFocus()
        const chosen = useChosenNoteId()
        const noticeShown = useNoticeShown()
        const { view, active, notes, truncated } = useNotesView(api.editor, apiUrl, enabled)
        const truncatedInView = active && truncated

        // the map's box after every move; the session keeps it for the panel too. A child of the map has no
        // moveend prop of its own (the Map's handlers are the shell's), so it listens here.
        useEffect(() => {
          if (!map) return
          const update = () => {
            const bounds = map.getBounds()
            session.setView({
              bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
              // the one place of the conversion from MapLibre's zoom to OSM zoom (model.ts)
              zoom: toOsmZoom(map.getZoom()),
            })
          }
          update()
          map.on('moveend', update)
          return () => {
            map.off('moveend', update)
            session.setView(null)
          }
        }, [map, session])

        // a click on a marker chooses its note; the map's click handler ignores these layers. Per layer,
        // because only MapLibre's layer-scoped click tells the marker apart: react-map-gl has no prop for it.
        useEffect(() => {
          if (!map) return
          const choose = (event: MapLayerMouseEvent) => {
            const id = event.features?.[0]?.properties.id
            if (typeof id === 'number') session.choose(id)
          }
          for (const layer of NOTES_LAYER_IDS) map.on('click', layer, choose)
          return () => {
            for (const layer of NOTES_LAYER_IDS) map.off('click', layer, choose)
          }
        }, [map, session])

        // the map moves to the note the panel chose. It is an effect because the map is the outside world.
        // The note comes from the cache, so the effect runs once per request (`focus` is a new object each time).
        useEffect(() => {
          if (!focus || !map) return
          const note = cachedNote(queries, focus.id)
          if (note)
            map.easeTo({
              center: [note.lon, note.lat],
              zoom: Math.max(map.getZoom(), FOCUS_ZOOM - 1),
            })
        }, [focus, map, queries])

        // the notice of a list cut at the limit: once for a view that has one, not on every move
        useEffect(
          function noticeOfCutList() {
            const step = truncationNotice(noticeShown, truncatedInView)
            if (step.shown !== noticeShown) session.setNoticeShown(step.shown)
            if (step.notify) notify.info(TRUNCATED_NOTICE_TEXT, { id: TRUNCATED_NOTICE_ID })
          },
          [truncatedInView, noticeShown, session],
        )

        if (!active || !view) return null
        const shown = notes.filter((note) => showClosed || note.status === 'open')
        return (
          <Source id={SOURCE} type="geojson" data={markersOf(shown, chosen)}>
            <Layer
              id={MARKERS}
              type="circle"
              paint={{
                'circle-radius': ['case', ['get', 'chosen'], 9, 6],
                'circle-color': ['case', ['==', ['get', 'status'], 'open'], OPEN, CLOSED],
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id={RING}
              type="circle"
              filter={['==', ['get', 'chosen'], true]}
              paint={{
                'circle-radius': 14,
                'circle-color': 'rgba(0, 0, 0, 0)',
                'circle-stroke-width': 2.5,
                'circle-stroke-color': '#18181b',
              }}
            />
          </Source>
        )
      }

      /** The switches, the count in view and the list of the notes in view */
      function NotesPanel(props: { editor: Editor }) {
        // reads and chooses only: the map layer writes the key, so the panel passes `ready: false`
        const { enabled, setEnabled } = useNotesSwitch(notesUrl, { ready: false })
        const showClosed = useShowClosedNotes()
        const { setShowClosed } = useNotesSettingsActions()
        const chosen = useChosenNoteId()
        const { focusOn } = useNotesSessionActions()
        const { view, notes, loading, truncated, error } = useNotesView(
          props.editor,
          apiUrl,
          enabled,
        )

        const inView = view ? notesIn(notes, view.bbox, showClosed) : []

        let status: string
        if (!enabled) status = 'Notes are off. Nothing is loaded until you switch them on.'
        else if (!view) status = 'Waiting for the map.'
        else if (!loadsAt(view.zoom))
          status = `Zoom in to see the notes (from zoom ${NOTES_MIN_ZOOM}).`
        else if (loading) status = 'Loading notes…'
        else status = `${inView.length} ${inView.length === 1 ? 'note' : 'notes'} in view`

        return (
          <div className="p-4 text-sm">
            <h2 className="mb-1 text-base font-semibold">Notes</h2>
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
              <span>Show notes</span>
              <input
                {...PLAIN_INPUT}
                type="checkbox"
                role="switch"
                className="size-4 cursor-pointer accent-orange-600"
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
              <span>Also closed ones</span>
              <input
                {...PLAIN_INPUT}
                type="checkbox"
                className="size-4 cursor-pointer"
                checked={showClosed}
                onChange={(event) => setShowClosed(event.currentTarget.checked)}
              />
            </label>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
            {truncated && enabled && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                This area has more notes than one request gives. Zoom in to see all of them.
              </p>
            )}
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            {enabled && inView.length > 0 && (
              <ul className="mt-2 max-h-80 overflow-y-auto">
                {inView.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      aria-pressed={chosen === note.id}
                      onClick={() => focusOn(note.id)}
                      className={`flex w-full cursor-pointer items-start gap-2 rounded-md border-b border-zinc-950/5 px-2 py-1.5 text-left text-xs last:border-0 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/5 dark:hover:bg-white/5 ${
                        chosen === note.id ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1 size-2 shrink-0 rounded-full ${note.status === 'open' ? 'bg-[#e8421b]' : 'bg-zinc-400'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{summaryLine(note)}</span>
                        <span className="block text-zinc-500 dark:text-zinc-400">
                          {note.status === 'open' ? 'Open' : 'Closed'} ·{' '}
                          <Time value={note.created} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }

      // the shell selects and clears the chosen note through this item (selection.ts in the shell)
      api.register('note.selection', noteSelectionFor({ editor: api.editor, apiUrl }))
      api.register('map.content', { id: 'notes', component: NotesOnMap })
      api.register('topbar.panel', {
        id: 'notes',
        label: 'Notes',
        icon: <ChatBubbleLeftEllipsisIcon />,
        component: NotesPanel,
        width: 'w-80',
      })
      api.register('dock.view', { id: 'notes', label: 'Notes', component: NotesDock })
      // a rate limit pauses the notes through the query's `enabled` (useOsmPaused); nothing to stop here
      return () => {
        notesSessionActions.setView(null)
      }
    },
  })
}
