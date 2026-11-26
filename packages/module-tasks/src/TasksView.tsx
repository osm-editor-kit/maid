import {
  ChevronLeftIcon,
  EllipsisHorizontalIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/20/solid'
import type { TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
import type { EntityInfo } from '@osm-editor-kit/maid-renderer'
import { type DockViewProps, Flyout, notify, TASKS_SURFACE } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  countStatuses,
  entityIdsOfTask,
  ignoredTasks,
  type TasksFilter,
  nextOpenIndex,
  visibleIndexes,
} from './list.ts'
import { ListOverview } from './ListOverview.tsx'
import { m } from './messages.ts'
import { goToTask } from './navigate.ts'
import { nextNearIndex, taskShape } from './next.ts'
import { forgetList, type OpenDeps } from './open.ts'
import { refreshKept, setBrowsing, useOverview } from './overview.ts'
import { type Shared, useSharedEngine } from './shared.ts'
import { type SyncKind, type TasksStore, useTasks } from './store.ts'
import { StatusBadge, TaskContent, TaskLinks, statusLabel } from './TaskContent.tsx'

/** Rows drawn at first and added by "Show more" (a list can hold 20 000 tasks) */
export const ROW_LIMIT = 200

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'

/** A button in the list's head: small, the head stays short */
const SMALL_BUTTON =
  'cursor-pointer rounded-md border border-zinc-950/10 px-1.5 py-0.5 text-xs hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/15 dark:hover:bg-white/5'

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
export function createTasksView(store: TasksStore, shared: Shared, deps?: OpenDeps) {
  return function TasksView({ editor, select, selected, readOnly }: DockViewProps) {
    const list = useTasks(store, (state) => state.list)
    const error = useTasks(store, (state) => state.error)
    const loading = useTasks(store, (state) => state.loading)
    const browsing = useOverview((state) => state.browsing)
    // the overview of the lists: without an open list, or asked for with "<" beside the list's title
    if (deps && ((!list && loading === undefined && !error) || (list && browsing))) {
      return (
        <div data-testid="tasks-view" className={`h-full min-h-0 overflow-y-auto ${TASKS_SURFACE}`}>
          <ListOverview deps={deps} />
        </div>
      )
    }
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
              <Head store={store} shared={shared} deps={deps} />
            </div>
            <div data-tasks-rows className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-3">
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

function Head({ store, shared, deps }: { store: TasksStore; shared: Shared; deps?: OpenDeps }) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const filter = useTasks(store, (state) => state.filter)
  const sync = useTasks(store, (state) => state.sync)
  if (!list) return null
  const counts = countStatuses(statuses)
  const handled = counts.total - counts.open
  const setFilter = (next: TasksFilter) => store.getState().actions.setFilter(next)
  // the sync states that need the person: shown as a callout, not as a quiet line
  const trouble =
    sync.kind === 'failed' ||
    sync.kind === 'forbidden' ||
    sync.kind === 'conflict' ||
    sync.kind === 'mismatch'
  // compact: the head stays above the rows in a low dock, so it takes as few lines as it can
  return (
    <header data-testid="tasks-head" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {deps && (
          <button
            type="button"
            data-testid="tasks-to-overview"
            aria-label={m.tasks_overview_title()}
            title={m.tasks_overview_title()}
            onClick={() => setBrowsing(true)}
            className="-ml-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ChevronLeftIcon aria-hidden="true" className="size-5" />
          </button>
        )}
        <h2
          data-testid="tasks-title"
          className="min-w-0 flex-1 truncate text-sm/5 font-semibold"
          title={list.file.maid_tasks.title}
        >
          {list.file.maid_tasks.title}
        </h2>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {m.tasks_progress({ done: handled, total: counts.total })}
          </span>
          <ListMenu store={store} deps={deps} />
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
      {/* the counts are the filter: one at a time, "show all" goes back (Tobias, 2026-11-26) */}
      <div className="flex flex-wrap items-center gap-1 text-xs" data-testid="tasks-counts">
        {(['open', 'done', 'ignored', 'skipped'] as const).map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filter === status}
            data-testid={`tasks-filter-${status}`}
            onClick={() => setFilter(filter === status ? 'all' : status)}
            className={`cursor-pointer rounded-md px-1.5 py-0.5 focus-visible:outline-2 focus-visible:outline-blue-500 ${
              filter === status
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
            }`}
          >
            <span data-testid={`tasks-count-${status}`} className="font-semibold tabular-nums">
              {counts[status]}
            </span>{' '}
            <span className={filter === status ? '' : 'text-zinc-500 dark:text-zinc-400'}>
              {statusLabel(status)}
            </span>
          </button>
        ))}
        {filter !== 'all' && (
          <button
            type="button"
            data-testid="tasks-filter-all"
            onClick={() => setFilter('all')}
            className={`ml-auto ${SMALL_BUTTON}`}
          >
            {m.tasks_filter_show_all()}
          </button>
        )}
      </div>
      <div
        role={trouble ? 'alert' : 'status'}
        data-testid="tasks-sync-box"
        className={
          trouble
            ? `flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs ${
                sync.kind === 'mismatch' || sync.kind === 'conflict'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
              }`
            : 'flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300'
        }
      >
        <span data-testid="tasks-sync" data-sync-kind={sync.kind}>
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
      </div>
    </header>
  )
}

/** A row of the list's menu */
const MENU_ROW =
  'flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:hover:bg-white/10'

/**
 * "⋯" beside the list's title: what belongs to the whole list, in one place (Tobias, 2026-11-26): copy or download the
 * ignored tasks (for whoever makes the next list), and delete the list from this browser (a second click confirms).
 */
function ListMenu({ store, deps }: { store: TasksStore; deps?: OpenDeps }) {
  const list = useTasks(store, (state) => state.list)
  const statuses = useTasks(store, (state) => state.statuses)
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  if (!list) return null
  const ignored = countStatuses(statuses).ignored
  const close = () => {
    setOpen(false)
    setAsking(false)
  }
  const forget = () => {
    if (!asking) {
      setAsking(true)
      return
    }
    close()
    const { listKey } = list
    store.getState().actions.close()
    if (deps) void forgetList(deps, listKey).then(() => refreshKept(deps))
  }
  return (
    <Flyout
      label={m.tasks_list_menu()}
      placement="bottom-end"
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      className="w-64 p-1"
      trigger={
        <button
          type="button"
          data-testid="tasks-list-menu"
          aria-label={m.tasks_list_menu()}
          title={m.tasks_list_menu()}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <EllipsisHorizontalIcon aria-hidden="true" className="size-5" />
        </button>
      }
    >
      <div className="flex flex-col">
        <button
          type="button"
          data-testid="tasks-ignored-copy"
          disabled={ignored === 0}
          title={m.tasks_ignored_copy_hint()}
          onClick={() => {
            close()
            copyIgnored(ignoredText(list.file, statuses))
          }}
          className={MENU_ROW}
        >
          {m.tasks_ignored_copy()}
        </button>
        <button
          type="button"
          data-testid="tasks-ignored-download"
          disabled={ignored === 0}
          title={m.tasks_ignored_download_hint()}
          onClick={() => {
            close()
            downloadText(
              `${list.file.maid_tasks.list_id}-ignored.json`,
              ignoredText(list.file, statuses),
            )
          }}
          className={MENU_ROW}
        >
          {m.tasks_ignored_download()}
        </button>
        <div className="my-1 border-t border-zinc-950/10 dark:border-white/10" />
        <button
          type="button"
          data-testid="tasks-list-delete"
          title={m.tasks_recent_delete_hint()}
          onClick={forget}
          className={`${MENU_ROW} ${asking ? 'bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-700' : 'text-red-700 dark:text-red-300'}`}
        >
          {asking ? m.tasks_recent_delete_confirm() : m.tasks_list_delete()}
        </button>
      </div>
    </Flyout>
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
      // only the list's own scroller moves, not the dock around it (in one column the whole view scrolls)
      const row = currentRow.current
      const scroller = row?.closest<HTMLElement>('[data-tasks-rows]')
      if (!row || !scroller) return
      const box = scroller.getBoundingClientRect()
      const at = row.getBoundingClientRect()
      if (at.top < box.top) scroller.scrollTop -= box.top - at.top
      else if (at.bottom > box.bottom) scroller.scrollTop += at.bottom - box.bottom
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
 * The current task, beside the list: its heading (title with status, links, the focus button) stays, the
 * description, the actions and the action bar with "Next open task" scroll under it. All the work on a task happens here, whatever is selected on the
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
  const engine = useSharedEngine(shared)
  const version = useEngineVersion(engine)
  // whether another task is open; which one is worked out on the click (next.ts), with the edits of that moment
  const next = nextOpenIndex(statuses, current)
  const go = (index: number) => goToTask({ store, select, engine: shared.engine }, index)
  const goNext = () => {
    const files = list?.file.features
    const graph = editor?.history.staging.graph
    const index = nextNearIndex(statuses, current, (at) => {
      const each = files?.[at]
      return each ? taskShape(each, graph) : undefined
    })
    if (index !== undefined) go(index)
  }
  const nextButton = (
    <button
      type="button"
      data-testid="tasks-next"
      disabled={next === undefined}
      title={next === undefined ? m.tasks_none_open() : undefined}
      onClick={goNext}
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
  const target = taskTarget(engine, ids, selected, version)
  const onTask = ids.length > 0 && ids.every((id) => selected.includes(id))
  return (
    <div data-testid="tasks-current" className="flex min-h-0 flex-1 flex-col">
      {/* the heading stays while the task scrolls under it */}
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-950/10 px-4 py-2.5 dark:border-white/15">
        <h3 className="min-w-0 text-sm/5 font-semibold break-words">
          {task.properties.title}{' '}
          <span className="inline-block align-middle">
            <StatusBadge status={status} />
          </span>
        </h3>
        <span className="flex shrink-0 items-center gap-0.5">
          <TaskLinks task={task} />
          <button
            type="button"
            data-testid="tasks-show"
            // selects the task's feature again and moves the map to it, after clicks elsewhere on the map; nothing
            // to do while it is selected
            onClick={() => go(current)}
            disabled={onTask}
            aria-label={ids.length > 0 ? m.tasks_select_task_feature() : m.tasks_show_task()}
            title={ids.length > 0 ? m.tasks_select_task_feature() : m.tasks_show_task()}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ViewfinderCircleIcon aria-hidden="true" className="size-5" />
          </button>
        </span>
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
          onNext={goNext}
          hasNext={next !== undefined}
        />
      </div>
    </div>
  )
}
