import { describe, expect, it } from 'bun:test'
import { errorOf, messageOf } from './test-support.ts'
import {
  PREF_LIMITS,
  PrefsHttpError,
  httpTransport,
  memoryTransport,
  validatePref,
  type FetchLike,
} from './transport.ts'

/** A fake fetch that records each call and answers with the given response. */
function fakeFetch(answer: () => Response): {
  fetch: FetchLike
  calls: { url: string; init: RequestInit | undefined }[]
} {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return answer()
  }
  return { fetch, calls }
}

describe('validatePref', () => {
  it('accepts a key and a value of 1 and of 255 characters', () => {
    expect(() => validatePref('k', 'v')).not.toThrow()
    expect(() => validatePref('k'.repeat(255), 'v'.repeat(255))).not.toThrow()
  })

  it('refuses an empty key or value, and one of 256 characters, with status 400', () => {
    for (const [key, value] of [
      ['', 'v'],
      ['k', ''],
      ['k'.repeat(256), 'v'],
      ['k', 'v'.repeat(256)],
    ] as const) {
      let thrown: unknown
      try {
        validatePref(key, value)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(PrefsHttpError)
      expect((thrown as PrefsHttpError).status).toBe(400)
    }
  })

  it('counts characters, not UTF-16 units, as the server does', () => {
    // one character of two UTF-16 units: 255 of them are still 255 characters
    expect(() => validatePref('k', '𝄞'.repeat(255))).not.toThrow()
    expect(() => validatePref('k', '𝄞'.repeat(256))).toThrow(PrefsHttpError)
  })

  it('exports the limits the server uses', () => {
    expect(PREF_LIMITS).toEqual({ keyMax: 255, valueMax: 255 })
  })
})

describe('memoryTransport', () => {
  it('accepts a value of 255 characters and refuses 256', async () => {
    const transport = memoryTransport()
    await transport.set('maid.tasks.x', 'v'.repeat(255))
    expect((await transport.list())['maid.tasks.x']).toBe('v'.repeat(255))
    expect(await errorOf(transport.set('maid.tasks.x', 'v'.repeat(256)))).toMatchObject({
      status: 400,
    })
  })

  it('refuses a key of 256 characters', async () => {
    expect(await errorOf(memoryTransport().set('k'.repeat(256), 'v'))).toMatchObject({
      status: 400,
    })
  })

  it('validates the initial values too', () => {
    expect(() => memoryTransport({ k: '' })).toThrow(PrefsHttpError)
  })

  it('lists, sets and removes, and records every call in order', async () => {
    const transport = memoryTransport({ 'iD.foo': 'bar' })
    await transport.set('maid.tasks.a', '1')
    expect(await transport.list()).toEqual({ 'iD.foo': 'bar', 'maid.tasks.a': '1' })
    await transport.remove('maid.tasks.a')
    expect(await transport.list()).toEqual({ 'iD.foo': 'bar' })
    expect(transport.calls).toEqual([
      { method: 'PUT', key: 'maid.tasks.a' },
      { method: 'GET', key: null },
      { method: 'DELETE', key: 'maid.tasks.a' },
      { method: 'GET', key: null },
    ])
  })

  it('answers a delete of a missing key with 404', async () => {
    expect(await errorOf(memoryTransport().remove('nothing'))).toMatchObject({ status: 404 })
  })

  it('returns a copy from list, so a caller cannot change the store', async () => {
    const transport = memoryTransport({ a: '1' })
    const listed = await transport.list()
    listed.a = 'changed'
    expect((await transport.list()).a).toBe('1')
  })
})

describe('httpTransport', () => {
  const root = 'https://api.example.test/s/small'

  it('lists with a GET of preferences.json and reads the preferences', async () => {
    const { fetch, calls } = fakeFetch(
      () => new Response(JSON.stringify({ preferences: { 'iD.foo': 'bar', 'maid.tasks.a': '1' } })),
    )
    const transport = httpTransport({ apiUrl: root, fetch })
    expect(await transport.list()).toEqual({ 'iD.foo': 'bar', 'maid.tasks.a': '1' })
    expect(calls[0]?.url).toBe(`${root}/api/0.6/user/preferences.json`)
    expect(calls[0]?.init?.method).toBe('GET')
  })

  it('keeps a key named __proto__ as a plain key', async () => {
    const { fetch } = fakeFetch(() => new Response('{"preferences":{"__proto__":"x"}}'))
    const listed = await httpTransport({ apiUrl: root, fetch }).list()
    expect(Object.keys(listed)).toEqual(['__proto__'])
  })

  it('rejects an answer without a preferences object, or with a value that is not text', async () => {
    const bad = ['{}', '{"preferences":[]}', '{"preferences":{"a":1}}']
    for (const body of bad) {
      const { fetch } = fakeFetch(() => new Response(body))
      expect(await messageOf(httpTransport({ apiUrl: root, fetch }).list())).not.toBe('resolved')
    }
  })

  it('sets with a PUT on the encoded key, the value as text/plain, and the auth header', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 200 }))
    const transport = httpTransport({ apiUrl: `${root}/`, authHeader: 'Bearer xyz', fetch })
    await transport.set('maid.tasks.a b/c', 'b1234')
    expect(calls[0]?.url).toBe(`${root}/api/0.6/user/preferences/maid.tasks.a%20b%2Fc`)
    expect(calls[0]?.init?.method).toBe('PUT')
    expect(calls[0]?.init?.body).toBe('b1234')
    expect(calls[0]?.init?.headers).toEqual({
      'Content-Type': 'text/plain',
      Authorization: 'Bearer xyz',
    })
  })

  it('deletes with a DELETE on the key, and sends no auth header when none is given', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 200 }))
    await httpTransport({ apiUrl: root, fetch }).remove('maid.tasks.a')
    expect(calls[0]?.url).toBe(`${root}/api/0.6/user/preferences/maid.tasks.a`)
    expect(calls[0]?.init?.method).toBe('DELETE')
    expect(calls[0]?.init?.headers).toEqual({})
  })

  it('throws PrefsHttpError with the status on 401 and 400', async () => {
    for (const status of [401, 400]) {
      const { fetch } = fakeFetch(() => new Response('no', { status }))
      const transport = httpTransport({ apiUrl: root, fetch })
      let thrown: unknown
      try {
        await transport.set('maid.tasks.a', '1')
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(PrefsHttpError)
      expect((thrown as PrefsHttpError).status).toBe(status)
      expect((thrown as PrefsHttpError).url).toBe(`${root}/api/0.6/user/preferences/maid.tasks.a`)
    }
  })

  it('refuses a value over the limit before any request is sent', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null))
    expect(
      await errorOf(httpTransport({ apiUrl: root, fetch }).set('k', 'v'.repeat(256))),
    ).toMatchObject({ status: 400 })
    expect(calls).toHaveLength(0)
  })

  it('never sends a PUT to the collection without a key', async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null))
    const transport = httpTransport({ apiUrl: root, fetch })
    await transport.set('maid.tasks.a', '1')
    await transport.remove('maid.tasks.a')
    for (const call of calls.filter((entry) => entry.init?.method === 'PUT')) {
      expect(call.url).toMatch(/\/api\/0\.6\/user\/preferences\/[^/]+$/)
    }
  })
})
