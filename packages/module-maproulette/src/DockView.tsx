import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { MAPROULETTE_SURFACE } from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { goToTask, type Shared } from './shared.ts'
import { challengeName, shownStatus, tasksShown, useMapRoulette } from './store.ts'
import { StatusBadge, TaskCard } from './TaskCard.tsx'

/** How many rows the list of the view shows */
const MAX_ROWS = 50

/**
 * The dock tab "MapRoulette": the current task, then the tasks of the view (of the open challenge, or of all), with
 * what the last upload reported to MapRoulette.
 */
export function createDockView(shared: Shared) {
  const { store } = shared
  return function MapRouletteView({ editor, select, readOnly, highlight }: DockViewProps) {
    const currentTaskId = useMapRoulette(store, (state) => state.currentTaskId)
    const tasks = useMapRoulette(store, (state) => state.tasks)
    const challengeId = useMapRoulette(store, (state) => state.challengeId)
    const finished = useMapRoulette(store, (state) => state.finished)
    const earmarks = useMapRoulette(store, (state) => state.earmarks)
    const resolve = useMapRoulette(store, (state) => state.resolve)
    const challenges = useMapRoulette(store, (state) => state.challenges)
    const zoomedOut = useMapRoulette(store, (state) => state.zoomedOut)
    const rows = tasksShown({ tasks, challengeId })
      .map((task) => ({ task, ...shownStatus({ finished, earmarks }, task) }))
      // open first, then by priority and id
      .sort(
        (a, b) =>
          Number(a.status !== 0) - Number(b.status !== 0) ||
          (a.task.priority ?? 9) - (b.task.priority ?? 9) ||
          Number(a.task.id) - Number(b.task.id),
      )
    return (
      <div
        data-testid="maproulette-view"
        className={`flex h-full flex-col gap-2 overflow-y-auto p-3 text-sm ${MAPROULETTE_SURFACE}`}
      >
        {resolve && (
          <p role="status" className="rounded-md bg-white/70 px-2 py-1 text-xs dark:bg-zinc-950/40">
            {resolve.state === 'running'
              ? m.mr_resolve_running({ done: resolve.done, total: resolve.total })
              : resolve.failed === 0
                ? m.mr_resolve_done({ count: resolve.ok })
                : m.mr_resolve_failed({ ok: resolve.ok, failed: resolve.failed })}
          </p>
        )}
        {currentTaskId !== null && (
          <section aria-label={m.mr_current_task()}>
            <h3 className="font-semibold">
              {tasks[currentTaskId]?.title ?? m.mr_task_number({ id: currentTaskId })}
            </h3>
            <TaskCard
              shared={shared}
              taskId={currentTaskId}
              editor={editor}
              select={select}
              readOnly={readOnly}
            />
          </section>
        )}
        <section aria-label={m.mr_tasks_in_view()} className="flex flex-col gap-1">
          <h3 className="font-medium">
            {challengeId === null
              ? m.mr_tasks_in_view()
              : m.mr_tasks_of_challenge({
                  name: challengeName({ challenges }, challengeId) ?? `#${challengeId}`,
                })}
          </h3>
          {zoomedOut && rows.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.mr_zoom_in()}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.mr_no_tasks()}</p>
          ) : (
            <ul className="flex flex-col">
              {rows.slice(0, MAX_ROWS).map(({ task, status, queued }) => {
                const id = String(task.id)
                return (
                  <li key={id}>
                    <button
                      type="button"
                      aria-current={id === currentTaskId}
                      onClick={() => goToTask(shared, id, select)}
                      onPointerEnter={() => highlight(shared.controller.featuresOf(id))}
                      onPointerLeave={() => highlight(null)}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-white/60 aria-[current=true]:bg-white/80 dark:hover:bg-white/10 dark:aria-[current=true]:bg-zinc-950/40"
                    >
                      <span className="min-w-0 truncate">
                        {task.title ?? task.name ?? m.mr_task_number({ id })}
                        {challengeId === null && (
                          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                            ·{' '}
                            {challengeName({ challenges }, String(task.parentId)) ??
                              `#${task.parentId}`}
                          </span>
                        )}
                      </span>
                      <StatusBadge status={status} queued={queued} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    )
  }
}
