import { ClipboardDocumentListIcon } from '@heroicons/react/20/solid'
import {
  type InspectorSectionProps,
  SidebarDisclosure,
  TASKS_HEADING,
  TASKS_TEXT,
} from '@osm-editor-kit/maid-ui'
import { tasksOfEntity } from './list.ts'
import { m } from './messages.ts'
import { type TasksStore, useTasks } from './store.ts'
import { StatusBadge, TaskContent, TaskLinks } from './TaskContent.tsx'

/** The most tasks one feature shows at once; the rest is counted */
const MAX_SHOWN = 5

/**
 * The tasks that name the selected feature, at the top of the inspector. Each task is a folding group as "Fields": the
 * heading names the task and carries its status and its links, the group holds the description, the actions and the
 * status buttons (Tobias, 2026-11-11).
 */
export function createTaskSection(store: TasksStore) {
  return function TaskSection({ entity, editor, readOnly, select }: InspectorSectionProps) {
    const refs = useTasks(store, (state) => state.list?.refs)
    const features = useTasks(store, (state) => state.list?.file.features)
    const statuses = useTasks(store, (state) => state.statuses)
    const current = useTasks(store, (state) => state.current)
    if (!refs || !features) return null
    // the current task first, so "Next open task" shows what it moved to
    const indexes = tasksOfEntity(refs, entity.id).toSorted(
      (a, b) => Number(b === current) - Number(a === current),
    )
    return (
      // display: contents, so each heading sticks in the inspector's scroller as the other groups do
      <div data-testid="tasks-section" className="contents">
        {indexes.slice(0, MAX_SHOWN).map((index) => {
          const task = features[index]
          const status = statuses[index]
          if (!task || status === undefined) return null
          return (
            <SidebarDisclosure
              key={index}
              title={task.properties.title}
              defaultOpen
              headingClassName={TASKS_HEADING}
              icon={() => (
                <ClipboardDocumentListIcon
                  aria-label={m.tasks_section()}
                  className={`ml-2 size-4 shrink-0 ${TASKS_TEXT}`}
                />
              )}
              detail={
                <span className="flex items-center gap-1">
                  <TaskLinks task={task} />
                  <StatusBadge status={status} />
                </span>
              }
            >
              <TaskContent
                store={store}
                index={index}
                entity={entity}
                editor={editor}
                readOnly={readOnly}
                hasRefs
                select={select}
                headed={false}
              />
            </SidebarDisclosure>
          )
        })}
        {indexes.length > MAX_SHOWN && (
          <p className="pb-3 text-xs text-zinc-500 dark:text-zinc-400">
            {m.tasks_more_tasks({ count: indexes.length - MAX_SHOWN })}
          </p>
        )}
      </div>
    )
  }
}
