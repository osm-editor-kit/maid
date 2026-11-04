/**
 * Small builders of task files for the tests: one valid point task, one valid list, and the errors of an input.
 * Each builder takes overrides, so a test changes one thing at a time.
 */
import { parseTaskFile, type TaskFileError } from './parse.ts'

/** A valid task with a point, a title and an empty description; `properties` overrides fields */
export function pointTask(taskId = 't-1', properties: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [13.4, 52.39] },
    properties: { task_id: taskId, title: 'Check', description: '', ...properties },
  }
}

/** A valid list info; `list` overrides fields */
export function listInfo(list: Record<string, unknown> = {}) {
  return { version: 1, list_id: 'list-1', title: 'List', description: '', ...list }
}

/** A task file of the given features; `list` overrides the list info */
export function taskFile(features: unknown[] = [pointTask()], list: Record<string, unknown> = {}) {
  return { type: 'FeatureCollection', maid_tasks: listInfo(list), features }
}

/** A valid option; `extra` overrides or adds fields */
export function option(extra: Record<string, unknown> = {}) {
  return { id: 'cycleway', label: 'Cycleway', set: { highway: 'cycleway' }, ...extra }
}

/** The errors of an input that must fail; throws when it passes */
export function errorsOf(input: unknown): TaskFileError[] {
  const result = parseTaskFile(input)
  if (result.ok) throw new Error('expected the input to fail')
  return result.errors
}
