/**
 * The next task after one is done: which tasks are candidates (the challenge scope), and the nearest, priority
 * and random pick. The caller passes the cached tasks; nothing here remembers the last worked challenge.
 */
import { distanceMeters } from './geo.ts'
import { isOpen } from './status.ts'

/** What a pick needs of a cached task. `loc` is [lng, lat]; a task without one is never picked as the nearest. */
export type NextTaskCandidate = {
  id: string | number
  parentId: string | number
  loc?: readonly [number, number] | null
  status?: number | null
  /** 0 high, 1 medium, 2 low; a missing priority sorts last */
  priority?: number | null
}

/** primary: the preferred challenges have open tasks; fallback: only other challenges do; empty: none */
export type NextTaskPoolMode = 'primary' | 'fallback' | 'empty'

export type NextTaskPool<T extends NextTaskCandidate = NextTaskCandidate> = {
  mode: NextTaskPoolMode
  tasks: T[]
  /** The challenge ids that were the preferred scope */
  preferredChallengeIds: string[]
}

/** The challenge ids of a filter text such as `12, 34` (`true` and empty mean no filter) */
export function parseChallengeFilter(raw: string | null | undefined): string[] {
  if (!raw || raw.toLowerCase() === 'true') return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'true')
}

/** The preferred challenge scope: the filter, else the last worked challenge, else the current task's */
export function preferredChallengeIds(options: {
  filter?: readonly string[] | string | null
  lastChallengeId?: string | number | null
  currentChallengeId?: string | number | null
}): string[] {
  const filter =
    typeof options.filter === 'string'
      ? parseChallengeFilter(options.filter)
      : [...(options.filter ?? [])]
  if (filter.length) return filter.map(String)
  if (
    options.lastChallengeId !== undefined &&
    options.lastChallengeId !== null &&
    options.lastChallengeId !== ''
  ) {
    return [String(options.lastChallengeId)]
  }
  if (
    options.currentChallengeId !== undefined &&
    options.currentChallengeId !== null &&
    options.currentChallengeId !== ''
  ) {
    return [String(options.currentChallengeId)]
  }
  return []
}

/**
 * The challenge-scope decision for the next-task buttons. Candidates are the open tasks of `tasks` without
 * `excludeId`. primary: the preferred challenges have some (nearest and priority are offered); fallback: they have
 * none but others do (random only); empty: nothing.
 */
export function resolveCandidatePool<T extends NextTaskCandidate>(
  tasks: readonly T[],
  options: {
    preferredChallengeIds?: readonly string[]
    excludeId?: string | number | null
  } = {},
): NextTaskPool<T> {
  const preferred = (options.preferredChallengeIds ?? []).map(String)
  const exclude =
    options.excludeId === undefined || options.excludeId === null ? null : String(options.excludeId)
  const open = tasks.filter((t) => isOpen(t) && String(t.id) !== exclude)
  const primary = preferred.length
    ? open.filter((t) => preferred.includes(String(t.parentId)))
    : open
  if (primary.length)
    return {
      mode: 'primary',
      tasks: primary,
      preferredChallengeIds: preferred,
    }
  if (open.length) return { mode: 'fallback', tasks: open, preferredChallengeIds: preferred }
  return { mode: 'empty', tasks: [], preferredChallengeIds: preferred }
}

function priorityOf(task: NextTaskCandidate): number {
  const n = Number(task.priority)
  return task.priority !== undefined && task.priority !== null && Number.isFinite(n) ? n : 99
}

function distanceTo(loc: readonly [number, number], task: NextTaskCandidate): number {
  return task.loc ? distanceMeters(loc, task.loc) : Infinity
}

/** The task nearest to `loc`; null for an empty pool */
export function pickNearest<T extends NextTaskCandidate>(
  pool: readonly T[],
  loc: readonly [number, number],
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const task of pool) {
    const dist = distanceTo(loc, task)
    if (dist < bestDist) {
      best = task
      bestDist = dist
    }
  }
  return best
}

/** The task with the highest priority (the lowest number); the nearest to `loc` among equals */
export function pickPriority<T extends NextTaskCandidate>(
  pool: readonly T[],
  loc: readonly [number, number],
): T | null {
  let best: T | null = null
  let bestPriority = Infinity
  let bestDist = Infinity
  for (const task of pool) {
    const priority = priorityOf(task)
    const dist = distanceTo(loc, task)
    if (priority < bestPriority || (priority === bestPriority && dist < bestDist)) {
      best = task
      bestPriority = priority
      bestDist = dist
    }
  }
  return best
}

/**
 * A random task of the pool that is also in `viewportTasks`, or of the whole pool when none is.
 * `random` returns a number from 0 up to but not including 1.
 */
export function pickRandomNearby<T extends NextTaskCandidate>(
  pool: readonly T[],
  viewportTasks?: readonly NextTaskCandidate[] | null,
  random: () => number = Math.random,
): T | null {
  if (!pool.length) return null
  const ids = new Set((viewportTasks ?? []).map((t) => String(t.id)))
  const inView = pool.filter((t) => ids.has(String(t.id)))
  const candidates = inView.length ? inView : pool
  return (
    candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)] ?? null
  )
}

/** Which next-task buttons to show for a pool */
export function nextTaskActionsForPool(pool: Pick<NextTaskPool, 'mode'>): {
  showNearest: boolean
  showPriority: boolean
  showRandom: boolean
} {
  return {
    showNearest: pool.mode === 'primary',
    showPriority: pool.mode === 'primary',
    showRandom: pool.mode === 'fallback',
  }
}

/** The one action of the map-data pin button: nearest, random, or none */
export function mapDataNextAction(pool: Pick<NextTaskPool, 'mode'>): 'nearest' | 'random' | null {
  const actions = nextTaskActionsForPool(pool)
  return actions.showNearest ? 'nearest' : actions.showRandom ? 'random' : null
}
