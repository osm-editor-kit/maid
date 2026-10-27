import type { Editor } from '@osm-editor-kit/maid-core'
import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import { applyOption, diffOption, isApplied, type TaskOption } from '@osm-editor-kit/maid-tasks'
import { TagDiff } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { applyTaskOption } from './apply.ts'
import { Markdown } from './markdown.tsx'
import { m } from './messages.ts'
import { type TasksStore, useTasks } from './store.ts'

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'
const PRIMARY =
  'cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50'

/** The text of a status, for badges, counts and the filter */
export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'open':
      return m.tasks_status_open()
    case 'done':
      return m.tasks_status_done()
    case 'ignored':
      return m.tasks_status_ignored()
    case 'skipped':
      return m.tasks_status_skipped()
  }
}

const BADGE: Record<TaskStatus, string> = {
  open: 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
  ignored: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200',
  skipped: 'bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
}

/** A small label with the status of a task */
export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>
      {statusLabel(status)}
    </span>
  )
}

const ACTIONS: readonly { status: TaskStatus; label: () => string }[] = [
  { status: 'done', label: () => m.tasks_btn_done() },
  { status: 'ignored', label: () => m.tasks_btn_ignore() },
  { status: 'skipped', label: () => m.tasks_btn_skip() },
  { status: 'open', label: () => m.tasks_btn_reopen() },
]

/**
 * One task as the person works on it: title and status, the description, links, Mapillary links, the options (each
 * with the tag diff against the feature and an Apply button) and the status buttons. The inspector section and the
 * dock both use it. Without a feature (`entity` absent) the options are shown without Apply.
 */
export function TaskContent({
  store,
  index,
  entity,
  editor,
  readOnly,
  hasRefs,
}: {
  store: TasksStore
  index: number
  entity?: EntityInfo
  editor: Editor
  /** The filters' read-only answer for a feature (the dock and the inspector pass it) */
  readOnly?: (id: string) => boolean
  /** The task names OSM elements (so an absent `entity` means "not selected" and not "no feature") */
  hasRefs: boolean
}) {
  const task = useTasks(store, (state) => state.list?.file.features[index])
  const status = useTasks(store, (state) => state.statuses[index])
  const [message, setMessage] = useState<string>()
  if (!task || status === undefined) return null
  const p = task.properties
  const setStatus = (next: TaskStatus) => store.getState().actions.setStatus(index, next)

  const apply = (option: TaskOption) => {
    if (!entity) return
    const locked = entity.readOnly || (readOnly?.(entity.id) ?? false)
    const outcome = applyTaskOption(
      editor.history,
      entity.id,
      option,
      m.tasks_annotation({ label: option.label }),
      locked,
    )
    if (outcome.ok) {
      setMessage(undefined)
      setStatus('done')
    } else {
      setMessage(
        outcome.reason === 'read-only'
          ? m.tasks_read_only()
          : outcome.reason === 'missing'
            ? m.tasks_missing()
            : m.tasks_applied(),
      )
    }
  }

  return (
    <section
      data-testid={`tasks-content-${p.task_id}`}
      data-status={status}
      className="flex flex-col gap-3"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm/5 font-semibold break-words">{p.title}</h3>
        <StatusBadge status={status} />
      </header>
      <Markdown text={p.description} />
      {p.links && p.links.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {m.tasks_links()}
          </h4>
          <ul className="flex flex-col gap-0.5 text-sm">
            {p.links.map((link) => (
              <li key={link}>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600 underline dark:text-blue-400"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.mapillary && p.mapillary.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm">
          {p.mapillary.map((id) => (
            <li key={id}>
              <a
                href={`https://www.mapillary.com/app/?pKey=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline dark:text-blue-400"
              >
                {m.tasks_mapillary_link({ id })}
              </a>
            </li>
          ))}
        </ul>
      )}
      {p.options && p.options.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {m.tasks_options()}
          </h4>
          {!entity && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {hasRefs ? m.tasks_select_feature() : m.tasks_no_feature()}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {p.options.map((option) => (
              <OptionCard
                key={option.id}
                option={option}
                entity={entity}
                onApply={() => apply(option)}
              />
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p
          role="alert"
          data-testid="tasks-message"
          className="text-sm text-red-700 dark:text-red-300"
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((action) => (
          <button
            key={action.status}
            type="button"
            data-testid={`tasks-status-${action.status}`}
            data-task-id={p.task_id}
            aria-pressed={status === action.status}
            disabled={status === action.status}
            onClick={() => setStatus(action.status)}
            className={BUTTON}
          >
            {action.label()}
          </button>
        ))}
      </div>
    </section>
  )
}

function OptionCard({
  option,
  entity,
  onApply,
}: {
  option: TaskOption
  entity?: EntityInfo
  onApply: () => void
}) {
  const before = entity?.tags ?? {}
  const applied = entity ? isApplied(before, option) : false
  const changes = diffOption(before, option)
  return (
    <li
      data-testid={`tasks-option-${option.id}`}
      className="flex flex-col gap-1.5 rounded-lg border border-zinc-950/10 p-2.5 dark:border-white/15"
    >
      <div className="text-sm font-medium break-words">{option.label}</div>
      {option.description && <Markdown text={option.description} />}
      {!applied && changes.length > 0 && (
        <TagDiff before={before} after={applyOption(before, option)} />
      )}
      {entity &&
        (applied ? (
          <p
            data-testid={`tasks-applied-${option.id}`}
            className="text-xs text-emerald-700 dark:text-emerald-300"
          >
            {m.tasks_applied()}
          </p>
        ) : (
          <div>
            <button
              type="button"
              data-testid={`tasks-apply-${option.id}`}
              onClick={onApply}
              className={PRIMARY}
            >
              {m.tasks_apply()}
            </button>
          </div>
        ))}
    </li>
  )
}
