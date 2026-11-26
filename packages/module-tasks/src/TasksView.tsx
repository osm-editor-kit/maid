import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import { type DockViewProps, notify, TASKS_SURFACE } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  FILTERS,
  countStatuses,
  entityIdsOfTask,
  ignoredTasks,
  type TasksFilter,
  nextOpenIndex,
  visibleIndexes,
} from './list.ts'
import { m } from './messages.ts'
import { goToTask } from './navigate.ts'
import type { Shared } from './shared.ts'
import { type SyncKind, type TasksStore, useTasks } from './store.ts'
import { StatusBadge, TaskContent, TaskLinks, statusLabel } from './TaskContent.tsx'

/** Rows drawn at first and added by "Show more" (a list can hold 20 000 tasks) */
export const ROW_LIMIT = 200

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'

/** A button in the list's head: small, the head stays short */
const SMALL_BUTTON =
  'cursor-pointer rounded-md border border-zinc-950/10 px-1.5 py-0.5 text-xs hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/15 dark:hover:bg-white/5'

function filterLabel(filter: TasksFilter): string {
  return filter === 'all' ? m.tasks_filter_all() : statusLabel(filter)
}

/** The ignored tasks as JSON text, for a chat or a script that makes the next list (`ignoredTasks`) */
function ignoredText(
  file: Parameters<typeof ignoredTasks>[0],
  statuses: Parameters<typeof ignoredTasks>[1],
) {
  return `${JSON.stringify(ignoredTasks(file, statuses), null, 2)}\n`
}

function copyIgnored(text: string) {
  navigator.clipboard.writeText(text).then(
    () => notify.done(m.tasks_ignored_copied()),
    (error: unknown) => notify.failed(error),
  )
}

/** Saves the text as a file through a temporary link: no request, the data stays in the browser */
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * "Use this version in the account", for a mismatch: the account's copy of the list belongs to another version of the
 * file and cannot be read with this one. The second click replaces it (the account's statuses of the other version are
 * then gone), so the first one only asks.
 */
function ReplaceRemoteButton({ onReplace }: { onReplace: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <button
      type="button"
      data-testid="tasks-sync-replace"
      title={m.tasks_sync_replace_hint()}
      onClick={() => {
        if (!asking) {
          setAsking(true)
          return
        }
        setAsking(false)
        onReplace()
      }}
      className={asking ? `${SMALL_BUTTON} bg-red-600 text-white hover:bg-red-700` : SMALL_BUTTON}
    >
      {asking ? m.tasks_sync_replace_confirm() : m.tasks_sync_replace()}
    </button>
  )
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
        <div
          data-testid="tasks-view"
          className={`flex flex-col gap-3 p-4 text-sm ${TASKS_SURFACE}`}
        >
          {loading !== undefined && <p>{m.tasks_loading({ file: loading })}</p>}
          {error && <ErrorBanner store={store} />}
          {loading === undefined && !error && (
            <p className="text-zinc-500 dark:text-zinc-400">{m.tasks_empty()}</p>
          )}
        </div>
      )
    }
    return (
      // two columns from md up: the list with its head on the left, the current task on the right, each scrolling on
      // its own, so the task stays in view while the map is clicked elsewhere (Tobias, 2026-11-26). Narrower, one
      // column that scrolls as a whole.
      <div
        data-testid="tasks-view"
        className={`flex h-full min-h-0 flex-col overflow-y-auto text-sm md:overflow-hidden ${TASKS_SURFACE}`}
      >
        {error && (
          <div className="shrink-0 p-4 pb-0">
            <ErrorBanner store={store} />
          </div>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-[minmax(0,1fr)]">
          <section
            aria-label={m.tasks_list_label()}
            data-testid="tasks-list"
            className="flex min-h-0 flex-col border-zinc-950/10 md:border-r dark:border-white/15"
          >
            {/* the head stays while the rows scroll under it */}
            <div className="shrink-0 border-b border-zinc-950/10 px-4 py-2.5 dark:border-white/15">
              <Head store={store} shared={shared} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-3">
              <Rows store={store} shared={shared} select={select} />
            </div>
          </section>
          <section
            aria-label={m.tasks_detail_label()}
            data-testid="tasks-detail"
            className="flex min-h-0 flex-col border-t border-zinc-950/10 md:border-t-0 dark:border-white/15"
          >
            <Detail
              store={store}
              shared={shared}
              editor={editor}
              selected={selected}
              readOnly={readOnly}
              select={select}
            />
          </section>
        </div>
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

function Head({ store, shared }: { store: TasksStore; shared: Shared }) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const filter = useTasks(store, (state) => state.filter)
  const sync = useTasks(store, (state) => state.sync)
  if (!list) return null
  const counts = countStatuses(statuses)
  const handled = counts.total - counts.open
  // compact: the head stays above the rows in a low dock, so it takes as few lines as it can
  return (
    <header data-testid="tasks-head" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2
          data-testid="tasks-title"
          className="min-w-0 truncate text-sm/5 font-semibold"
          title={list.file.maid_tasks.title}
        >
          {list.file.maid_tasks.title}
        </h2>
        <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {m.tasks_progress({ done: handled, total: counts.total })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={handled}
        aria-label={m.tasks_progress({ done: handled, total: counts.total })}
        data-testid="tasks-progress"
        className="h-1.5 overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/15"
      >
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${counts.total === 0 ? 0 : (handled / counts.total) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <ul data-testid="tasks-counts" className="flex flex-wrap gap-x-3">
          {(['open', 'done', 'ignored', 'skipped'] as const).map((status) => (
            <li key={status}>
              <span data-testid={`tasks-count-${status}`} className="font-semibold tabular-nums">
                {counts[status]}
              </span>{' '}
              <span className="text-zinc-500 dark:text-zinc-400">{statusLabel(status)}</span>
            </li>
          ))}
        </ul>
        <label className="ml-auto flex items-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">{m.tasks_filter_label()}</span>
          <select
            data-testid="tasks-filter"
            value={filter}
            onChange={(event) =>
              store.getState().actions.setFilter(event.target.value as TasksFilter)
            }
            className="rounded-md border border-zinc-950/10 bg-transparent px-1.5 py-0.5 dark:border-white/15 dark:bg-zinc-800"
          >
            {FILTERS.map((option) => (
              <option key={option} value={option}>
                {filterLabel(option)}
              </option>
            ))}
          </select>
        </label>
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
            className={SMALL_BUTTON}
          >
            {m.tasks_sync_retry()}
          </button>
        )}
        {sync.kind === 'mismatch' && (
          <ReplaceRemoteButton onReplace={() => shared.replaceRemote?.()} />
        )}
        {sync.kind === 'conflict' && (
          <button
            type="button"
            data-testid="tasks-sync-decide"
            onClick={() => store.getState().actions.setConflictOpen(true)}
            className={SMALL_BUTTON}
          >
            {m.tasks_sync_decide()}
          </button>
        )}
        {counts.ignored > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              data-testid="tasks-ignored-copy"
              title={m.tasks_ignored_copy_hint()}
              onClick={() => copyIgnored(ignoredText(list.file, statuses))}
              className={SMALL_BUTTON}
            >
              {m.tasks_ignored_copy()}
            </button>
            <button
              type="button"
              data-testid="tasks-ignored-download"
              title={m.tasks_ignored_download_hint()}
              onClick={() =>
                downloadText(
                  `${list.file.maid_tasks.list_id}-ignored.json`,
                  ignoredText(list.file, statuses),
                )
              }
              className={SMALL_BUTTON}
            >
              {m.tasks_ignored_download()}
            </button>
          </span>
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
  const currentRow = useRef<HTMLButtonElement>(null)
  // the current task's row stays in view in the scrolling list: a pick on the map or "Next open task" moves it there
  useEffect(
    function showTheCurrentRow() {
      currentRow.current?.scrollIntoView({ block: 'nearest' })
    },
    [current],
  )
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
                ref={current === index ? currentRow : undefined}
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

const NO_SUBSCRIPTION = () => () => {}
const NO_VERSION = () => 0

/**
 * The engine's version, as an external store: it moves on every edit and when data loads, so the task's feature and
 * the option diffs follow Apply, undo, a change in the inspector and a way that arrives after the task was picked.
 */
function useEngineVersion(engine: Shared['engine']): number {
  return useSyncExternalStore(
    engine?.subscribe ?? NO_SUBSCRIPTION,
    engine?.getVersion ?? NO_VERSION,
    engine?.getVersion ?? NO_VERSION,
  )
}

/**
 * The feature a task's options apply to in the dock: the task's feature that is selected, or else its first one that
 * is loaded. So Apply works while something else is selected on the map.
 */
function taskTarget(
  engine: Shared['engine'],
  ids: readonly string[],
  selected: readonly string[],
  // the engine's version it is read at: passed so that a new version reads it again (React Compiler memoizes on it)
  version: number,
): EntityInfo | undefined {
  if (!engine || version < 0) return undefined
  const id = ids.find((each) => selected.includes(each)) ?? ids.find((each) => engine.entity(each))
  return id === undefined ? undefined : engine.entity(id)
}

/**
 * The current task, beside the list: its heading with "Show on map" and "Next open task" stays, the description, the
 * actions and the closing buttons scroll under it. All the work on a task happens here, whatever is selected on the
 * map; the inspector only points here (TaskSection). Without a current task it offers the next open one.
 */
function Detail({
  store,
  shared,
  editor,
  selected,
  readOnly,
  select,
}: {
  store: TasksStore
  shared: Shared
  editor: DockViewProps['editor']
  selected: readonly string[]
  readOnly: DockViewProps['readOnly']
  select: DockViewProps['select']
}) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const current = useTasks(store, (state) => state.current)
  const version = useEngineVersion(shared.engine)
  const next = nextOpenIndex(statuses, current)
  const go = (index: number) => goToTask({ store, select, engine: shared.engine }, index)
  const nextButton = (
    <button
      type="button"
      data-testid="tasks-next"
      disabled={next === undefined}
      title={next === undefined ? m.tasks_none_open() : undefined}
      onClick={() => next !== undefined && go(next)}
      className={BUTTON}
    >
      {m.tasks_next()}
    </button>
  )
  const task = current === null ? undefined : list?.file.features[current]
  const status = current === null ? undefined : statuses[current]
  if (current === null || !task || status === undefined) {
    return (
      <div data-testid="tasks-current-none" className="flex flex-col items-start gap-3 p-4">
        <p className="text-zinc-500 dark:text-zinc-400">{m.tasks_detail_empty()}</p>
        {nextButton}
      </div>
    )
  }
  const ids = entityIdsOfTask(task)
  const target = taskTarget(shared.engine, ids, selected, version)
  const onTask = ids.length > 0 && ids.every((id) => selected.includes(id))
  return (
    <div data-testid="tasks-current" className="flex min-h-0 flex-1 flex-col">
      {/* the heading stays while the task scrolls under it */}
      <header className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-950/10 px-4 py-2.5 dark:border-white/15">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm/5 font-semibold break-words">{task.properties.title}</h3>
          <span className="flex shrink-0 items-center gap-1">
            <TaskLinks task={task} />
            <StatusBadge status={status} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="tasks-show"
            // selects the task's feature again and moves the map to it, after clicks elsewhere on the map
            onClick={() => go(current)}
            className={BUTTON}
            aria-pressed={onTask}
          >
            {ids.length > 0 ? m.tasks_select_task_feature() : m.tasks_show_task()}
          </button>
          {nextButton}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <TaskContent
          // a new task starts without the message of the last one
          key={current}
          store={store}
          index={current}
          entity={target}
          editor={editor}
          readOnly={readOnly}
          hasRefs={ids.length > 0}
          select={select}
          hover={(id) => shared.engine?.setHover(id)}
          headed={false}
        />
      </div>
    </div>
  )
}
