import {
  changesAt,
  createJournal,
  JournalLockedError,
  type StoredEdits,
} from '@osm-editor-kit/maid-journal'
import { createOsmEntity, type ChangesSummary } from '@osm-editor-kit/maid-model'
import { discardedTags } from '@osm-editor-kit/maid-presets/default'
import { useSyncExternalStore } from 'react'
import { config, editor } from './editor'
import { toOsmChange, type OsmChange } from './save/osm-change'

/** What the dialog that asks about stored edits shows: built from the stored records, nothing restored */
export type RestoreSummary = {
  /** The stored edits: the steps the undo history gets back, including the undone ones */
  edits: number
  /** How many of them the person had undone before the reload */
  undone: number
  /** Milliseconds since the epoch of the last edit */
  savedAt: number
  /** The steps, oldest first: the history index of each, its annotation, and whether it is undone */
  steps: { index: number; annotation: string; undone: boolean }[]
  /** The features that the edits leave changed, as the save flyout would upload them */
  change: OsmChange
  /** How many features that is */
  features: number
  /** The name of the first of them that has one */
  name?: string
}

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
  | { status: 'pending'; summary: RestoreSummary }
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
    const stored = await journal.stored()
    if (stored) set({ status: 'pending', summary: summarize(stored) })
    else await start()
  } catch (error) {
    set({ status: 'failed', message: messageOf(error) })
  }
}

/** The stored edits as the dialog shows them: the features they leave changed, and the steps */
function summarize(stored: StoredEdits): RestoreSummary {
  const { context } = editor
  const changed = changesAt(stored.records, stored.pointer)
  const entities: ChangesSummary = { created: [], modified: [], deleted: [] }
  for (const { before, after } of changed) {
    if (after && before === null) entities.created.push(createOsmEntity(context, after))
    else if (after && before) entities.modified.push(createOsmEntity(context, after))
    else if (before) entities.deleted.push(createOsmEntity(context, before))
  }
  const change = toOsmChange(entities, discardedTags)
  const features = change.create.length + change.modify.length + change.delete.length
  const first = [...change.create, ...change.modify, ...change.delete].find((e) => e.tags.name)
  return {
    edits: stored.records.length,
    undone: stored.records.length - stored.pointer,
    savedAt: stored.savedAt,
    steps: stored.records.map((record) => ({
      index: record.index,
      annotation: typeof record.annotation === 'string' ? record.annotation : 'Edit',
      undone: record.index > stored.pointer,
    })),
    change,
    features,
    name: first?.tags.name,
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
