import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/20/solid'
import { defineModule, type Editor } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { Time } from '@osm-editor-kit/maid-ui'
import { useEffect } from 'react'
import { Layer, Source, useMap, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import { NotesDock } from './details.tsx'
import { cellKey, cellsOf, markersOf, notesIn, summaryLine, type NotesMode } from './model.ts'
import {
  abortRequests,
  missingCells,
  requestCells,
  useNotesSession,
  useNotesSettings,
} from './store.ts'

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
 * production); `minZoom` is the OSM zoom from which notes are loaded (default 12).
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
        const chosen = useNotesSession((s) => s.chosen)
        const mode: NotesMode = showClosed ? 'all' : 'open'

        // the map's box after every move; the session keeps it for the panel too
        useEffect(() => {
          if (!map) return
          const update = () => {
            const bounds = map.getBounds()
            useNotesSession.getState().setView({
              bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
              // OSM zoom: MapLibre's zoom plus one, as the engine counts it
              zoom: map.getZoom() + 1,
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

        // what the view needs and does not have yet: one request for the missing cells
        useEffect(() => {
          if (!enabled || !view || view.zoom < minZoom) return
          const missing = missingCells(view.bbox, mode, useNotesSession.getState().cells)
          if (missing.length > 0) requestCells(apiUrl, mode, missing)
        }, [enabled, view, mode])

        // unmounting (or a development remount) aborts what is in flight
        useEffect(() => () => abortRequests(), [])

        if (!enabled || !view || view.zoom < minZoom) return null
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
      return () => {
        abortRequests()
        useNotesSession.getState().setView(null)
      }
    },
  })
}
