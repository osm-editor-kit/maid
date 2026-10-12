import { Time } from '@osm-editor-kit/maid-ui'
import { answerRestore, useJournal } from '../journal'

const BUTTON =
  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'

/**
 * Asks whether the edits of the last visit come back, as iD does on start. It covers the app
 * until it is answered, because stored edits can only be put back before the first new one.
 * Also says so when edits are not kept: in a second tab, or when the browser's storage fails.
 */
export function RestorePrompt() {
  const journal = useJournal()
  if (journal.status === 'pending') {
    const count = journal.edits === 1 ? '1 unsaved edit' : `${journal.edits} unsaved edits`
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
            Restore your edits?
          </h2>
          <p id="restore-text" className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You have {count} from <Time value={journal.savedAt} primary="absolute" />. Restore them,
            or discard them and start fresh.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void answerRestore(false)}
              className={`${BUTTON} text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-zinc-800`}
            >
              Discard
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => void answerRestore(true)}
              className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-500`}
            >
              Restore
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (journal.status === 'locked' || journal.status === 'failed') {
    const text =
      journal.status === 'failed'
        ? `Edits are not kept across a reload: ${journal.message}`
        : 'This map is open in another tab. Edits made here are lost on reload.'
    return (
      <p
        role="status"
        className="absolute top-10 left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 shadow ring-1 ring-amber-900/10 dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-200/20"
      >
        {text}
      </p>
    )
  }
  return null
}
