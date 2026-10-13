import { describe, expect, test } from 'bun:test'
import { createGates } from './gate.ts'
import {
  AutomationBlockedError,
  createRemoteFetch,
  HttpError,
  parseRetryAfter,
  RateLimitedError,
  RemoteTimeoutError,
  type FetchLike,
} from './remote-fetch.ts'
import { createServiceRegistry } from './services.ts'
import { createTestClock, settle, type TestClock } from './test-clock.ts'

const OSM = 'https://api.example.org/api/0.6/relation/1/full'
const LOCAL_MOCK = 'http://localhost:8090/api/0.6/relation/1/full'
const DATA_HOST = 'https://tiles.example.org/layer.geojson'
const WIKI = 'https://en.wikipedia.org/w/api.php?action=query'

/** A fake fetch: `respond` answers each call; every call is recorded. */
function fakeFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  const send: FetchLike = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(respond(url, init))
  }
  return { send, calls }
}

function setup(options: {
  automated?: boolean
  respond?: (url: string, init?: RequestInit) => Response | Promise<Response>
}) {
  const clock: TestClock = createTestClock()
  const gates = createGates({ now: clock.now, sleep: clock.sleep })
  const services = createServiceRegistry()
  services.register('osm', 'api.example.org')
  const { send, calls } = fakeFetch(options.respond ?? (() => new Response('ok', { status: 200 })))
  const remote = createRemoteFetch({
    gates,
    serviceOf: (url) => services.serviceOf(url),
    isAutomated: () => options.automated === true,
    fetch: send,
    now: clock.now,
  })
  return { remote, gates, clock, calls }
}

/** The rejection of a promise, or undefined when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('parseRetryAfter', () => {
  const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')

  test('reads seconds', () => {
    expect(parseRetryAfter('7', now)).toBe(7000)
    expect(parseRetryAfter(' 120 ', now)).toBe(120_000)
    expect(parseRetryAfter('0', now)).toBe(0)
  })

  test('reads an HTTP date as the time from now', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:30 GMT', now)).toBe(30_000)
  })

  test('a date in the past means no wait', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:00:00 GMT', now)).toBe(0)
  })

  test('garbage, negative, fractional, empty and absent values are undefined', () => {
    expect(parseRetryAfter('soon', now)).toBeUndefined()
    expect(parseRetryAfter('-5', now)).toBeUndefined()
    expect(parseRetryAfter('1.5', now)).toBeUndefined()
    expect(parseRetryAfter('', now)).toBeUndefined()
    expect(parseRetryAfter('   ', now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
    expect(parseRetryAfter('9'.repeat(400), now)).toBeUndefined()
  })
})

describe('automation', () => {
  test('a local URL under automation is sent', async () => {
    const { remote, calls } = setup({ automated: true })
    const response = await remote(LOCAL_MOCK)
    expect(response.status).toBe(200)
    expect(calls.map((call) => call.url)).toEqual([LOCAL_MOCK])
  })

  test('the other local names are local too: 127.0.0.1, [::1], *.localhost, *.test', async () => {
    const { remote, calls } = setup({ automated: true })
    for (const url of [
      'http://127.0.0.1:5173/x',
      'http://[::1]:8090/x',
      'https://maid.localhost/x',
      'https://maid.test/x',
    ]) {
      await remote(url)
    }
    expect(calls).toHaveLength(4)
  })

  test('a remote URL under automation throws, and fetch is never called', async () => {
    const { remote, calls } = setup({ automated: true })
    await expect(remote(OSM)).rejects.toBeInstanceOf(AutomationBlockedError)
    await expect(remote(DATA_HOST)).rejects.toBeInstanceOf(AutomationBlockedError)
    expect(calls).toHaveLength(0)
  })

  test('a remote URL for a person is sent', async () => {
    const { remote, calls } = setup({ automated: false })
    await remote(OSM)
    expect(calls).toHaveLength(1)
  })
})

describe('answers', () => {
  test('a 2xx answer is returned as the response', async () => {
    const { remote } = setup({ respond: () => new Response('{"a":1}', { status: 200 }) })
    const response = await remote(OSM)
    expect(await response.json()).toEqual({ a: 1 })
  })

  test('429 with Retry-After: 7 pauses the service for 7 s and throws', async () => {
    const { remote, gates, clock } = setup({
      respond: () => new Response(null, { status: 429, headers: { 'Retry-After': '7' } }),
    })
    const start = clock.now()
    const failure = await rejection(remote(OSM))
    expect(failure).toBeInstanceOf(RateLimitedError)
    if (!(failure instanceof RateLimitedError)) throw new Error('expected a RateLimitedError')
    expect(failure.service).toBe('osm')
    expect(failure.status).toBe(429)
    expect(failure.until).toBe(start + 7000)
    expect(gates.osm.paused()).toBe(start + 7000)
  })

  test('509 without a header pauses 10 s, a second one 20 s', async () => {
    const { remote, gates, clock, calls } = setup({
      respond: () => new Response(null, { status: 509 }),
    })
    const first = clock.now()
    expect(await rejection(remote(OSM))).toBeInstanceOf(RateLimitedError)
    expect(gates.osm.paused()).toBe(first + 10_000)

    await clock.advance(10_000)
    const second = clock.now()
    expect(await rejection(remote(OSM))).toBeInstanceOf(RateLimitedError)
    expect(gates.osm.paused()).toBe(second + 20_000)
    expect(calls).toHaveLength(2)
  })

  test('a request during a pause waits in the gate and is not sent', async () => {
    const { remote, clock, calls } = setup({
      respond: () => new Response(null, { status: 429 }),
    })
    expect(await rejection(remote(OSM))).toBeInstanceOf(RateLimitedError)
    const waiting = rejection(remote(OSM))
    await settle()
    expect(calls).toHaveLength(1)
    await clock.advance(10_000)
    expect(await waiting).toBeInstanceOf(RateLimitedError)
    expect(calls).toHaveLength(2)
  })

  test('a 404 throws HttpError with the status and does not pause the service', async () => {
    const { remote, gates } = setup({ respond: () => new Response(null, { status: 404 }) })
    const failure = await rejection(remote(OSM))
    expect(failure).toBeInstanceOf(HttpError)
    if (!(failure instanceof HttpError)) throw new Error('expected an HttpError')
    expect(failure.status).toBe(404)
    expect(gates.osm.paused()).toBeUndefined()
  })

  test('a 503 is an HttpError too, and does not pause the service', async () => {
    const { remote, gates } = setup({ respond: () => new Response(null, { status: 503 }) })
    expect(await rejection(remote(OSM))).toBeInstanceOf(HttpError)
    expect(gates.osm.paused()).toBeUndefined()
  })
})

describe('time limit and cancel', () => {
  /** A fetch that never answers, and rejects when its signal aborts. */
  const hang: FetchLike = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })

  test('a request with no answer in time aborts the fetch and throws a timeout', async () => {
    const clock = createTestClock()
    const gates = createGates({ now: clock.now, sleep: clock.sleep })
    const seen: AbortSignal[] = []
    const remote = createRemoteFetch({
      gates,
      serviceOf: () => 'data',
      isAutomated: () => false,
      fetch: (url, init) => {
        if (init?.signal) seen.push(init.signal)
        return hang(url, init)
      },
      now: clock.now,
    })
    const failure = await rejection(remote(DATA_HOST, { timeoutMs: 5 }))
    expect(failure).toBeInstanceOf(RemoteTimeoutError)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.aborted).toBe(true)
  })

  test('the caller abort wins and is not reported as a timeout', async () => {
    const clock = createTestClock()
    const remote = createRemoteFetch({
      gates: createGates({ now: clock.now, sleep: clock.sleep }),
      serviceOf: () => 'data',
      isAutomated: () => false,
      fetch: hang,
      now: clock.now,
    })
    const controller = new AbortController()
    const reason = new Error('the person left the page')
    const pending = remote(OSM, { signal: controller.signal, timeoutMs: 60_000 })
    controller.abort(reason)
    const failure = await rejection(pending)
    expect(failure).toBe(reason)
    expect(failure).not.toBeInstanceOf(RemoteTimeoutError)
  })

  test("an abort while fetch is in flight rejects with the caller's reason", async () => {
    const clock = createTestClock()
    const gates = createGates({ now: clock.now, sleep: clock.sleep })
    const remote = createRemoteFetch({
      gates,
      serviceOf: () => 'data',
      isAutomated: () => false,
      fetch: hang,
      now: clock.now,
    })
    const controller = new AbortController()
    const reason = new Error('stop')
    const pending = remote(DATA_HOST, { signal: controller.signal })
    await settle()
    controller.abort(reason)
    expect(await rejection(pending)).toBe(reason)
  })
})

describe('isolation between services', () => {
  test('a paused service does not hold another service', async () => {
    const { remote, gates, calls } = setup({
      respond: (url) =>
        new Response(null, { status: url.startsWith('https://api.example.org') ? 429 : 200 }),
    })
    expect(await rejection(remote(OSM))).toBeInstanceOf(RateLimitedError)
    expect(gates.osm.paused()).toBeDefined()
    const response = await remote(DATA_HOST)
    expect(response.status).toBe(200)
    expect(calls.map((call) => call.url)).toEqual([OSM, DATA_HOST])
  })

  test('Wikimedia runs one request at a time', async () => {
    const clock = createTestClock()
    const gates = createGates({ now: clock.now, sleep: clock.sleep })
    const answers: ((response: Response) => void)[] = []
    const calls: string[] = []
    const remote = createRemoteFetch({
      gates,
      serviceOf: () => 'wikimedia',
      isAutomated: () => false,
      fetch: (url) => {
        calls.push(url)
        return new Promise<Response>((resolve) => answers.push(resolve))
      },
      now: clock.now,
    })
    const first = remote(`${WIKI}&titles=Key:a`)
    const second = remote(`${WIKI}&titles=Key:b`)
    await settle()
    expect(calls).toHaveLength(1)
    answers[0]?.(new Response('a'))
    expect(await first).toBeInstanceOf(Response)
    await settle()
    expect(calls).toHaveLength(2)
    answers[1]?.(new Response('b'))
    expect(await second).toBeInstanceOf(Response)
  })
})
