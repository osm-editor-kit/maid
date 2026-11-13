/**
 * What the parts of the module share: the store, the controller, MapRoulette's website, and the map engine once the
 * map is up (the top bar panel has no `select` of its own, so going to a task selects through the engine).
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import { lineStrings } from '@osm-editor-kit/maid-maproulette'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { openDockView } from '@osm-editor-kit/maid-ui'
import type { Controller } from './controller.ts'
import type { MapRouletteStore } from './store.ts'

/** The dock view of the module */
export const DOCK_VIEW = 'maproulette'

export type Shared = {
  editor: Editor
  store: MapRouletteStore
  controller: Controller
  /** MapRoulette's website, for the links to a challenge and a task */
  siteUrl: string
  /** Set by the map layer while the map is up */
  engine?: MaidEngine
}

/** A challenge on MapRoulette's website */
export function challengeUrl(shared: Pick<Shared, 'siteUrl'>, challengeId: string) {
  return `${shared.siteUrl}/browse/challenges/${challengeId}`
}

/** A task on MapRoulette's website */
export function taskUrl(shared: Pick<Shared, 'siteUrl'>, challengeId: string, taskId: string) {
  return `${shared.siteUrl}/challenge/${challengeId}/task/${taskId}`
}

/**
 * Goes to a task: it becomes the current one, the map moves to it, the dock shows it, and its OSM features are selected
 * when they are loaded (then the inspector shows the task above the fields). `select` is the dock's or the
 * inspector's; without it the engine's selection is set directly.
 */
export function goToTask(
  shared: Shared,
  taskId: string,
  select?: (selection: string | readonly string[] | null) => void,
) {
  const { controller, engine, editor } = shared
  controller.chooseTask(taskId)
  openDockView(DOCK_VIEW)
  const bounds = taskBounds(shared, taskId)
  if (bounds) engine?.camera.fitBounds(bounds)
  const loaded = controller
    .featuresOf(taskId)
    .filter((id) => editor.history.staging.graph.hasEntity(id) !== undefined)
  if (loaded.length === 0) return
  if (select) select(loaded)
  else engine?.setSelected(loaded)
}

/** The box of a task's lines, or its pin: [west, south, east, north] */
export function taskBounds(
  shared: Pick<Shared, 'store' | 'controller'>,
  taskId: string,
): [number, number, number, number] | undefined {
  const task = shared.store.getState().tasks[taskId]
  const points = task ? lineStrings(task.geometries).flat() : []
  const pin = shared.controller.locationOf(taskId)
  if (points.length === 0) return pin ? [pin[0], pin[1], pin[0], pin[1]] : undefined
  const lons = points.map((point) => point[0])
  const lats = points.map((point) => point[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}
