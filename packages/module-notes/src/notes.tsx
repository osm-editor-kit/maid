import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/20/solid'
import { defineModule, type Editor } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { lazyComponent, notify, PANEL_FALLBACK, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { Time } from '@osm-editor-kit/maid-ui'
import { useEffect } from 'react'
import { Layer, Source, useMap, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import {
  cellKey,
  cellsOf,
  markersOf,
  notesIn,
  osmZoomOf,
  summaryLine,
  truncationNotice,
  TRUNCATED_NOTICE_ID,
  TRUNCATED_NOTICE_TEXT,
  type NotesMode,
} from './model.ts'
import {
  abortOutside,
  abortRequests,
  missingCells,
  requestCells,
  useNotesSession,
  useNotesSettings,
} from './store.ts'

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

/**
 * The notes module: the notes of the view as markers on the map, a panel to switch them on and
 * list them, and a dock view with the chosen note. Read-only: nothing is sent to the API.
 * `apiUrl` is the API root (the mock API in development and tests, api.openstreetmap.org in
 * production); `minZoom` is the OSM zoom from which notes are loaded (default 12; Maid passes 14).
 */
export function notes(options: { apiUrl: string; minZoom?: number }) {
  const { apiUrl } = options
  const minZoom = options.minZoom ?? 12

  return defineModule({
    id: 'notes',
    setup(api) {
      /** The markers, above the OSM data. Only when on and zoomed in far enough. */
      function NotesOnMap(_props: MapContentProps) {
        const { current: map } = useMap()
        const enabled = useNotesSettings((s) => s.enabled)
        const showClosed = useNotesSettings((s) => s.showClosed)
        const view = useNotesSession((s) => s.view)
        const notes = useNotesSession((s) => s.notes)
        const cells = useNotesSession((s) => s.cells)
        const paused = useNotesSession((s) => s.paused)
        const tick = useNotesSession((s) => s.tick)
        const chosen = useNotesSession((s) => s.chosen)
        const mode: NotesMode = showClosed ? 'all' : 'open'
        const active = enabled && view !== null && view.zoom >= minZoom
        const truncatedInView =
          active && view !== null
            ? cellsOf(view.bbox).some((cell) => cells[cellKey(mode, cell)] === 'truncated')
            : false

        // the map's box after every move; the session keeps it for the panel too
        useEffect(() => {
          if (!map) return
          const update = () => {
            const bounds = map.getBounds()
            useNotesSession.getState().setView({
              bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
              // the one place of the conversion from MapLibre's zoom to OSM zoom (model.ts)
              zoom: osmZoomOf(map.getZoom()),
            })
          }
          update()
          useNotesSession.getState().setMap(map)
          map.on('moveend', update)
          return () => {
            map.off('moveend', update)
            useNotesSession.getState().setMap(null)
            useNotesSession.getState().setView(null)
          }
        }, [map])

        // a click on a marker chooses its note; the map's click handler ignores these layers
        useEffect(() => {
          if (!map) return
          const choose = (event: MapLayerMouseEvent) => {
            const id = event.features?.[0]?.properties.id
            if (typeof id === 'number') useNotesSession.getState().choose(id)
          }
          for (const layer of NOTES_LAYER_IDS) map.on('click', layer, choose)
          return () => {
            for (const layer of NOTES_LAYER_IDS) map.off('click', layer, choose)
          }
        }, [map])

        // a request whose cells left the view, or whose layer went off, is aborted (a cell is then asked again later)
        useEffect(() => {
          const wanted = active && view ? cellsOf(view.bbox).map((cell) => cellKey(mode, cell)) : []
          abortOutside(new Set(wanted))
        }, [active, view, mode])

        // what the view needs and does not have yet: one request for the missing cells, none while the
        // OSM service is paused for a rate limit, and none for a cell still waiting after a failure
        // (`tick` changes when such a wait is over)
        useEffect(() => {
          if (!active || !view || paused) return
          const session = useNotesSession.getState()
          const missing = missingCells(view.bbox, mode, session.cells, session.failures, Date.now())
          if (missing.length > 0) requestCells(api.editor.fetch, apiUrl, mode, missing)
        }, [active, view, mode, paused, tick])

        // the notice of a list cut at the limit: once for a view that has one, not on every move
        useEffect(() => {
          const step = truncationNotice(useNotesSession.getState().noticeShown, truncatedInView)
          if (step.shown !== useNotesSession.getState().noticeShown) {
            useNotesSession.getState().setNoticeShown(step.shown)
          }
          if (step.notify) notify.info(TRUNCATED_NOTICE_TEXT, { id: TRUNCATED_NOTICE_ID })
        }, [truncatedInView])

        // unmounting (or a development remount) aborts what is in flight
        useEffect(() => () => abortRequests(), [])

        if (!active || !view) return null
        const shown = Object.values(notes).filter((note) => showClosed || note.status === 'open')
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
      function NotesPanel(_props: { editor: Editor }) {
        const enabled = useNotesSettings((s) => s.enabled)
        const showClosed = useNotesSettings((s) => s.showClosed)
        const setEnabled = useNotesSettings((s) => s.setEnabled)
        const setShowClosed = useNotesSettings((s) => s.setShowClosed)
        const view = useNotesSession((s) => s.view)
        const notes = useNotesSession((s) => s.notes)
        const cells = useNotesSession((s) => s.cells)
        const error = useNotesSession((s) => s.error)
        const chosen = useNotesSession((s) => s.chosen)
        const choose = useNotesSession((s) => s.choose)
        const mode: NotesMode = showClosed ? 'all' : 'open'

        const inView = view ? notesIn(Object.values(notes), view.bbox, showClosed) : []
        const states = view ? cellsOf(view.bbox).map((cell) => cells[cellKey(mode, cell)]) : []
        const loading = states.includes('loading')
        const truncated = states.includes('truncated')

        let status: string
        if (!enabled) status = 'Notes are off. Nothing is loaded until you switch them on.'
        else if (!view) status = 'Waiting for the map.'
        else if (view.zoom < minZoom) status = `Zoom in to see the notes (from zoom ${minZoom}).`
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
                      onClick={() => choose(note.id, true)}
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

      api.register('map.content', { id: 'notes', component: NotesOnMap })
      api.register('topbar.panel', {
        id: 'notes',
        label: 'Notes',
        icon: <ChatBubbleLeftEllipsisIcon />,
        component: NotesPanel,
        width: 'w-80',
      })
      api.register('dock.view', { id: 'notes', label: 'Notes', component: NotesDock })
      // a rate limit of the OSM service stops the notes requests until its pause ends
      const isPaused = (pauses: readonly { service: string }[]) =>
        pauses.some((pause) => pause.service === 'osm')
      useNotesSession.getState().setPaused(isPaused(api.editor.fetchPauses.list()))
      const stopPauses = api.editor.fetchPauses.subscribe((pauses) =>
        useNotesSession.getState().setPaused(isPaused(pauses)),
      )
      return () => {
        stopPauses()
        abortRequests()
        useNotesSession.getState().setPaused(false)
        useNotesSession.getState().setView(null)
      }
    },
  })
}
