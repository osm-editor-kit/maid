/** What the parts of the module share: the store, the TM's website, and the map engine once the map is up */
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { taskBounds } from './api.ts'
import { currentTask, openProject, type TmStore } from './store.ts'

/** The dock view of the module */
export const DOCK_VIEW = 'tasking-manager'

export type Shared = {
  store: TmStore
  /** The TM's website, for the links to a project */
  siteUrl: string
  /** Set by the map layer while the map is up */
  engine?: MaidEngine
}

/** Moves the map to the current task, or to the whole project when the link names none; false without a map */
export function showTask(shared: Shared) {
  const state = shared.store.getState()
  const task = currentTask(state)
  const bounds = task ? taskBounds(task) : openProject(state)?.aoiBBOX
  return bounds ? (shared.engine?.camera.fitBounds(bounds) ?? false) : false
}
