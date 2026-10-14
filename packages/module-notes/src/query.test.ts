import { describe, expect, test } from 'bun:test'
import {
  AutomationBlockedError,
  HttpError,
  RateLimitedError,
  shouldRetry,
  type RemoteFetch,
} from '@osm-editor-kit/maid-core'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { NOTES_LIMIT, NOTES_MIN_ZOOM, parseNotes, type Cell } from './model.ts'
import {
  cachedNote,
  failureMessage,
  isPermanentFailure,
  notesCell,
  notesKey,
  wantedCells,
} from './query.ts'

const API = 'https://api.openstreetmap.org'
const cell = (i: number, j: number): Cell => ({ i, j })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A GeoJSON answer with `count` open notes */
function collection(count: number) {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, n) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.4, 52.5] },
      properties: {
        id: n + 1,
        status: 'open',
        date_created: '2026-01-01T00:00:00Z',
        comments: [{ date: '2026-01-01T00:00:00Z', action: 'opened', text: 'a note' }],
      },
    })),
  }
}

/** A fake of the editor's fetch: answers with `body`, or throws the HTTP error for `status`; records the calls */
function answering(body: unknown, status = 200) {
  const calls: { url: string; service: unknown }[] = []
  const remote: RemoteFetch = async (url, init) => {
    calls.push({ url: String(url), service: init?.service })
    if (status !== 200) throw new HttpError(status, String(url))
    return new Response(JSON.stringify(body), { status: 200 })
  }
  return { remote, calls }
}

/** A fake fetch whose request waits until it is aborted; records the signals */
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

describe('wantedCells', () => {
  const view = { bbox: [0, 0, 0.04, 0.04] as const, zoom: 14 }

  test('nothing is wanted while the notes are off, before a view, or below the zoom gate', () => {
    expect(
      wantedCells({
        enabled: false,
        view: { ...view, bbox: [...view.bbox] },
        minZoom: NOTES_MIN_ZOOM,
      }),
    ).toEqual([])
    expect(wantedCells({ enabled: true, view: null, minZoom: NOTES_MIN_ZOOM })).toEqual([])
    expect(
      wantedCells({
        enabled: true,
        view: { bbox: [...view.bbox], zoom: NOTES_MIN_ZOOM - 0.1 },
        minZoom: NOTES_MIN_ZOOM,
      }),
    ).toEqual([])
  })

  test('from the zoom gate on, the cells of the view are wanted', () => {
    expect(
      wantedCells({
        enabled: true,
        view: { bbox: [...view.bbox], zoom: 14 },
        minZoom: NOTES_MIN_ZOOM,
      }),
    ).toEqual([cell(0, 0)])
  })
})

describe('the cell query', () => {
  test('one request per cell, through the editor fetch with the OSM service, and none for a loaded cell', async () => {
    const client = new QueryClient()
    const { remote, calls } = answering(collection(2))
    const options = (c: Cell) =>
      notesCell({ remote, apiUrl: API, mode: 'open', cell: c, enabled: true })
    await client.fetchQuery(options(cell(0, 0)))
    await client.fetchQuery(options(cell(1, 0)))
    await client.fetchQuery(options(cell(0, 0)))
    expect(calls.length).toBe(2)
    expect(calls[0]?.service).toBe('osm')
    expect(calls[0]?.url).toContain('bbox=0,0,0.05,0.05')
    expect(calls[1]?.url).toContain('bbox=0.05,0,0.1,0.05')
  })

  test('a 4xx answer is not retried', async () => {
    const client = new QueryClient()
    const { remote, calls } = answering(null, 404)
    const options = notesCell({
      remote,
      apiUrl: API,
      mode: 'open',
      cell: cell(3, 3),
      enabled: true,
    })
    const failure = await client.fetchQuery(options).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HttpError)
    expect(calls.length).toBe(1)
  })

  test('retries are the editor rule', () => {
    const options = notesCell({
      remote: answering(null).remote,
      apiUrl: API,
      mode: 'open',
      cell: cell(0, 0),
      enabled: true,
    })
    expect(options.retry).toBe(shouldRetry)
  })

  test('a disabled query (automated, paused, or a permanent failure) sends nothing', async () => {
    const client = new QueryClient()
    const { remote, calls } = answering(collection(1))
    const observer = new QueryObserver(
      client,
      notesCell({ remote, apiUrl: API, mode: 'open', cell: cell(0, 0), enabled: false }),
    )
    const unsubscribe = observer.subscribe(() => {})
    await flush()
    unsubscribe()
    expect(calls.length).toBe(0)
  })

  test('a cell that leaves the view has its request aborted', async () => {
    const client = new QueryClient()
    const { remote, signals } = hanging()
    const observer = new QueryObserver(
      client,
      notesCell({ remote, apiUrl: API, mode: 'open', cell: cell(5, 5), enabled: true }),
    )
    const unsubscribe = observer.subscribe(() => {})
    await flush()
    unsubscribe()
    expect(signals.length).toBe(1)
    expect(signals[0]?.aborted).toBe(true)
  })

  test('a cell answered at the API limit is marked truncated; a shorter answer is not', async () => {
    const client = new QueryClient()
    const full = answering(collection(NOTES_LIMIT))
    const short = answering(collection(3))
    const cut = await client.fetchQuery(
      notesCell({
        remote: full.remote,
        apiUrl: API,
        mode: 'open',
        cell: cell(7, 7),
        enabled: true,
      }),
    )
    const whole = await client.fetchQuery(
      notesCell({
        remote: short.remote,
        apiUrl: API,
        mode: 'open',
        cell: cell(8, 7),
        enabled: true,
      }),
    )
    expect(cut.truncated).toBe(true)
    expect(cut.notes.length).toBe(NOTES_LIMIT)
    expect(whole.truncated).toBe(false)
  })
})

describe('the cache of the notes', () => {
  test('a note stays findable from its cell after the view has moved on', () => {
    const client = new QueryClient()
    const [note] = parseNotes(collection(1)).notes
    if (!note) throw new Error('the fixture has no note')
    client.setQueryData(notesKey(API, 'open', cell(0, 0)), { notes: [note], truncated: false })
    expect(cachedNote(client, 1)?.id).toBe(1)
    expect(cachedNote(client, 9)).toBeUndefined()
  })
})

describe('failures', () => {
  test('a 4xx and a refused automated request are permanent; a server error and a rate limit are not', () => {
    expect(isPermanentFailure(new HttpError(404, `${API}/x`))).toBe(true)
    expect(isPermanentFailure(new AutomationBlockedError(`${API}/x`))).toBe(true)
    expect(isPermanentFailure(new HttpError(500, `${API}/x`))).toBe(false)
    expect(isPermanentFailure(new RateLimitedError('osm', 429, Date.now() + 1000))).toBe(false)
  })

  test('the message names the pause for a rate limit, and the status for an HTTP error', () => {
    expect(failureMessage(new RateLimitedError('osm', 429, Date.now() + 1000))).toContain('pause')
    expect(failureMessage(new HttpError(404, `${API}/x`))).toContain('(HTTP 404)')
  })
})
