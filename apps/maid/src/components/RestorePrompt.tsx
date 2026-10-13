import { notify, Time } from '@osm-editor-kit/maid-ui'
import { useEffect, useState } from 'react'
import { engine } from '../editor'
import { answerRestore, useJournal, type RestoreSummary } from '../journal'
import { RestoreChanges } from './RestoreChanges'

/** The standing toast of the journal: one, for as long as the edits here are not kept */
const JOURNAL_NOTICE = 'journal-edits'
const JOURNAL_LOCKED = 'This map is open in another tab. Edits made here are lost on reload.'

const BUTTON =
  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'
const SECONDARY = `${BUTTON} text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-zinc-800`
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-500`

/** The stored edits' area on the screen, in CSS pixels */
type Outline = { left: number; top: number; width: number; height: number }

/** "5 unsaved edits to 3 features (1 undone)": what is stored, in the words the dialog uses */
function editsText(summary: RestoreSummary) {
  let text = summary.edits === 1 ? '1 unsaved edit' : `${summary.edits} unsaved edits`
  if (summary.features > 0) {
    text += summary.features === 1 ? ' to 1 feature' : ` to ${summary.features} features`
  }
  if (summary.undone > 0) {
    text += summary.undone === summary.edits ? ' (all undone)' : ` (${summary.undone} undone)`
  }
  return text
}

/** Moves the map to the area of the stored edits. Nothing is selected or changed; loaded features get the related highlight. */
function fitMap(summary: RestoreSummary) {
  const map = engine.map
  const extent = summary.extent
  if (!map || !extent) return false
  const [west, south, east, north] = extent
  // a single point, or a tiny area, still gets a view of its own
  const grow = 0.0005
  map.fitBounds(
    [
      [west - grow, south - grow],
      [east + grow, north + grow],
    ],
    { padding: 80, maxZoom: 18, duration: 0 },
  )
  engine.setRelated(summary.ids)
  return true
}

/** Where the area of the stored edits is on the screen now. Read after `fitMap`, and again on a resize. */
function outlineOf(summary: RestoreSummary): Outline | undefined {
  const map = engine.map
  const extent = summary.extent
  if (!map || !extent) return undefined
  const [west, south, east, north] = extent
  const nw = map.project([west, north])
  const se = map.project([east, south])
  const box = map.getContainer().getBoundingClientRect()
  // at least a square of 12 pixels, centred on the area
  const width = Math.max(Math.abs(se.x - nw.x), 12)
  const height = Math.max(Math.abs(se.y - nw.y), 12)
  const centreX = box.left + (nw.x + se.x) / 2
  const centreY = box.top + (nw.y + se.y) / 2
  return { left: centreX - width / 2, top: centreY - height / 2, width, height }
}

/**
 * Asks whether the edits of the last visit come back, as iD does on start. It covers the app
 * until it is answered, because stored edits can only be put back before the first new one.
 * The question says what is stored: the edits, the features they change and where, and the steps
 * on request. "Show on the map" steps aside so the map can be seen; the map takes no clicks then.
 * Also says so when edits are not kept: in a second tab, or when the browser's storage fails.
 */
export function RestorePrompt() {
  const journal = useJournal()
  const [view, setView] = useState<'dialog' | 'map'>('dialog')
  const [outline, setOutline] = useState<Outline>()
  const summary = journal.status === 'pending' ? journal.summary : undefined
  const onMap = view === 'map' ? summary : undefined

  // the outline follows the map when the window is resized
  useEffect(() => {
    const map = engine.map
    if (!map || !onMap) return
    const follow = () => setOutline(outlineOf(onMap))
    map.on('resize', follow)
    return () => {
      map.off('resize', follow)
    }
  }, [onMap])

  // edits that are not kept show as one standing toast (Toast.tsx); it goes when they are kept again
  const notKept =
    journal.status === 'locked'
      ? JOURNAL_LOCKED
      : journal.status === 'failed'
        ? `Edits are not kept across a reload: ${journal.message}`
        : undefined
  useEffect(() => {
    if (notKept === undefined) notify.clear(JOURNAL_NOTICE)
    else notify.standing(JOURNAL_NOTICE, notKept)
  }, [notKept])

  if (summary) {
    // every answer clears the highlight first: the highlight belongs to the question
    const answer = (restore: boolean) => {
      engine.setRelated(null)
      void answerRestore(restore)
    }
    if (view === 'map') {
      return (
        <>
          {/* takes the pointer and the wheel: nothing on the map is selected, dragged or edited while the edits wait */}
          <div className="fixed inset-0 z-40" />
          {outline && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-40 rounded-sm border-2 border-blue-500 bg-blue-500/10"
              style={outline}
            />
          )}
          <div
            role="alertdialog"
            aria-labelledby="restore-title"
            aria-describedby="restore-text"
            className="fixed bottom-16 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl bg-white p-3 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10"
          >
            <h2 id="restore-title" className="sr-only">
              Restore your unsaved edits?
            </h2>
            <p id="restore-text" className="text-sm text-zinc-600 dark:text-zinc-400">
              {editsText(summary)}, the outlined area on the map.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  engine.setRelated(null)
                  setOutline(undefined)
                  setView('dialog')
                }}
                className={SECONDARY}
              >
                Back
              </button>
              <button type="button" onClick={() => answer(false)} className={SECONDARY}>
                Discard them
              </button>
              <button type="button" autoFocus onClick={() => answer(true)} className={PRIMARY}>
                Restore my edits
              </button>
            </div>
          </div>
        </>
      )
    }
    return (
      // over the whole app and blurred: nothing behind it can be used until this is answered
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/25 p-4 backdrop-blur-sm dark:bg-zinc-950/50">
        <div
          role="alertdialog"
          aria-labelledby="restore-title"
          aria-describedby="restore-text"
          className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10"
        >
          <h2 id="restore-title" className="text-base font-semibold text-zinc-950 dark:text-white">
            Restore your unsaved edits?
          </h2>
          <div id="restore-text" className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              {editsText(summary)}, <Time value={summary.savedAt} primary="relative" />
            </p>
            {summary.name && <p>Around {summary.name}</p>}
            <p className="mt-1">Restore them, or discard them and start fresh.</p>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200">
              Show the changes
            </summary>
            <RestoreChanges summary={summary} />
          </details>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={!summary.extent}
              title={
                summary.extent
                  ? 'Move the map to the stored edits'
                  : 'The stored edits hold no position to show'
              }
              onClick={() => {
                if (!fitMap(summary)) return
                setOutline(outlineOf(summary))
                setView('map')
              }}
              className={`${SECONDARY} disabled:cursor-default disabled:opacity-50`}
            >
              Show on the map
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => answer(false)} className={SECONDARY}>
                Discard them
              </button>
              <button type="button" autoFocus onClick={() => answer(true)} className={PRIMARY}>
                Restore my edits
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
