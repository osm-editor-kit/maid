import { TASK_STATUSES, type TaskStatus } from '@osm-editor-kit/maid-osm-prefs'
/**
 * Pure helpers over a loaded task list: counts, the filter, the next open task, the index from OSM elements to tasks
 * and the map data. No React, no store, no network.
 */
import { type Task, type TaskFile } from '@osm-editor-kit/maid-tasks'

/** Which tasks the list shows: all, or those with one status */
export type TasksFilter = 'all' | TaskStatus

export const FILTERS: readonly TasksFilter[] = ['all', ...TASK_STATUSES]

/** How many tasks have each status */
export type StatusCounts = Record<TaskStatus, number> & { total: number }

/** The number of tasks per status, and in all */
export function countStatuses(statuses: readonly TaskStatus[]): StatusCounts {
  const counts: StatusCounts = { open: 0, done: 0, ignored: 0, skipped: 0, total: statuses.length }
  for (const status of statuses) counts[status]++
  return counts
}

/** The indexes of the tasks the filter shows, in file order */
export function visibleIndexes(statuses: readonly TaskStatus[], filter: TasksFilter): number[] {
  const shown: number[] = []
  statuses.forEach((status, index) => {
    if (filter === 'all' || status === filter) shown.push(index)
  })
  return shown
}

/**
 * The next open task after `from` (the first open task when `from` is null), wrapping round to the start. Undefined
 * when no task is open. The task `from` itself is the last one tried, so it is found again only if it is the only open one.
 */
export function nextOpenIndex(
  statuses: readonly TaskStatus[],
  from: number | null,
): number | undefined {
  const count = statuses.length
  const start = from === null ? 0 : from + 1
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count
    if (statuses[index] === 'open') return index
  }
  return undefined
}

/** The OSM reference of an editor id (`w123` is `way/123`); undefined for a new feature (`w-1`) or a note */
export function refOfEntityId(id: string): string | undefined {
  const match = /^([nwr])([1-9][0-9]*)$/.exec(id)
  if (!match) return undefined
  const type = match[1] === 'n' ? 'node' : match[1] === 'w' ? 'way' : 'relation'
  return `${type}/${match[2]}`
}

/** The editor id of an OSM reference (`way/123` is `w123`) */
export function entityIdOfRef(ref: string): string {
  const [type, id] = ref.split('/')
  return `${type?.[0] ?? ''}${id ?? ''}`
}

/** The tasks of each OSM element, as indexes into the file: built once per loaded file */
export type RefIndex = ReadonlyMap<string, readonly number[]>

/** Maps `type/id` to the indexes of the tasks that name that element */
export function buildRefIndex(file: TaskFile): RefIndex {
  const index = new Map<string, number[]>()
  file.features.forEach((task, taskIndex) => {
    for (const ref of task.properties.osm ?? []) {
      const list = index.get(ref)
      if (list) list.push(taskIndex)
      else index.set(ref, [taskIndex])
    }
  })
  return index
}

/** The tasks that name this editor id (`w123`), in file order; none for ids that are no OSM element */
export function tasksOfEntity(refs: RefIndex, entityId: string): readonly number[] {
  const ref = refOfEntityId(entityId)
  return (ref && refs.get(ref)) || []
}

/** The editor ids of a task's OSM elements, in the order the task lists them */
export function entityIdsOfTask(task: Task): string[] {
  return (task.properties.osm ?? []).map(entityIdOfRef)
}

/** `[west, south, east, north]` of a task's geometry */
export type Bounds = [number, number, number, number]

function eachPosition(coordinates: unknown, visit: (lon: number, lat: number) => void) {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    visit(coordinates[0], coordinates[1])
    return
  }
  for (const part of coordinates) eachPosition(part, visit)
}

/** The box around a geometry's positions */
export function boundsOf(geometry: Task['geometry']): Bounds {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  eachPosition(geometry.coordinates, (lon, lat) => {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  })
  return [west, south, east, north]
}

/** The map data of a file: each task's geometry with its index in `i` (the status colours come from the layer's paint) */
export function mapData(file: TaskFile): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: file.features.map((task, i) => ({
      type: 'Feature',
      geometry: task.geometry as GeoJSON.Geometry,
      properties: { i },
    })),
  }
}

/** The colour of each status on the map */
export const STATUS_COLOUR: Record<TaskStatus, string> = {
  open: '#f97316',
  done: '#16a34a',
  ignored: '#71717a',
  skipped: '#2563eb',
}

/**
 * The paint colour for the task index `i`: a `match` over the indexes of the tasks that are not open, so a status
 * change updates a paint property and not the 20 000 features. Open is the fallback; empty groups are left out,
 * as `match` does not take an empty label list.
 */
export function colourExpression(statuses: readonly TaskStatus[]): unknown[] | string {
  const groups: Record<'done' | 'ignored' | 'skipped', number[]> = {
    done: [],
    ignored: [],
    skipped: [],
  }
  statuses.forEach((status, index) => {
    if (status !== 'open') groups[status].push(index)
  })
  const expression: unknown[] = ['match', ['get', 'i']]
  for (const status of ['done', 'ignored', 'skipped'] as const) {
    if (groups[status].length > 0) expression.push(groups[status], STATUS_COLOUR[status])
  }
  if (expression.length === 2) return STATUS_COLOUR.open
  expression.push(STATUS_COLOUR.open)
  return expression
}
