import { createJournal, JournalLockedError } from '@osm-editor-kit/maid-journal'
import { useSyncExternalStore } from 'react'
import { config, editor } from './editor'

/**
 * Where the journal of unsaved edits stands:
 * - `checking`: looking for stored edits, nothing may be edited yet
 * - `pending`: there are stored edits, the person decides whether they come back
 * - `running`: every edit is written
 * - `locked`: another tab writes this journal, so this tab's edits are not kept
 * - `failed`: the browser's storage did not work, edits are not kept
 */
export type JournalState =
  | { status: 'checking' | 'running' | 'locked' }
  | { status: 'pending'; edits: number; savedAt: number }
  | { status: 'failed'; message: string }

// One journal per data source: edits made on a fixture must never be restored onto live data
const journal = createJournal({
  name: config.dev ? 'maid:osm-dev' : config.live ? 'maid:osm' : `maid:scene:${config.scene}`,
  context: editor.context,
  history: editor.history,
  onError: (error) => set({ status: 'failed', message: messageOf(error) }),
})

let state: JournalState = { status: 'checking' }
const listeners = new Set<() => void>()

function set(next: JournalState) {
  state = next
  for (const listener of listeners) listener()
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

let stop: (() => void) | undefined

async function start() {
  try {
    stop = await journal.start()
    set({ status: 'running' })
  } catch (error) {
    if (error instanceof JournalLockedError) set({ status: 'locked' })
    else set({ status: 'failed', message: messageOf(error) })
  }
}

async function check() {
  try {
    const pending = await journal.pending()
    if (pending) set({ status: 'pending', ...pending })
    else await start()
  } catch (error) {
    set({ status: 'failed', message: messageOf(error) })
  }
}

/** Answers the question the `pending` state asks: bring the stored edits back, or forget them */
export async function answerRestore(restore: boolean) {
  if (state.status !== 'pending') return
  set({ status: 'checking' })
  try {
    if (restore) await journal.restore()
    else await journal.clear()
  } catch (error) {
    set({ status: 'failed', message: messageOf(error) })
    return
  }
  await start()
}

export function useJournal() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** Forgets the stored edits after they were saved to the server. The page is reloaded after it. */
export async function forgetJournal() {
  await journal.flushed()
  stop?.()
  stop = undefined
  await journal.clear()
}

/** Resolves when everything edited so far is written. For the browser checks. */
export const journalFlushed = () => journal.flushed()

void check()
