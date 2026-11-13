import {
  applyMapRouletteChangesetTags,
  type ChangesetTask,
  earmarksForUpload,
  listEarmarks,
} from '@osm-editor-kit/maid-maproulette'
import { MAPROULETTE_SURFACE } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { RouletteIcon } from './RouletteIcon.tsx'
import type { Shared } from './shared.ts'
import { useMapRoulette } from './store.ts'
import { statusText } from './TaskCard.tsx'

/**
 * The block of the save form (`changeset.tags` component): the tasks this upload reports to MapRoulette, each with a
 * box to leave it out, as the upload sidebar of Tobias's iD fork. Nothing when no task waits.
 */
export function createSaveBlock(shared: Shared) {
  const { store, controller } = shared
  return function MapRouletteSaveBlock() {
    const earmarks = useMapRoulette(store, (state) => state.earmarks)
    const token = useMapRoulette(store, (state) => state.token)
    const rows = listEarmarks(earmarks)
    if (rows.length === 0) return null
    const included = earmarksForUpload(earmarks).length
    return (
      <section
        data-testid="maproulette-save"
        aria-label={m.mr_save_title()}
        className={`flex flex-col gap-1.5 rounded-lg px-3 py-2 ${MAPROULETTE_SURFACE}`}
      >
        <h3 className="flex items-center gap-1.5 font-medium">
          <RouletteIcon className="size-4 text-teal-700 dark:text-teal-300" />
          {m.mr_save_title()}
        </h3>
        <ul className="flex max-h-36 flex-col gap-0.5 overflow-y-auto text-xs">
          {rows.map((earmark) => (
            <li key={earmark.taskId}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={earmark.includeInUpload}
                  onChange={(event) => controller.include(earmark.taskId, event.target.checked)}
                />
                <span className="min-w-0 truncate">
                  {earmark.title || m.mr_task_number({ id: earmark.taskId })}
                  {earmark.parentName ? ` · ${earmark.parentName}` : ''}
                </span>
                <span className="ml-auto shrink-0 font-medium">{statusText(earmark.status)}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          {token ? m.mr_save_hint({ count: included }) : m.mr_save_no_login({ count: included })}
        </p>
      </section>
    )
  }
}

/** The tasks of the upload, with their challenges and details, for the changeset's comment, source and tags */
function changesetTasks(shared: Shared): ChangesetTask[] {
  const state = shared.store.getState()
  return earmarksForUpload(state.earmarks).map((earmark) => {
    const challenge = state.challenges[earmark.challengeId]
    const detail = state.details[earmark.taskId]
    return {
      taskId: earmark.taskId,
      status: earmark.status,
      challenge: challenge?.state === 'ready' ? challenge.value : null,
      task: detail?.state === 'ready' ? detail.value : state.tasks[earmark.taskId],
    }
  })
}

/**
 * What MapRoulette adds to the changeset: the challenges' check-in comment and source to start the form with, the
 * `#maproulette` hashtag, and the `closed:maproulette*` tags with the task ids, as iD's fork does.
 */
export function changesetContribution(shared: Shared) {
  const result = () => {
    const tasks = changesetTasks(shared)
    return tasks.length === 0 ? undefined : applyMapRouletteChangesetTags({ tags: {}, tasks }).tags
  }
  return {
    tags: () => {
      const tags = result()
      if (!tags) return {}
      // the comment, source and hashtags are the form's (comment() and source() below start it); the rest is ours
      const { comment: _c, source: _s, hashtags: _h, ...own } = tags
      return own
    },
    // the challenges' comment with #maproulette in it, so the hashtag reaches the changeset's hashtags (the shell
    // reads them from the comment)
    comment: () => {
      const tags = result()
      if (!tags) return undefined
      const comment = tags.comment?.trim() ?? ''
      return /#maproulette\b/i.test(comment) ? comment : `${comment} #maproulette`.trim()
    },
    source: () => result()?.source,
  }
}
