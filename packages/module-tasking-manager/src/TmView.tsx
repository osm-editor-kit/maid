import { type DockViewProps, Markdown } from '@osm-editor-kit/maid-ui'
import { projectTasksUrl, projectUrl, type TaskStatus, taskInstructions } from './api.ts'
import { m } from './messages.ts'
import { type Shared, showTask } from './shared.ts'
import { currentTask, useTm } from './store.ts'

/** The text of a task's status, as the TM names it */
export function statusText(status: TaskStatus) {
  return m[`tm_status_${status}`]()
}

const LINK =
  'font-medium text-red-700 underline underline-offset-2 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200'

/**
 * The dock tab "Tasking Manager": the project's name and progress, the task of the link with its status, its own
 * instructions and a link to lock it in the TM, then the project's instructions and its description (folded).
 */
export function createTmView(shared: Shared) {
  const { store } = shared
  return function TmView(_props: DockViewProps) {
    const projectId = useTm(store, (state) => state.projectId)
    const loaded = useTm(store, (state) => state.loaded)
    const taskId = useTm(store, (state) => state.taskId)
    const task = useTm(store, currentTask)
    if (projectId === null || loaded === null) return null

    if (loaded.state !== 'ready')
      return (
        <div
          data-testid="tm-view"
          className="p-3 text-sm"
          role={loaded.state === 'failed' ? 'alert' : 'status'}
        >
          {loaded.state === 'loading' ? m.tm_loading({ id: String(projectId) }) : loaded.reason}
        </div>
      )

    const { project } = loaded
    const perTask =
      task && project.perTaskInstructions ? taskInstructions(project.perTaskInstructions, task) : ''
    return (
      <div data-testid="tm-view" className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
        <header className="flex flex-col gap-0.5">
          <h3 className="font-semibold">
            <a
              href={projectUrl(shared.siteUrl, project.projectId)}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {project.name}
            </a>
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {m.tm_project_meta({
              id: String(project.projectId),
              organisation: project.organisationName || '–',
            })}
            {' · '}
            {m.tm_progress({
              mapped: String(project.percentMapped),
              validated: String(project.percentValidated),
            })}
          </p>
        </header>

        <section
          data-testid="tm-task"
          aria-label={taskId === null ? m.tm_no_task() : m.tm_task({ id: String(taskId) })}
          className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/20"
        >
          {taskId === null ? (
            <p>{m.tm_no_task()}</p>
          ) : !task ? (
            <p role="alert">{m.tm_task_missing({ id: String(taskId) })}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold">{m.tm_task({ id: String(task.taskId) })}</h4>
                <span
                  data-testid="tm-task-status"
                  className="rounded-full bg-white/80 px-2 py-0.5 text-xs dark:bg-zinc-900/60"
                >
                  {statusText(task.status)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <button
                  type="button"
                  onClick={() => showTask(shared)}
                  className={`${LINK} cursor-pointer`}
                >
                  {m.tm_show_task()}
                </button>
                <a
                  href={projectTasksUrl(shared.siteUrl, project.projectId)}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  {m.tm_open_tasks({ id: String(task.taskId) })}
                </a>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{m.tm_lock_hint()}</p>
            </>
          )}
        </section>

        {perTask && (
          <section data-testid="tm-task-instructions" className="flex flex-col gap-1">
            <h4 className="font-medium">{m.tm_task_instructions()}</h4>
            <Markdown text={perTask} />
          </section>
        )}
        {project.instructions && (
          <section data-testid="tm-instructions" className="flex flex-col gap-1">
            <h4 className="font-medium">{m.tm_instructions()}</h4>
            <Markdown text={project.instructions} />
          </section>
        )}
        {project.description && (
          <details className="flex flex-col gap-1">
            <summary className="cursor-pointer font-medium">{m.tm_description()}</summary>
            <Markdown text={project.description} />
          </details>
        )}
      </div>
    )
  }
}
