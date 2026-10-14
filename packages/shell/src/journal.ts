import type { Editor } from '@osm-editor-kit/maid-core'
import {
  changesAt,
  createJournal,
  JournalLockedError,
  type StoredEdits,
} from '@osm-editor-kit/maid-journal'
import { createOsmEntity, type ChangesSummary } from '@osm-editor-kit/maid-model'
import { discardedTags } from '@osm-editor-kit/maid-presets'
import { useSyncExternalStore } from 'react'
import type { Config } from './config'
import { clearIgnoredIssues } from './modules/validation-ignored'
import { toOsmChange, type OsmChange } from './save/osm-change'
import { useShell } from './shell-context'

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

/**
 * The journal of one editor: starts at once, looks for stored edits and says what the dialog should ask.
 * `id` is the app's id: it prefixes the IndexedDB name.
 */
export function createShellJournal(id: string, config: Config, editor: Editor) {
  // One journal per data source: edits made on a fixture must never be restored onto live data
  const journal = createJournal({
    name:
      config.source === 'dev'
        ? `${id}:osm-dev`
        : config.source === 'osm'
          ? `${id}:osm`
          : `${id}:scene:${config.scene}`,
    context: editor.context,
    history: editor.history,
    onError: (error) => set({ status: 'failed', message: messageOf(error) }),
  })

  const holder: { state: JournalState; stop?: () => void } = { state: { status: 'checking' } }
  const listeners = new Set<() => void>()

  function set(next: JournalState) {
    holder.state = next
    for (const listener of listeners) listener()
  }

  function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  async function start() {
    try {
      holder.stop = await journal.start()
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
  async function answerRestore(restore: boolean) {
    if (holder.state.status !== 'pending') return
    set({ status: 'checking' })
    try {
      if (restore) await journal.restore()
      else {
        await journal.clear()
        clearIgnoredIssues()
      }
    } catch (error) {
      set({ status: 'failed', message: messageOf(error) })
      return
    }
    await start()
  }

  /** Resolves when everything edited so far is written. For the browser checks. */
  const journalFlushed = () => journal.flushed()

  void check()

  return {
    answerRestore,
    flushed: journalFlushed,
    getState: () => holder.state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShellJournal = ReturnType<typeof createShellJournal>

/** Where the journal stands, inside a component */
export function useJournal() {
  const { journal } = useShell()
  return useSyncExternalStore(journal.subscribe, journal.getState)
}
