import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { tasksOfEntity } from './list.ts'
import { m } from './messages.ts'
import { type TasksStore, useTasks } from './store.ts'
import { TaskContent } from './TaskContent.tsx'

/** The most tasks one feature shows at once; the rest is counted */
const MAX_SHOWN = 5

/** The tasks that name the selected feature, at the top of the inspector */
export function createTaskSection(store: TasksStore) {
  return function TaskSection({ entity, editor, readOnly, select }: InspectorSectionProps) {
    const refs = useTasks(store, (state) => state.list?.refs)
    const current = useTasks(store, (state) => state.current)
    if (!refs) return null
    // the current task first, so "Next open task" shows what it moved to
    const indexes = tasksOfEntity(refs, entity.id).toSorted(
      (a, b) => Number(b === current) - Number(a === current),
    )
    return (
      <div data-testid="tasks-section" className="flex flex-col gap-4">
        {indexes.slice(0, MAX_SHOWN).map((index) => (
          <TaskContent
            key={index}
            store={store}
            index={index}
            entity={entity}
            editor={editor}
            readOnly={readOnly}
            hasRefs
            select={select}
          />
        ))}
        {indexes.length > MAX_SHOWN && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {m.tasks_more_tasks({ count: indexes.length - MAX_SHOWN })}
          </p>
        )}
      </div>
    )
  }
}
