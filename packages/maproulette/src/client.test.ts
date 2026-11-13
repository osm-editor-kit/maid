import { describe, expect, test } from 'bun:test'
import {
  MapRouletteError,
  apiKeyAuth,
  bearerAuth,
  createMapRouletteClient,
  noAuth,
  type FetchInit,
  type FetchLike,
  type FetchResponse,
} from './client.ts'

type Call = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

type Reply = { status?: number; body?: unknown; throws?: Error }

/** A fake fetch: answers from `replies` in order (200 with `{}` when they run out) and records every call */
function fakeFetch(replies: Reply[] = []) {
  const calls: Call[] = []
  const fetch: FetchLike = async (url: string, init: FetchInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body,
    })
    const reply = replies[calls.length - 1] ?? {}
    if (reply.throws) throw reply.throws
    const status = reply.status ?? 200
    const response: FetchResponse = {
      ok: status >= 200 && status < 300,
      status,
      statusText: `status ${status}`,
      json: async () => {
        if (reply.body === undefined) throw new Error('no body')
        return reply.body
      },
    }
    return response
  }
  return { fetch, calls }
}

const base = 'https://example.test/api/v2/'

describe('tasksInBox', () => {
  test('GET with the box, the statuses and geometries; parses the rows', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: [{ id: 1, parentId: 2, point: { lng: 1, lat: 2 } }, { id: 'bad' }],
      },
    ])
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    const tasks = await client.tasksInBox([13.3, 52.4, 13.5, 52.6])
    expect(tasks.map((t) => t.id)).toEqual(['1'])
    expect(calls).toEqual([
      {
        url: 'https://example.test/api/v2/tasks/box/13.3/52.4/13.5/52.6?tStatus=0,1,2,3,5,6&includeGeometries=true',
        method: 'GET',
        headers: {},
        body: undefined,
      },
    ])
  })

  test('own statuses', async () => {
    const { fetch, calls } = fakeFetch([{ body: [] }])
    await createMapRouletteClient({ baseUrl: base, fetch }).tasksInBox([0, 1, 2, 3], [0, 3])
    expect(calls[0]?.url).toBe(
      'https://example.test/api/v2/tasks/box/0/1/2/3?tStatus=0,3&includeGeometries=true',
    )
  })
})

describe('challenge and task', () => {
  test('GET and parse', async () => {
    const { fetch, calls } = fakeFetch([
      { body: { id: 4, name: 'C', checkinComment: 'x' } },
      { body: { id: 9, parent: 4 } },
    ])
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    expect((await client.challenge(4)).checkinComment).toBe('x')
    expect((await client.task('9')).parentId).toBe('4')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.test/api/v2/challenge/4',
      'https://example.test/api/v2/task/9',
    ])
  })

  test('an answer that is not a challenge is a parse error', async () => {
    const { fetch } = fakeFetch([{ body: 'text' }, { body: { nope: 1 } }])
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    expect((await client.challenge(1).catch((e) => e)).kind).toBe('parse')
    expect((await client.task(1).catch((e) => e)).kind).toBe('parse')
  })

  test('an answer that is not JSON is a parse error', async () => {
    const { fetch } = fakeFetch([{}])
    const error = await createMapRouletteClient({ baseUrl: base, fetch })
      .challenge(1)
      .catch((e) => e)
    expect(error).toBeInstanceOf(MapRouletteError)
    expect(error.kind).toBe('parse')
  })
})

describe('errors', () => {
  test('401 is unauthorized, other statuses are http, with the body', async () => {
    const { fetch } = fakeFetch([
      { status: 401, body: { status: 'Unauthorized' } },
      { status: 500, body: { message: 'boom' } },
      { status: 403, body: { status: 'NotAuthorized' } },
    ])
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    const a = await client.challenge(1).catch((e) => e)
    expect(a.kind).toBe('unauthorized')
    expect(a.unauthorized).toBe(true)
    expect(a.status).toBe(401)
    const b = await client.challenge(1).catch((e) => e)
    expect(b.kind).toBe('http')
    expect(b.unauthorized).toBe(false)
    expect(b.status).toBe(500)
    expect(b.body).toEqual({ message: 'boom' })
    expect((await client.challenge(1).catch((e) => e)).unauthorized).toBe(true)
  })

  test('a failing fetch is a network error; an AbortError an aborted one', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const { fetch } = fakeFetch([{ throws: new TypeError('Failed to fetch') }, { throws: abort }])
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    expect((await client.challenge(1).catch((e) => e)).kind).toBe('network')
    expect((await client.challenge(1).catch((e) => e)).kind).toBe('aborted')
  })

  test('the signal reaches fetch', async () => {
    let seen: AbortSignal | undefined
    const fetch: FetchLike = async (_url, init) => {
      seen = init?.signal
      return { ok: true, status: 200, json: async () => [] }
    }
    const controller = new AbortController()
    await createMapRouletteClient({ baseUrl: base, fetch }).tasksInBox([0, 0, 1, 1], undefined, {
      signal: controller.signal,
    })
    expect(seen).toBe(controller.signal)
  })
})

describe('auth', () => {
  test('helpers', async () => {
    expect(await noAuth.headers()).toBeUndefined()
    expect(await bearerAuth(() => 'mrt_abc').headers()).toEqual({
      Authorization: 'Bearer mrt_abc',
    })
    expect(await bearerAuth(async () => undefined).headers()).toBeUndefined()
    expect(await apiKeyAuth(() => 'k').headers()).toEqual({ apiKey: 'k' })
    expect(await apiKeyAuth(() => '').headers()).toBeUndefined()
  })

  test('the headers are on every request', async () => {
    const { fetch, calls } = fakeFetch([{ body: { id: 1 } }])
    await createMapRouletteClient({
      baseUrl: base,
      fetch,
      auth: bearerAuth(() => 'mrt_x'),
    }).challenge(1)
    expect(calls[0]?.headers).toEqual({ Authorization: 'Bearer mrt_x' })
  })
})

describe('setStatus', () => {
  test('comment, status, release in that order, with their headers and bodies', async () => {
    const { fetch, calls } = fakeFetch()
    const client = createMapRouletteClient({
      baseUrl: base,
      fetch,
      auth: apiKeyAuth(() => 'KEY'),
    })
    const result = await client.setStatus(77, 1, {
      comment: 'Done',
      completionResponses: { surface: 'asphalt', ok: true },
    })
    expect(result).toEqual({ commented: true, released: true })
    expect(calls).toEqual([
      {
        url: 'https://example.test/api/v2/task/77/comment?actionId=2',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiKey: 'KEY' },
        body: JSON.stringify({ comment: 'Done' }),
      },
      {
        url: 'https://example.test/api/v2/task/77/1',
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', apiKey: 'KEY' },
        body: JSON.stringify({ surface: 'asphalt', ok: true }),
      },
      {
        url: 'https://example.test/api/v2/task/77/release',
        method: 'GET',
        headers: { apiKey: 'KEY' },
        body: undefined,
      },
    ])
  })

  test('no comment and no responses: just the status and the release, without a body', async () => {
    const { fetch, calls } = fakeFetch()
    const result = await createMapRouletteClient({
      baseUrl: base,
      fetch,
    }).setStatus('5', 2, { completionResponses: {} })
    expect(result).toEqual({ commented: false, released: true })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PUT https://example.test/api/v2/task/5/2',
      'GET https://example.test/api/v2/task/5/release',
    ])
    expect(calls[0]?.body).toBeUndefined()
  })

  test('a failed release is not an error', async () => {
    const { fetch } = fakeFetch([{}, { status: 500 }])
    const result = await createMapRouletteClient({
      baseUrl: base,
      fetch,
    }).setStatus(5, 1)
    expect(result).toEqual({ commented: false, released: false })
  })

  test('a failed comment stops before the status; a failed status before the release', async () => {
    const a = fakeFetch([{ status: 401, body: { status: 'NotAuthorized' } }])
    const errA = await createMapRouletteClient({
      baseUrl: base,
      fetch: a.fetch,
    })
      .setStatus(5, 1, { comment: 'c' })
      .catch((e) => e)
    expect(errA.unauthorized).toBe(true)
    expect(a.calls).toHaveLength(1)

    const b = fakeFetch([{ status: 500 }])
    const errB = await createMapRouletteClient({
      baseUrl: base,
      fetch: b.fetch,
    })
      .setStatus(5, 1)
      .catch((e) => e)
    expect(errB.kind).toBe('http')
    expect(b.calls).toHaveLength(1)
  })

  test('a second update of the same task while one runs is refused, and allowed after it ends', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const fetch: FetchLike = async () => {
      await gate
      return { ok: true, status: 200, json: async () => ({}) }
    }
    const client = createMapRouletteClient({ baseUrl: base, fetch })
    const first = client.setStatus(1, 1)
    const second = await client.setStatus(1, 1).catch((e) => e)
    expect(second.kind).toBe('inflight')
    release()
    await first
    await client.setStatus(1, 1)
  })

  test('a timeout is reported as timeout', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })
    const error = await createMapRouletteClient({ baseUrl: base, fetch })
      .setStatus(1, 1, { timeoutMs: 5 })
      .catch((e) => e)
    expect(error.kind).toBe('timeout')
  })

  test('an abort of the caller is reported as aborted', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })
    const controller = new AbortController()
    const pending = createMapRouletteClient({ baseUrl: base, fetch })
      .setStatus(1, 1, { signal: controller.signal })
      .catch((e) => e)
    controller.abort()
    expect((await pending).kind).toBe('aborted')
  })
})
