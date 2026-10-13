import { notify, Time } from '@osm-editor-kit/maid-ui'
import { useEffect } from 'react'
import { answerRestore, useJournal, type RestoreSummary } from '../journal'
import { RestoreChanges } from './RestoreChanges'

/** The standing toast of the journal: one, for as long as the edits here are not kept */
const JOURNAL_NOTICE = 'journal-edits'
const JOURNAL_LOCKED = 'This map is open in another tab. Edits made here are lost on reload.'

const BUTTON =
  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'
const SECONDARY = `${BUTTON} text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-zinc-800`
const PRIMARY = `${BUTTON} bg-blue-600 text-white hover:bg-blue-500`

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

/**
 * Asks whether the edits of the last visit come back, as iD does on start. It covers the app
 * until it is answered, because stored edits can only be put back before the first new one.
 * The question says what is stored: the context line, then the steps and the changed features,
 * both always listed. Also says so when edits are not kept: in a second tab, or when the browser's
 * storage fails.
 */
export function RestorePrompt() {
  const journal = useJournal()
  const summary = journal.status === 'pending' ? journal.summary : undefined

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
          <RestoreChanges summary={summary} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => void answerRestore(false)} className={SECONDARY}>
              Discard them
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => void answerRestore(true)}
              className={PRIMARY}
            >
              Restore my edits
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
