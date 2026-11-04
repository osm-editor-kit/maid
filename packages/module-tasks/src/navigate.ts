/** Going to a task: remember it, select its first OSM element and move the map to its geometry. */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { boundsOf, entityIdsOfTask } from './list.ts'
import type { TasksStore } from './store.ts'

export type GoDeps = {
  store: TasksStore
  select: (selection: string | readonly string[] | null) => void
  engine?: MaidEngine
}

/**
 * Makes the task at `index` the current one. With an OSM element it selects the first one (the inspector then shows
 * the task); the map moves to the task's geometry in any case.
 */
export function goToTask(deps: GoDeps, index: number): void {
  const { store, select, engine } = deps
  const list = store.getState().list
  const task = list?.file.features[index]
  if (!list || !task) return
  store.getState().actions.setCurrent(index)
  const first = entityIdsOfTask(task)[0]
  if (first) select(first)
  engine?.camera.fitBounds(boundsOf(task.geometry))
}
