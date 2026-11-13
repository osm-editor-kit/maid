import {
  type InspectorSectionProps,
  MAPROULETTE_OPEN_HEADING,
  MAPROULETTE_OPEN_PANEL,
  MAPROULETTE_TEXT,
  SidebarDisclosure,
} from '@osm-editor-kit/maid-ui'
import { m } from './messages.ts'
import { RouletteIcon } from './RouletteIcon.tsx'
import type { Shared } from './shared.ts'
import { shownStatus, useMapRoulette } from './store.ts'
import { StatusBadge, TaskCard } from './TaskCard.tsx'

/** The most tasks one feature shows at once */
const MAX_SHOWN = 3

/**
 * The MapRoulette tasks that name the selected feature, at the top of the inspector, each a folding group on the teal
 * as the private task lists do it: the instructions next to the feature to fix, with the status buttons.
 */
export function createTaskSection(shared: Shared) {
  const { store } = shared
  return function MapRouletteTaskSection({
    entity,
    editor,
    readOnly,
    select,
  }: InspectorSectionProps) {
    const ids = useMapRoulette(store, (state) => state.byEntity[entity.id])
    const currentTaskId = useMapRoulette(store, (state) => state.currentTaskId)
    const tasks = useMapRoulette(store, (state) => state.tasks)
    const finished = useMapRoulette(store, (state) => state.finished)
    const earmarks = useMapRoulette(store, (state) => state.earmarks)
    if (!ids || ids.length === 0) return null
    // the current task first
    const shown = ids
      .toSorted((a, b) => Number(b === currentTaskId) - Number(a === currentTaskId))
      .slice(0, MAX_SHOWN)
    return (
      <div data-testid="maproulette-section" className="contents">
        {shown.map((id) => {
          const task = tasks[id]
          const { status, queued } = shownStatus(
            { finished, earmarks },
            { id, status: task?.status },
          )
          return (
            <SidebarDisclosure
              key={id}
              title={task?.title ?? m.mr_task_number({ id })}
              defaultOpen
              openHeadingClassName={MAPROULETTE_OPEN_HEADING}
              openPanelClassName={MAPROULETTE_OPEN_PANEL}
              icon={() => <RouletteIcon className={`size-4 shrink-0 ${MAPROULETTE_TEXT}`} />}
              detail={<StatusBadge status={status} queued={queued} />}
            >
              <TaskCard
                shared={shared}
                taskId={id}
                editor={editor}
                select={select}
                {...(readOnly ? { readOnly } : {})}
              />
            </SidebarDisclosure>
          )
        })}
      </div>
    )
  }
}
