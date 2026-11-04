/**
 * The order of the tasks in a file: a short hash of the task ids in file order, and the index of each task by id.
 * The progress store keeps the hash to notice that a file changed; the index finds a task by its id.
 */
import type { TaskFile } from './schema.ts'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

/**
 * An 8-character base36 FNV-1a hash (32 bits) of the task ids in file order, each followed by a newline. The order
 * matters: the same ids in another order give another hash. Stable across runs and machines.
 */
export function orderHash(file: TaskFile): string {
  const ids = file.features.map((task) => `${task.properties.task_id}\n`).join('')
  let hash = FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(ids)) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(36).padStart(8, '0')
}

/** The position in `features` of each task, by its `task_id` */
export function taskIndex(file: TaskFile): Map<string, number> {
  return new Map(file.features.map((task, index) => [task.properties.task_id, index]))
}
