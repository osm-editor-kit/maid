import { ArrowTopRightOnSquareIcon, ArrowUturnLeftIcon, CheckIcon } from '@heroicons/react/20/solid'
import type { Editor } from '@osm-editor-kit/maid-core'
import {
  COMPLETION_ACTIONS,
  type ShortcodeResponses,
  completionResponsesFor,
  isCommentTooLong,
  isTagFix,
  mustacheContextFromTask,
  parseShortcodes,
  pickNearest,
  pickPriority,
  resolveCandidatePool,
  resolveTagFix,
  shortcodeFields,
  tagFixOptions,
  TaskStatus,
  COMMENT_MAX_LENGTH,
  type MapRouletteTask,
} from '@osm-editor-kit/maid-maproulette'
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import {
  MAPROULETTE_BUTTON,
  MAPROULETTE_BUTTON_SECONDARY,
  MAPROULETTE_CARD,
  MAPROULETTE_FOOTER,
  MAPROULETTE_QUOTE,
  Markdown,
  TagDiff,
} from '@osm-editor-kit/maid-ui'
import { useEffect, useState } from 'react'
import { m } from './messages.ts'
import { goToTask, type Shared, taskUrl } from './shared.ts'
import { challengeName, shownStatus, tasksShown, useMapRoulette } from './store.ts'

type Select = (selection: string | readonly string[] | null) => void

/** The name of a status, in the person's language */
export function statusText(status: number): string {
  switch (status) {
    case TaskStatus.Fixed:
      return m.mr_status_fixed()
    case TaskStatus.FalsePositive:
      return m.mr_status_not_an_issue()
    case TaskStatus.Skipped:
      return m.mr_status_skipped()
    case TaskStatus.AlreadyFixed:
      return m.mr_status_already_fixed()
    case TaskStatus.TooHard:
      return m.mr_status_too_hard()
    case TaskStatus.Deleted:
    case TaskStatus.Disabled:
      return m.mr_status_closed()
    default:
      return m.mr_status_open()
  }
}

const ACTION_TEXT: Record<(typeof COMPLETION_ACTIONS)[number]['key'], () => string> = {
  fixed: () => m.mr_action_fixed(),
  alreadyFixed: () => m.mr_action_already_fixed(),
  notAnIssue: () => m.mr_action_not_an_issue(),
  cantComplete: () => m.mr_action_too_hard(),
}

/** A small label with a task's status, for a heading or a row */
export function StatusBadge({ status, queued }: { status: number; queued?: boolean }) {
  const open = status === TaskStatus.Created || status === TaskStatus.Skipped
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        open
          ? 'bg-teal-600/15 text-teal-800 dark:bg-teal-400/20 dark:text-teal-200'
          : status === TaskStatus.Fixed || status === TaskStatus.AlreadyFixed
            ? 'bg-emerald-600/15 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200'
            : 'bg-zinc-950/10 text-zinc-700 dark:bg-white/15 dark:text-zinc-200'
      }`}
    >
      {statusText(status)}
      {queued && <span className="font-normal">· {m.mr_queued_short()}</span>}
    </span>
  )
}

/**
 * One MapRoulette task: the challenge's instructions with the task's values, the OSM features it names, its tag fix,
 * how the status is sent, the status buttons, and once it is done the next task. Used by the dock view and by the
 * inspector section, so a task reads the same in both.
 */
export function TaskCard({
  shared,
  taskId,
  editor,
  select,
  readOnly,
}: {
  shared: Shared
  taskId: string
  editor: Editor
  select?: Select
  readOnly?: (id: string) => boolean
}) {
  const { store, controller } = shared
  const task = useMapRoulette(store, (state) => state.tasks[taskId])
  const detail = useMapRoulette(store, (state) => state.details[taskId])
  const challenge = useMapRoulette(store, (state) => {
    const parent = task?.parentId ?? (detail?.state === 'ready' ? detail.value.parentId : undefined)
    return parent === undefined ? undefined : state.challenges[String(parent)]
  })
  const finished = useMapRoulette(store, (state) => state.finished)
  const earmarks = useMapRoulette(store, (state) => state.earmarks)
  const timing = useMapRoulette(store, (state) => state.timing)
  const sending = useMapRoulette(store, (state) => state.sending[taskId])
  // the details (instructions, tag fix) and the challenge, once per task; the controller asks only once
  useEffect(() => {
    void controller.loadTask(taskId)
  }, [controller, taskId])
  const [comment, setComment] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({})

  const full: MapRouletteTask | undefined =
    detail?.state === 'ready' ? detail.value : (task as MapRouletteTask | undefined)
  const challengeValue = challenge?.state === 'ready' ? challenge.value : undefined
  const parentId = String(task?.parentId ?? full?.parentId ?? '')
  const instruction = full?.instruction?.trim() || challengeValue?.instruction || ''
  const context = full ? mustacheContextFromTask(full) : {}
  const tokens = parseShortcodes(instruction)
  const fields = shortcodeFields(tokens)
  const responses: ShortcodeResponses = completionResponsesFor(tokens, answers)
  const { status, queued } = shownStatus(
    { finished, earmarks },
    { id: taskId, status: full?.status },
  )
  const done = status !== TaskStatus.Created && status !== TaskStatus.Skipped
  const tagFix = isTagFix(full)
  const [option] = tagFixOptions(full)
  const graph = editor.history.staging.graph
  const fix = option ? resolveTagFix(option, (id) => graph.hasEntity(id)?.tags) : undefined
  const fixReady = fix !== undefined && fix.matched.length > 0
  const fixApplied = fixReady && fix.matched.every((row) => sameTags(row.before, row.after))
  const features = controller.featuresOf(taskId)
  const effectiveTiming = tagFix ? 'with_save' : timing

  if (!task && !full) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {detail?.state === 'failed' ? detail.reason : m.mr_task_loading()}
      </p>
    )
  }

  const finish = (statusCode: number) =>
    void controller.finish(taskId, statusCode, {
      ...(effectiveTiming === 'right_away' && comment.trim() ? { comment } : {}),
      responses,
    })

  return (
    <div data-testid="maproulette-task" className="flex flex-col gap-3 py-2 text-sm">
      {instruction && (
        <div className={MAPROULETTE_QUOTE}>
          <Markdown text={instruction} context={context} onOsm={(ref) => select?.(shortId(ref))} />
        </div>
      )}
      {fields.length > 0 && !done && (
        <div className="flex flex-col gap-2">
          {fields.map((field) =>
            field.type === 'select' ? (
              <label key={field.name} className="flex flex-col gap-1">
                <span className="font-medium">{field.label}</span>
                <select
                  className="rounded-md border border-zinc-950/10 bg-white px-2 py-1 dark:border-white/10 dark:bg-zinc-950"
                  value={
                    typeof answers[field.name] === 'string' ? (answers[field.name] as string) : ''
                  }
                  onChange={(event) => setAnswers({ ...answers, [field.name]: event.target.value })}
                >
                  <option value="">{m.mr_choose()}</option>
                  {field.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label key={field.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={answers[field.name] === true}
                  onChange={(event) =>
                    setAnswers({ ...answers, [field.name]: event.target.checked })
                  }
                />
                <span>{field.label}</span>
              </label>
            ),
          )}
        </div>
      )}
      {features.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">{m.mr_features()}</span>
          {features.slice(0, 8).map((id) => (
            <button
              key={id}
              type="button"
              className="cursor-pointer rounded-full bg-white/80 px-2 py-0.5 font-mono ring-1 ring-teal-700/20 hover:bg-white dark:bg-zinc-900/70 dark:ring-teal-300/20"
              onClick={() => select?.(id)}
            >
              {longId(id)}
            </button>
          ))}
        </div>
      )}
      {tagFix && option && !done && (
        <div className={`flex flex-col gap-2 rounded-lg p-2 ${MAPROULETTE_CARD}`}>
          <p className="font-medium">{m.mr_tag_fix_title()}</p>
          {fix && fix.matched.length > 0 ? (
            fix.matched.map((row) => (
              <div key={row.entityId} className="flex flex-col gap-1">
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {longId(row.entityId)}
                </span>
                <TagDiff before={row.before} after={row.after} />
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.mr_tag_fix_not_loaded()}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={MAPROULETTE_BUTTON}
              disabled={
                !fixReady || fixApplied || fix.matched.some((row) => readOnly?.(row.entityId))
              }
              onClick={() => {
                if (!fix) return
                for (const row of fix.matched)
                  editor.history.perform(actionChangeTags(row.entityId, row.after))
                editor.history.commit({
                  annotation: m.mr_tag_fix_annotation(),
                  selectedIDs: fix.matched.map((row) => row.entityId),
                })
                finish(TaskStatus.Fixed)
              }}
            >
              {m.mr_tag_fix_accept()}
            </button>
            <button
              type="button"
              className={MAPROULETTE_BUTTON_SECONDARY}
              onClick={() => finish(TaskStatus.FalsePositive)}
            >
              {m.mr_tag_fix_reject()}
            </button>
          </div>
        </div>
      )}
      {done ? (
        <DoneState
          shared={shared}
          taskId={taskId}
          status={status}
          queued={queued}
          select={select}
        />
      ) : (
        <div className={`flex flex-col gap-2 ${MAPROULETTE_FOOTER}`}>
          {!tagFix && (
            <div role="radiogroup" aria-label={m.mr_timing_label()} className="flex gap-1 text-xs">
              {(['with_save', 'right_away'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={timing === value}
                  onClick={() => controller.setTiming(value)}
                  className={`cursor-pointer rounded-md px-2 py-1 font-medium ${
                    timing === value
                      ? 'bg-teal-600 text-white dark:bg-teal-500'
                      : 'text-teal-900 hover:bg-white/60 dark:text-teal-100 dark:hover:bg-white/10'
                  }`}
                >
                  {value === 'with_save' ? m.mr_timing_with_save() : m.mr_timing_right_away()}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            {tagFix
              ? m.mr_timing_tag_fix()
              : effectiveTiming === 'with_save'
                ? m.mr_timing_with_save_hint()
                : m.mr_timing_right_away_hint()}
          </p>
          {effectiveTiming === 'right_away' && (
            <textarea
              rows={2}
              maxLength={COMMENT_MAX_LENGTH}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={m.mr_comment_placeholder()}
              aria-label={m.mr_comment_placeholder()}
              className="w-full rounded-md border border-zinc-950/10 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-zinc-950"
            />
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {COMPLETION_ACTIONS.filter(
              (action) => !(action.key === 'fixed' && tagFix && fixReady),
            ).map((action) => (
              <button
                key={action.key}
                type="button"
                disabled={sending === 'sending' || isCommentTooLong(comment)}
                onClick={() => finish(action.status)}
                className={
                  action.key === 'fixed' ? MAPROULETTE_BUTTON : MAPROULETTE_BUTTON_SECONDARY
                }
              >
                {ACTION_TEXT[action.key]()}
              </button>
            ))}
          </div>
          {sending === 'sending' && <p className="text-xs">{m.mr_sending()}</p>}
          {sending !== undefined && sending !== 'sending' && (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
              {sending.failed}{' '}
              {sending.unauthorized && (
                <a
                  className="underline"
                  href={`${shared.siteUrl}/user/profile`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.mr_login_link()}
                </a>
              )}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {challengeValue?.name ??
            challengeName(store.getState(), parentId) ??
            m.mr_challenge_number({ id: parentId })}{' '}
          · {m.mr_task_number({ id: taskId })}
        </span>
        {parentId && (
          <a
            className="inline-flex items-center gap-1 underline"
            href={taskUrl(shared, parentId, taskId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m.mr_view_on_maproulette()}
            <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

/** A done task: what happened to it, Undo while it waits for the upload, and the next tasks */
function DoneState({
  shared,
  taskId,
  status,
  queued,
  select,
}: {
  shared: Shared
  taskId: string
  status: number
  queued: boolean
  select?: Select
}) {
  const { store, controller } = shared
  const tasks = useMapRoulette(store, (state) => state.tasks)
  const challengeId = useMapRoulette(store, (state) => state.challengeId)
  const finished = useMapRoulette(store, (state) => state.finished)
  const earmarks = useMapRoulette(store, (state) => state.earmarks)
  const view = useMapRoulette(store, (state) => state.view)
  const task = tasks[taskId]
  const here = view?.center ?? (task ? ([task.point.lng, task.point.lat] as const) : undefined)
  // the candidates: the open tasks that are still open here (not finished or waiting for the upload)
  const candidates = tasksShown({ tasks, challengeId: null })
    .filter(
      (t) => !shownStatus({ finished, earmarks }, t).queued && finished[String(t.id)] === undefined,
    )
    .map((t) => ({ ...t, loc: controller.locationOf(String(t.id)) ?? null }))
  const preferred = challengeId ?? (task ? String(task.parentId) : null)
  const pool = resolveCandidatePool(candidates, {
    preferredChallengeIds: preferred ? [preferred] : [],
    excludeId: taskId,
  })
  const nearest = here && pool.mode !== 'empty' ? pickNearest(pool.tasks, [here[0], here[1]]) : null
  const priority =
    here && pool.mode === 'primary' ? pickPriority(pool.tasks, [here[0], here[1]]) : null
  const go = (id: string) => goToTask(shared, id, select)
  return (
    <div className={`flex flex-col gap-2 ${MAPROULETTE_FOOTER}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <CheckIcon aria-hidden="true" className="size-4 text-emerald-600 dark:text-emerald-400" />
        {queued
          ? m.mr_done_queued({ status: statusText(status) })
          : m.mr_done_sent({ status: statusText(status) })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {nearest && (
          <button
            type="button"
            className={MAPROULETTE_BUTTON}
            onClick={() => go(String(nearest.id))}
          >
            {m.mr_next_nearest()}
          </button>
        )}
        {priority && String(priority.id) !== String(nearest?.id) && (
          <button
            type="button"
            className={MAPROULETTE_BUTTON_SECONDARY}
            onClick={() => go(String(priority.id))}
          >
            {m.mr_next_priority()}
          </button>
        )}
        {queued && (
          <button
            type="button"
            className={`${MAPROULETTE_BUTTON_SECONDARY} inline-flex items-center gap-1`}
            onClick={() => controller.undo(taskId)}
          >
            <ArrowUturnLeftIcon aria-hidden="true" className="size-4" />
            {m.mr_undo()}
          </button>
        )}
      </div>
      {!nearest && <p className="text-xs">{m.mr_no_next()}</p>}
    </div>
  )
}

function sameTags(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => a[key] === b[key])
}

/** `w123` as `way/123`, as MapRoulette writes it */
export function longId(id: string) {
  return id.replace(/^w/, 'way/').replace(/^n/, 'node/').replace(/^r/, 'relation/')
}

/** `way/123` as `w123`, as Maid's data has it */
function shortId(ref: string) {
  return ref
    .replace(/^way\//, 'w')
    .replace(/^node\//, 'n')
    .replace(/^relation\//, 'r')
}
