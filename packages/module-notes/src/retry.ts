/**
 * The waiting rule of the notes requests. Pure: no React, no store, no clock (the caller passes `now`,
 * in epoch milliseconds). The rule, per grid cell:
 * - a failed request (a timeout, a 5xx, a broken answer) waits 1 s after the first failure in a row,
 *   2 s after the second, and 30 s after every further one;
 * - a 4xx answer, or a refused automated request, is never asked again in this session: the request
 *   itself is wrong, so asking again would fail the same way;
 * - a rate limit is not a failure of the cell: the cell waits until the pause of the service ends
 *   (the foundation pauses the whole OSM service, see fetching-audit.md 5.3).
 */
import { AutomationBlockedError, HttpError, RateLimitedError } from '@osm-editor-kit/maid-core'

/** Never again in this session: the time of a retry that does not come. */
export const NEVER = Number.POSITIVE_INFINITY

/** How many failures in a row a cell has, and the time (epoch ms) it may be asked again. */
export type CellFailure = { failures: number; retryAt: number }

/** The pause after the n-th failure in a row (n starts at 1): 1 s, 2 s, then 30 s for every further one. */
export function retryPauseMs(failures: number): number {
  if (failures <= 1) return 1_000
  if (failures === 2) return 2_000
  return 30_000
}

/**
 * The failure record after one more failed request of a cell. `previous` is the record before, or
 * undefined for the first failure. `now` is the time of the failure.
 */
export function afterFailure(
  previous: CellFailure | undefined,
  error: unknown,
  now: number,
): CellFailure {
  const failures = previous?.failures ?? 0
  if (error instanceof RateLimitedError) return { failures, retryAt: error.until }
  if (error instanceof AutomationBlockedError) return { failures: failures + 1, retryAt: NEVER }
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
    return { failures: failures + 1, retryAt: NEVER }
  }
  const count = failures + 1
  return { failures: count, retryAt: now + retryPauseMs(count) }
}

/** Whether a cell may be asked now: it never failed, or its wait is over. */
export function canAsk(failure: CellFailure | undefined, now: number): boolean {
  return failure === undefined || now >= failure.retryAt
}

/** The line the panel shows for a failed request. */
export function failureMessage(error: unknown): string {
  if (error instanceof RateLimitedError) {
    return 'The OpenStreetMap server asked for a pause. The notes load again when it ends.'
  }
  if (error instanceof HttpError) return `The notes could not be loaded (HTTP ${error.status}).`
  return 'The notes could not be loaded.'
}
