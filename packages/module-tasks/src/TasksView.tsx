import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import {
  FILTERS,
  countStatuses,
  entityIdsOfTask,
  type TasksFilter,
  nextOpenIndex,
  visibleIndexes,
} from './list.ts'
import { m } from './messages.ts'
import { goToTask } from './navigate.ts'
import type { Shared } from './shared.ts'
import { type SyncKind, type TasksStore, useTasks } from './store.ts'
import { StatusBadge, TaskContent, statusLabel } from './TaskContent.tsx'

/** Rows drawn at first and added by "Show more" (a list can hold 20 000 tasks) */
export const ROW_LIMIT = 200

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'

function filterLabel(filter: TasksFilter): string {
  return filter === 'all' ? m.tasks_filter_all() : statusLabel(filter)
}

/** The sync state as the short text the dock head shows */
export function syncText(kind: SyncKind, server: 'mock' | 'osm' | 'dev' | undefined): string {
  switch (kind) {
    case 'local':
      return m.tasks_sync_local()
    case 'saved':
      return server === 'mock'
        ? m.tasks_sync_saved_mock()
        : server === 'dev'
          ? m.tasks_sync_saved_dev()
          : m.tasks_sync_saved_osm()
    case 'pending':
    case 'saving':
      return m.tasks_sync_saving()
    case 'forbidden':
      return m.tasks_sync_forbidden()
    case 'failed':
      return m.tasks_sync_failed()
    case 'mismatch':
      return m.tasks_sync_mismatch()
    case 'conflict':
      return m.tasks_sync_conflict()
  }
}

/** The dock tab "Tasks": the list's head (title, progress, counts, filter, sync), the rows and the current task */
export function createTasksView(store: TasksStore, shared: Shared) {
  return function TasksView({ editor, select, selected, readOnly }: DockViewProps) {
    const list = useTasks(store, (state) => state.list)
    const error = useTasks(store, (state) => state.error)
    const loading = useTasks(store, (state) => state.loading)
    if (!list) {
      return (
        <div data-testid="tasks-view" className="flex flex-col gap-3 p-4 text-sm">
          {loading !== undefined && <p>{m.tasks_loading({ file: loading })}</p>}
          {error && <ErrorBanner store={store} />}
          {loading === undefined && !error && (
            <p className="text-zinc-500 dark:text-zinc-400">{m.tasks_empty()}</p>
          )}
        </div>
      )
    }
    return (
      <div
        data-testid="tasks-view"
        className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 text-sm"
      >
        {error && <ErrorBanner store={store} />}
        <Head store={store} shared={shared} select={select} />
        <Rows store={store} shared={shared} select={select} />
        <Current store={store} editor={editor} selected={selected} readOnly={readOnly} />
      </div>
    )
  }
}

function ErrorBanner({ store }: { store: TasksStore }) {
  const error = useTasks(store, (state) => state.error)
  if (!error) return null
  return (
    <div
      role="alert"
      data-testid="tasks-error"
      className="flex flex-col gap-1.5 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="font-medium">{m.tasks_error_title({ file: error.fileName })}</p>
      <ul className="font-mono text-xs break-all">
        {error.errors.slice(0, 5).map((item, index) => (
          <li key={index}>{`${item.path}: ${item.message}`}</li>
        ))}
      </ul>
      {(error.omitted !== undefined || error.errors.length > 5) && (
        <p className="text-xs">
          {m.tasks_error_more({ count: error.errors.length - 5 + (error.omitted ?? 0) })}
        </p>
      )}
      <div>
        <button
          type="button"
          data-testid="tasks-error-close"
          onClick={() => store.getState().actions.closeError()}
          className={BUTTON}
        >
          {m.tasks_error_close()}
        </button>
      </div>
    </div>
  )
}

function Head({
  store,
  shared,
  select,
}: {
  store: TasksStore
  shared: Shared
  select: DockViewProps['select']
}) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const filter = useTasks(store, (state) => state.filter)
  const current = useTasks(store, (state) => state.current)
  const sync = useTasks(store, (state) => state.sync)
  if (!list) return null
  const counts = countStatuses(statuses)
  const handled = counts.total - counts.open
  const next = nextOpenIndex(statuses, current)
  return (
    <header data-testid="tasks-head" className="flex flex-col gap-2">
      <h2 data-testid="tasks-title" className="text-base/6 font-semibold break-words">
        {list.file.maid_tasks.title}
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={handled}
        aria-label={m.tasks_progress({ done: handled, total: counts.total })}
        data-testid="tasks-progress"
        className="h-2 overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/15"
      >
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${counts.total === 0 ? 0 : (handled / counts.total) * 100}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {m.tasks_progress({ done: handled, total: counts.total })}
      </p>
      <ul data-testid="tasks-counts" className="flex flex-wrap gap-x-4 gap-y-1">
        {(['open', 'done', 'ignored', 'skipped'] as const).map((status) => (
          <li key={status}>
            <span data-testid={`tasks-count-${status}`} className="font-semibold tabular-nums">
              {counts[status]}
            </span>{' '}
            <span className="text-zinc-500 dark:text-zinc-400">{statusLabel(status)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">{m.tasks_filter_label()}</span>
          <select
            data-testid="tasks-filter"
            value={filter}
            onChange={(event) =>
              store.getState().actions.setFilter(event.target.value as TasksFilter)
            }
            className="rounded-lg border border-zinc-950/10 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-zinc-800"
          >
            {FILTERS.map((option) => (
              <option key={option} value={option}>
                {filterLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="tasks-next"
          disabled={next === undefined}
          title={next === undefined ? m.tasks_none_open() : undefined}
          onClick={() =>
            next !== undefined && goToTask({ store, select, engine: shared.engine }, next)
          }
          className={BUTTON}
        >
          {m.tasks_next()}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <span data-testid="tasks-sync" data-sync-kind={sync.kind} role="status">
          {syncText(sync.kind, sync.server)}
        </span>
        {(sync.kind === 'failed' || sync.kind === 'forbidden') && (
          <button
            type="button"
            data-testid="tasks-sync-retry"
            onClick={() => shared.retry?.()}
            className={BUTTON}
          >
            {m.tasks_sync_retry()}
          </button>
        )}
        {sync.kind === 'conflict' && (
          <button
            type="button"
            data-testid="tasks-sync-decide"
            onClick={() => store.getState().actions.setConflictOpen(true)}
            className={BUTTON}
          >
            {m.tasks_sync_decide()}
          </button>
        )}
      </div>
    </header>
  )
}

function Rows({
  store,
  shared,
  select,
}: {
  store: TasksStore
  shared: Shared
  select: DockViewProps['select']
}) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const filter = useTasks(store, (state) => state.filter)
  const current = useTasks(store, (state) => state.current)
  const [limit, setLimit] = useState({ key: '', rows: ROW_LIMIT })
  if (!list) return null
  // a new list or filter starts with the first rows again
  const key = `${list.listKey}:${filter}`
  const rows = limit.key === key ? limit.rows : ROW_LIMIT
  const indexes = visibleIndexes(statuses, filter)
  const shown = indexes.slice(0, rows)
  return (
    <div className="flex flex-col gap-1">
      {indexes.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">{m.tasks_no_rows()}</p>
      )}
      <ul data-testid="tasks-rows" className="flex flex-col">
        {shown.map((index) => {
          const task = list.file.features[index]
          const status: TaskStatus | undefined = statuses[index]
          if (!task || !status) return null
          const id = task.properties.task_id
          return (
            <li key={id}>
              <button
                type="button"
                data-testid={`tasks-row-${id}`}
                data-status={status}
                aria-current={current === index ? 'true' : undefined}
                onClick={() => goToTask({ store, select, engine: shared.engine }, index)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5 ${current === index ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
              >
                <span className="min-w-0 truncate">{task.properties.title}</span>
                <StatusBadge status={status} />
              </button>
            </li>
          )
        })}
      </ul>
      {indexes.length > shown.length && (
        <div>
          <button
            type="button"
            data-testid="tasks-show-more"
            onClick={() => setLimit({ key, rows: rows + ROW_LIMIT })}
            className={BUTTON}
          >
            {m.tasks_show_more({ count: indexes.length - shown.length })}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The current task in the dock, when the inspector does not show it: the task names no OSM element, or none of its
 * elements is selected.
 */
function Current({
  store,
  editor,
  selected,
  readOnly,
}: {
  store: TasksStore
  editor: DockViewProps['editor']
  selected: readonly string[]
  readOnly: DockViewProps['readOnly']
}) {
  const list = useTasks(store, (state) => state.list)
  const current = useTasks(store, (state) => state.current)
  const task = current === null ? undefined : list?.file.features[current]
  if (current === null || !task) return null
  const ids = entityIdsOfTask(task)
  if (ids.some((id) => selected.includes(id))) return null
  return (
    <div
      data-testid="tasks-current"
      className="flex flex-col gap-2 border-t border-zinc-950/10 pt-3 dark:border-white/15"
    >
      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{m.tasks_current()}</h3>
      <TaskContent
        // a new task starts without the message of the last one
        key={current}
        store={store}
        index={current}
        editor={editor}
        readOnly={readOnly}
        hasRefs={ids.length > 0}
      />
    </div>
  )
}
