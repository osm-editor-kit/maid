import { describe, expect, test } from 'bun:test'
import { HttpError, RateLimitedError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import { cellKey, type Cell } from './model.ts'
import { abortOutside, missingCells, requestCells, useNotesSession } from './store.ts'

const cell = (i: number, j: number): Cell => ({ i, j })
const URL_PREFIX = 'https://api.openstreetmap.org'

/** A remote that fails with the given error at once, and records the calls */
function failing(error: unknown) {
  const calls: { url: string; service: unknown }[] = []
  const remote: RemoteFetch = (url, init) => {
    calls.push({ url: String(url), service: init?.service })
    return Promise.reject(error)
  }
  return { remote, calls }
}

/** A remote whose request waits until it is aborted, then rejects with the abort reason */
function hanging() {
  const signals: AbortSignal[] = []
  const remote: RemoteFetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (signal) {
        signals.push(signal)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }
    })
  return { remote, signals }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('a failed request', () => {
  test('is not asked again before its wait is over, and goes through the editor fetch with the OSM service', async () => {
    useNotesSession.setState({ cells: {}, failures: {}, error: null })
    const { remote, calls } = failing(new HttpError(500, `${URL_PREFIX}/x`))
    const cells = [cell(268, 1047)]
    requestCells(remote, URL_PREFIX, 'open', cells)
    await flush()

    const session = useNotesSession.getState()
    const key = cellKey('open', cell(268, 1047))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.service).toBe('osm')
    expect(session.cells[key]).toBeUndefined()
    expect(session.failures[key]?.failures).toBe(1)
    expect(session.error).toBe('The notes could not be loaded (HTTP 500).')

    // the cell is missing for the map, but not yet asked again: its wait has not passed
    const now = Date.now()
    expect(missingCells(bboxOf(cell(268, 1047)), 'open', {}, session.failures, now)).toEqual([])
    // after the wait it is missing again
    const later = session.failures[key]?.retryAt ?? now
    expect(missingCells(bboxOf(cell(268, 1047)), 'open', {}, session.failures, later)).toEqual([
      cell(268, 1047),
    ])
  })

  test('a rate limit waits until the end of the pause and is not counted as a failure of the cell', async () => {
    useNotesSession.setState({ cells: {}, failures: {}, error: null })
    const until = Date.now() + 60_000
    const { remote } = failing(new RateLimitedError('osm', 429, until))
    requestCells(remote, URL_PREFIX, 'open', [cell(1, 1)])
    await flush()
    const key = cellKey('open', cell(1, 1))
    expect(useNotesSession.getState().failures[key]).toEqual({ failures: 0, retryAt: until })
  })
})

describe('abortOutside', () => {
  test('aborts a request whose cells left the view, and keeps one with a cell still in view', async () => {
    useNotesSession.setState({ cells: {}, failures: {}, error: null })
    const left = hanging()
    const kept = hanging()
    requestCells(left.remote, URL_PREFIX, 'open', [cell(10, 10)])
    requestCells(kept.remote, URL_PREFIX, 'open', [cell(20, 20)])
    expect(useNotesSession.getState().cells[cellKey('open', cell(10, 10))]).toBe('loading')

    abortOutside(new Set([cellKey('open', cell(20, 20))]))
    await flush()

    expect(left.signals[0]?.aborted).toBe(true)
    expect(kept.signals[0]?.aborted).toBe(false)
    const cells = useNotesSession.getState().cells
    // the aborted cell is forgotten, so it is asked again when it is in view; the kept one is loading
    expect(cells[cellKey('open', cell(10, 10))]).toBeUndefined()
    expect(cells[cellKey('open', cell(20, 20))]).toBe('loading')
    // an aborted cell is not a failure
    expect(useNotesSession.getState().failures[cellKey('open', cell(10, 10))]).toBeUndefined()

    abortOutside(new Set())
    await flush()
  })
})

/** The box of one grid cell, as the view box the map gives (a cell is 0.05 degrees) */
function bboxOf({ i, j }: Cell): [number, number, number, number] {
  return [i * 0.05 + 0.01, j * 0.05 + 0.01, (i + 1) * 0.05 - 0.01, (j + 1) * 0.05 - 0.01]
}
