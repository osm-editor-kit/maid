import { describe, expect, test } from 'bun:test'
import { AutomationBlockedError, HttpError, RateLimitedError } from '@osm-editor-kit/maid-core'
import { afterFailure, canAsk, failureMessage, NEVER, retryPauseMs } from './retry.ts'

const URL = 'https://api.openstreetmap.org/api/0.6/notes.json'

describe('the pause after failures in a row', () => {
  test('1 s after the first, 2 s after the second, 30 s after every further one', () => {
    expect([1, 2, 3, 4, 9].map(retryPauseMs)).toEqual([1_000, 2_000, 30_000, 30_000, 30_000])
  })

  test('a timeout or a 5xx counts as a failure and waits accordingly', () => {
    const now = 100_000
    const first = afterFailure(undefined, new HttpError(503, URL), now)
    expect(first).toEqual({ failures: 1, retryAt: now + 1_000 })
    const second = afterFailure(first, new HttpError(503, URL), now + 1_000)
    expect(second).toEqual({ failures: 2, retryAt: now + 1_000 + 2_000 })
    const third = afterFailure(second, new Error('network down'), now + 3_000)
    expect(third).toEqual({ failures: 3, retryAt: now + 3_000 + 30_000 })
  })
})

describe('a cell that failed is not asked before its time', () => {
  test('a cell with no failure may be asked', () => {
    expect(canAsk(undefined, 0)).toBe(true)
  })

  test('a failed cell waits until its retry time, and not after it has passed', () => {
    const failure = afterFailure(undefined, new HttpError(500, URL), 1_000)
    expect(canAsk(failure, 1_999)).toBe(false)
    expect(canAsk(failure, 2_000)).toBe(true)
  })

  test('a 4xx answer is never asked again in this session', () => {
    const failure = afterFailure(undefined, new HttpError(400, URL), 1_000)
    expect(failure.retryAt).toBe(NEVER)
    expect(canAsk(failure, Number.MAX_SAFE_INTEGER)).toBe(false)
  })

  test('a refused automated request is never asked again', () => {
    const failure = afterFailure(undefined, new AutomationBlockedError(URL), 1_000)
    expect(canAsk(failure, Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})

describe('a rate limit', () => {
  test('waits until the end of the service pause and does not count as a failure', () => {
    const until = 60_000
    const failure = afterFailure(
      { failures: 2, retryAt: 0 },
      new RateLimitedError('osm', 429, until),
      10_000,
    )
    expect(failure).toEqual({ failures: 2, retryAt: until })
    expect(canAsk(failure, until - 1)).toBe(false)
    expect(canAsk(failure, until)).toBe(true)
  })

  test('the message names the pause, not the status', () => {
    expect(failureMessage(new RateLimitedError('osm', 509, 1))).toMatch(/asked for a pause/)
    expect(failureMessage(new HttpError(500, URL))).toBe(
      'The notes could not be loaded (HTTP 500).',
    )
    expect(failureMessage(new Error('x'))).toBe('The notes could not be loaded.')
  })
})
