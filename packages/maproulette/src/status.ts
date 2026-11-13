/** MapRoulette task statuses and the rules around them */

/** The status numbers of the API */
export const TaskStatus = {
  Created: 0,
  Fixed: 1,
  FalsePositive: 2,
  Skipped: 3,
  Deleted: 4,
  AlreadyFixed: 5,
  TooHard: 6,
  Disabled: 9,
} as const

export type TaskStatusCode = (typeof TaskStatus)[keyof typeof TaskStatus]

/** English names of the statuses, as MapRoulette shows them */
export const TASK_STATUS_NAMES: Record<TaskStatusCode, string> = {
  0: 'Created',
  1: 'Fixed',
  2: 'False positive',
  3: 'Skipped',
  4: 'Deleted',
  5: 'Already fixed',
  6: 'Too hard',
  9: 'Disabled',
}

/** The name of a status number; the number as text for an unknown one */
export function statusName(status: number): string {
  return (TASK_STATUS_NAMES as Record<number, string | undefined>)[status] ?? String(status)
}

/** The statuses a mapper can set on a task */
export const MAPPER_STATUSES: readonly TaskStatusCode[] = [
  TaskStatus.Fixed,
  TaskStatus.FalsePositive,
  TaskStatus.Skipped,
  TaskStatus.AlreadyFixed,
  TaskStatus.TooHard,
]

/** The four outcomes of the finish buttons (skip is not one of them), in the order of MapRoulette's buttons */
export const COMPLETION_STATUSES: readonly TaskStatusCode[] = [
  TaskStatus.Fixed,
  TaskStatus.AlreadyFixed,
  TaskStatus.FalsePositive,
  TaskStatus.TooHard,
]

/** The statuses asked for from the box request (Deleted and Disabled are left out) */
export const BOX_STATUSES: readonly TaskStatusCode[] = [
  TaskStatus.Created,
  TaskStatus.Fixed,
  TaskStatus.FalsePositive,
  TaskStatus.Skipped,
  TaskStatus.AlreadyFixed,
  TaskStatus.TooHard,
]

/** How long a resolved task stays visible after `mappedOn`: 24 hours */
export const RESOLVED_VISIBLE_MS = 24 * 60 * 60 * 1000

const RESOLVED = new Set<number>([
  TaskStatus.Fixed,
  TaskStatus.FalsePositive,
  TaskStatus.AlreadyFixed,
  TaskStatus.TooHard,
])
const OPEN = new Set<number>([TaskStatus.Created, TaskStatus.Skipped])

/** The parts of a task that the status rules read */
export type StatusLike = { status?: number | null; mappedOn?: string | null }

/** The status of a task; Created when it has none */
export function statusOf(task: StatusLike | null | undefined): number {
  const status = task?.status
  return typeof status === 'number' && Number.isFinite(status) ? status : TaskStatus.Created
}

/** Open: Created or Skipped, still there to work on */
export function isOpen(task: StatusLike | null | undefined): boolean {
  return OPEN.has(statusOf(task))
}

/** Resolved: Fixed, False positive, Already fixed or Too hard */
export function isResolved(task: StatusLike | null | undefined): boolean {
  return RESOLVED.has(statusOf(task))
}

/** Whether a status number is a resolved one */
export function isResolvedStatus(status: number): boolean {
  return RESOLVED.has(Number(status))
}

/** Resolved, and `mappedOn` is less than 24 hours before `now`. A missing or broken `mappedOn` is not recent. */
export function isRecentlyResolved(
  task: StatusLike | null | undefined,
  now: number | Date,
): boolean {
  if (!isResolved(task) || !task?.mappedOn) return false
  const mapped = Date.parse(task.mappedOn)
  if (!Number.isFinite(mapped)) return false
  const at = typeof now === 'number' ? now : now.getTime()
  return at - mapped < RESOLVED_VISIBLE_MS
}

/** Shown on the map: open, or resolved less than 24 hours ago */
export function shouldDisplay(task: StatusLike | null | undefined, now: number | Date): boolean {
  return !!task && (isOpen(task) || isRecentlyResolved(task, now))
}
