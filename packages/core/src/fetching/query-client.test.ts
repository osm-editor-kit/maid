import { afterEach, describe, expect, test } from 'bun:test'
import { hashKey, type QueryClient } from '@tanstack/query-core'
import {
  createEditorQueryClient,
  keys,
  MAXLAG_RETRY_DELAY_MS,
  MaxlagError,
  retryDelayFor,
  SESSION_DATA,
  shouldRetry,
  VIEW_DATA,
} from './query-client.ts'
import {
  AutomationBlockedError,
  HttpError,
  RateLimitedError,
  RemoteTimeoutError,
} from './remote-fetch.ts'
import { settle } from './test-clock.ts'

const API = 'https://api.openstreetmap.org/api/0.6'
const clients: QueryClient[] = []

function newClient(): QueryClient {
  const client = createEditorQueryClient()
  clients.push(client)
  return client
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})

describe('retry rule', () => {
  test('a 4xx answer is never retried', () => {
    expect(shouldRetry(0, new HttpError(404, API))).toBe(false)
    expect(shouldRetry(0, new HttpError(400, API))).toBe(false)
    expect(shouldRetry(0, new HttpError(403, API))).toBe(false)
  })

  test('a 5xx answer and a timeout get two retries, then none', () => {
    expect(shouldRetry(0, new HttpError(503, API))).toBe(true)
    expect(shouldRetry(1, new HttpError(503, API))).toBe(true)
    expect(shouldRetry(2, new HttpError(503, API))).toBe(false)
    expect(shouldRetry(0, new RemoteTimeoutError(API, 30_000))).toBe(true)
    expect(shouldRetry(2, new RemoteTimeoutError(API, 30_000))).toBe(false)
  })

  test('a rate limit and a refused automated request are never retried', () => {
    expect(shouldRetry(0, new RateLimitedError('osm', 429, 0))).toBe(false)
    expect(shouldRetry(0, new AutomationBlockedError(API))).toBe(false)
  })

  test('an abort is never retried', () => {
    expect(shouldRetry(0, new DOMException('stopped', 'AbortError'))).toBe(false)
  })

  test('a network failure with no answer is retried twice', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false)
  })

  test('the pause before a retry is 1 s, then 2 s, capped at 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((count) => retryDelayFor(count))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ])
  })

  test('a maxlag refusal is retried, and waits 5 s before each retry', () => {
    const maxlag = new MaxlagError()
    expect(shouldRetry(0, maxlag)).toBe(true)
    expect(shouldRetry(1, maxlag)).toBe(true)
    expect(shouldRetry(2, maxlag)).toBe(false)
    expect([0, 1].map((count) => retryDelayFor(count, maxlag))).toEqual([5000, 5000])
    expect(MAXLAG_RETRY_DELAY_MS).toBe(5000)
  })

  test('the error does not change the pause of any other error', () => {
    expect(retryDelayFor(0, new TypeError('Failed to fetch'))).toBe(1000)
    expect(retryDelayFor(1, new HttpError(503, API))).toBe(2000)
  })
})

describe('defaults', () => {
  test('no refetch on focus or reconnect, queries wait offline, mutations are not retried', () => {
    const defaults = newClient().getDefaultOptions()
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaults.queries?.refetchOnReconnect).toBe(false)
    expect(defaults.queries?.networkMode).toBe('online')
    expect(defaults.queries?.staleTime).toBe(0)
    expect(defaults.queries?.gcTime).toBe(5 * 60_000)
    expect(defaults.mutations?.retry).toBe(false)
  })

  test('the presets: view data follows the view, session data never goes stale', () => {
    expect(VIEW_DATA).toEqual({ staleTime: 0, gcTime: 300_000 })
    expect(SESSION_DATA).toEqual({ staleTime: Infinity, gcTime: Infinity })
  })
})

describe('queries', () => {
  test('a 404 is tried once', async () => {
    const client = newClient()
    let calls = 0
    const failure = await client
      .fetchQuery({
        queryKey: ['test', 'not-found'],
        queryFn: () => {
          calls++
          return Promise.reject(new HttpError(404, API))
        },
      })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HttpError)
    expect(calls).toBe(1)
  })

  test('a 503 is tried three times in all (the first try and two retries)', async () => {
    const client = newClient()
    let calls = 0
    const failure = await client
      .fetchQuery({
        queryKey: ['test', 'unavailable'],
        queryFn: () => {
          calls++
          return Promise.reject(new HttpError(503, API))
        },
        // the real pauses are 1 s and 2 s; the test waits less
        retryDelay: 1,
      })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(HttpError)
    expect(calls).toBe(3)
  })

  test('a rate limit is tried once: the gate holds the service, not the query', async () => {
    const client = newClient()
    let calls = 0
    const failure = await client
      .fetchQuery({
        queryKey: ['test', 'limited'],
        queryFn: () => {
          calls++
          return Promise.reject(new RateLimitedError('osm', 429, Date.now() + 1000))
        },
        retryDelay: 1,
      })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RateLimitedError)
    expect(calls).toBe(1)
  })

  test('session data is not asked again by a second fetchQuery of the same key', async () => {
    const client = newClient()
    let calls = 0
    const queryFn = () => {
      calls++
      return Promise.resolve('page')
    }
    const first = await client.fetchQuery({
      queryKey: keys.wiki('Key:building'),
      queryFn,
      ...SESSION_DATA,
    })
    const second = await client.fetchQuery({
      queryKey: keys.wiki('Key:building'),
      queryFn,
      ...SESSION_DATA,
    })
    expect(first).toBe('page')
    expect(second).toBe('page')
    expect(calls).toBe(1)
  })

  test('two simultaneous fetchQuery calls of one key call the function once', async () => {
    const client = newClient()
    let calls = 0
    const options = {
      queryKey: ['test', 'shared'],
      queryFn: async () => {
        calls++
        await settle()
        return 'once'
      },
    }
    const results = await Promise.all([client.fetchQuery(options), client.fetchQuery(options)])
    expect(results).toEqual(['once', 'once'])
    expect(calls).toBe(1)
  })
})

describe('keys', () => {
  test('keys are [service, resource, ...params]', () => {
    expect(keys.wiki('Key:building')).toEqual(['wikimedia', 'page', 'Key:building'])
    expect(keys.wikidata('Q42')).toEqual(['wikimedia', 'entity', 'Q42'])
    expect(keys.imageryIndex()).toEqual(['data', 'imagery-index'])
  })

  test('the OSM keys carry the origin of the API, and ignore its path', () => {
    expect(keys.osmRelation(API, 5)).toEqual([
      'osm',
      'relation',
      'https://api.openstreetmap.org',
      5,
      'full',
    ])
    expect(keys.osmUser(API)).toEqual(['osm', 'user', 'https://api.openstreetmap.org', 'me'])
    expect(keys.osmCapabilities(API)).toEqual([
      'osm',
      'capabilities',
      'https://api.openstreetmap.org',
    ])
    // the mock and the live API are different data
    expect(hashKey(keys.osmRelation(API, 5))).not.toBe(
      hashKey(keys.osmRelation('http://localhost:8090/api/0.6', 5)),
    )
  })

  test('the same parameters give the same hash, whatever the order of the filters', () => {
    const a = keys.photos('mapillary', 14, 8800, 5400, { layer: 'photos', sequence: null })
    const b = keys.photos('mapillary', 14, 8800, 5400, { sequence: null, layer: 'photos' })
    expect(hashKey(a)).toBe(hashKey(b))
    expect(a).toEqual(['mapillary', 'photos', 14, 8800, 5400, { layer: 'photos', sequence: null }])
  })

  test('notes keys carry the origin, the mode and the grid cell', () => {
    expect(keys.notes(API, 'all', 2200, 1350)).toEqual([
      'osm',
      'notes',
      'https://api.openstreetmap.org',
      'all',
      2200,
      1350,
    ])
  })
})
