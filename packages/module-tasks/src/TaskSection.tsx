import { ClipboardDocumentListIcon } from '@heroicons/react/20/solid'
import {
  type InspectorSectionProps,
  openDockView,
  TASKS_SURFACE,
  TASKS_TEXT,
} from '@osm-editor-kit/maid-ui'
import { DOCK_VIEW } from './dock-view.ts'
import { tasksOfEntity } from './list.ts'
import { m } from './messages.ts'
import { type TasksStore, useTasks } from './store.ts'
import { StatusBadge } from './TaskContent.tsx'

/** The most tasks one feature lists at once; the rest is counted */
const MAX_SHOWN = 5

const BUTTON =
  'shrink-0 cursor-pointer rounded-lg border border-olive-700/20 bg-white px-2 py-0.5 text-xs font-medium hover:bg-olive-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-zinc-800'

/**
 * At the top of the inspector: a hint that the selected feature has tasks, each with a button that makes it the current
 * task in the dock's task list. The work on a task (its description, actions and closing buttons) happens there, so it
 * stays in view while other features are selected (Tobias, 2026-11-26).
 */
export function createTaskSection(store: TasksStore) {
  return function TaskSection({ entity }: InspectorSectionProps) {
    const refs = useTasks(store, (state) => state.list?.refs)
    const features = useTasks(store, (state) => state.list?.file.features)
    const statuses = useTasks(store, (state) => state.statuses)
    const current = useTasks(store, (state) => state.current)
    if (!refs || !features) return null
    // the current task first
    const indexes = tasksOfEntity(refs, entity.id).toSorted(
      (a, b) => Number(b === current) - Number(a === current),
    )
    const open = (index: number) => {
      store.getState().actions.setCurrent(index)
      openDockView(DOCK_VIEW)
    }
    return (
      <div
        data-testid="tasks-section"
        className={`-mx-3 flex flex-col gap-1.5 border-t border-zinc-950/10 px-3 py-2 dark:border-white/10 ${TASKS_SURFACE}`}
      >
        <p className={`flex items-center gap-1.5 text-xs font-medium ${TASKS_TEXT}`}>
          <ClipboardDocumentListIcon aria-hidden="true" className="size-4 shrink-0" />
          {m.tasks_hint()}
        </p>
        <ul className="flex flex-col gap-1">
          {indexes.slice(0, MAX_SHOWN).map((index) => {
            const task = features[index]
            const status = statuses[index]
            if (!task || status === undefined) return null
            return (
              <li
                key={index}
                data-testid={`tasks-hint-${task.properties.task_id}`}
                className="flex flex-col gap-1"
              >
                <span className="text-sm/5 break-words">{task.properties.title}</span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={status} />
                  <button
                    type="button"
                    data-testid={`tasks-hint-open-${task.properties.task_id}`}
                    onClick={() => open(index)}
                    className={BUTTON}
                  >
                    {m.tasks_hint_open()}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        {indexes.length > MAX_SHOWN && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.tasks_more_tasks({ count: indexes.length - MAX_SHOWN })}
          </p>
        )}
      </div>
    )
  }
}
