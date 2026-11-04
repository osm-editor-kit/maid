import type { Editor } from '@osm-editor-kit/maid-core'
import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import {
  actionOf,
  applyOption,
  createGeometryOf,
  deleteTargetsOf,
  diffOption,
  isApplied,
  type Task,
  type TaskOption,
} from '@osm-editor-kit/maid-tasks'
import { TagDiff } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import {
  applyTaskOption,
  createTaskFeature,
  deleteTaskFeatures,
  type DeleteOutcome,
} from './apply.ts'
import { entityIdOfRef } from './list.ts'
import { Markdown, type MarkdownContext, type OnOsmRef } from './markdown.tsx'
import { m } from './messages.ts'
import { type AppliedTask, type TasksStore, useTasks } from './store.ts'

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'
const DANGER =
  'cursor-pointer rounded-lg bg-red-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-default disabled:opacity-50'
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
  select,
}: {
  store: TasksStore
  index: number
  entity?: EntityInfo
  editor: Editor
  /** The filters' read-only answer for a feature (the dock and the inspector pass it) */
  readOnly?: (id: string) => boolean
  /** The task names OSM elements (so an absent `entity` means "not selected" and not "no feature") */
  hasRefs: boolean
  /** Selects a feature: an element reference in the text (`way/123`) calls it */
  select?: (selection: string | readonly string[] | null) => void
}) {
  const task = useTasks(store, (state) => state.list?.file.features[index])
  const status = useTasks(store, (state) => state.statuses[index])
  const applied = useTasks(store, (state) => state.applied)
  const [message, setMessage] = useState<string>()
  if (!task || status === undefined) return null
  const p = task.properties
  const setStatus = (next: TaskStatus) => store.getState().actions.setStatus(index, next)

  const refuse = (reason: Exclude<DeleteOutcome, { ok: true }>['reason']) =>
    setMessage(
      reason === 'read-only'
        ? m.tasks_read_only()
        : reason === 'missing'
          ? m.tasks_missing()
          : reason === 'applied'
            ? m.tasks_applied()
            : reason === 'part_of_relation'
              ? m.tasks_delete_part_of_relation()
              : reason === 'incomplete_relation'
                ? m.tasks_delete_incomplete()
                : m.tasks_delete_wikidata(),
    )
  const done = (change: AppliedTask['change'], option: TaskOption) => {
    setMessage(undefined)
    store.getState().actions.addApplied({ index, optionId: option.id, change, before: status })
    setStatus('done')
  }
  const annotation = (option: TaskOption) => m.tasks_annotation({ label: option.label })

  const apply = (option: TaskOption) => {
    const action = actionOf(option)
    if (action === 'create') {
      const geometry = createGeometryOf(task, option)
      if (!geometry) return
      const created = createTaskFeature(
        editor.history,
        geometry,
        option.set ?? {},
        annotation(option),
      )
      done({ kind: 'create', entityId: created.id }, option)
      return
    }
    if (action === 'delete') {
      const ids = deleteTargetsOf(task, option).map(entityIdOfRef)
      const outcome = deleteTaskFeatures(
        editor.history,
        ids,
        annotation(option),
        (id) => readOnly?.(id) ?? false,
      )
      if (outcome.ok) done({ kind: 'delete', entityIds: ids }, option)
      else refuse(outcome.reason)
      return
    }
    if (!entity) return
    const locked = entity.readOnly || (readOnly?.(entity.id) ?? false)
    const outcome = applyTaskOption(editor.history, entity.id, option, annotation(option), locked)
    if (outcome.ok) done({ kind: 'tag', entityId: entity.id, option }, option)
    else refuse(outcome.reason)
  }
  /** Whether this session applied a create or delete option of this task and it is still done */
  const appliedHere = (option: TaskOption) =>
    status === 'done' && applied.some((each) => each.index === index && each.optionId === option.id)
  const onOsm = select && ((ref: string) => select(entityIdOfRef(ref)))
  const hasTagOption = (p.options ?? []).some((option) => actionOf(option) === 'tag')

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
      <Markdown text={p.description} context={p} onOsm={onOsm} />
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
          {!entity && hasTagOption && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {hasRefs ? m.tasks_select_feature() : m.tasks_no_feature()}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {p.options.map((option) => (
              <OptionCard
                key={option.id}
                task={task}
                option={option}
                entity={entity}
                editor={editor}
                context={p}
                onOsm={onOsm}
                appliedHere={appliedHere(option)}
                taskDone={status === 'done'}
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

/** What a new feature becomes, from its geometry */
function createdKind(task: Task, option: TaskOption): string {
  const geometry = createGeometryOf(task, option)
  if (geometry?.type === 'Point') return m.tasks_creates_point()
  if (geometry?.type === 'Polygon') return m.tasks_creates_area()
  return m.tasks_creates_line()
}

function OptionCard({
  task,
  option,
  entity,
  editor,
  appliedHere,
  taskDone,
  onApply,
  context,
  onOsm,
}: {
  task: Task
  option: TaskOption
  entity?: EntityInfo
  editor: Editor
  context: MarkdownContext
  onOsm?: OnOsmRef
  /** A create or delete option this session applied (its edit has no state to compare with) */
  appliedHere: boolean
  /** A create or delete option of a done task is not offered: it would add or delete a second time */
  taskDone: boolean
  onApply: () => void
}) {
  const action = actionOf(option)
  const before = action === 'tag' ? (entity?.tags ?? {}) : {}
  const changes = action === 'delete' ? [] : diffOption(before, option)
  const applied = action === 'tag' ? (entity ? isApplied(before, option) : false) : appliedHere
  const blocked = action !== 'tag' && !applied && taskDone
  const canApply = action !== 'tag' || entity !== undefined
  const targets =
    action === 'delete'
      ? deleteTargetsOf(task, option).map((ref) => ({
          ref,
          entity: editor.history.staging.graph.hasEntity(entityIdOfRef(ref)),
        }))
      : []
  return (
    <li
      data-testid={`tasks-option-${option.id}`}
      data-action={action}
      className="flex flex-col gap-1.5 rounded-lg border border-zinc-950/10 p-2.5 dark:border-white/15"
    >
      <div className="text-sm font-medium break-words">{option.label}</div>
      {option.description && <Markdown text={option.description} context={context} onOsm={onOsm} />}
      {action === 'create' && !applied && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{createdKind(task, option)}</p>
      )}
      {action === 'delete' && !applied && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.tasks_deletes({ count: targets.length })}
          </p>
          <ul className="flex flex-col gap-1">
            {targets.map(({ ref, entity: target }) => (
              <li key={ref} className="flex flex-col gap-0.5 text-xs">
                <span className="font-mono">{ref}</span>
                {target ? (
                  <TagDiff before={target.tags} after={{}} />
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">{m.tasks_not_loaded()}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!applied && changes.length > 0 && (
        <TagDiff before={before} after={applyOption(before, option)} />
      )}
      {blocked && (
        <p
          data-testid={`tasks-done-${option.id}`}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {m.tasks_reopen_to_apply()}
        </p>
      )}
      {canApply &&
        !blocked &&
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
              className={action === 'delete' ? DANGER : PRIMARY}
            >
              {action === 'create'
                ? m.tasks_apply_create()
                : action === 'delete'
                  ? m.tasks_apply_delete()
                  : m.tasks_apply()}
            </button>
          </div>
        ))}
    </li>
  )
}
