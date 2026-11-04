/**
 * The user preferences of the OSM API as one small client: one key, one value, per request.
 * Nothing here reads the whole collection for a write, because `PUT /user/preferences` without a key
 * replaces every preference of the user, including those of other apps.
 */

/** The OSM limits on a preference key and on a value, in characters. */
export const PREF_LIMITS = { keyMax: 255, valueMax: 255 } as const

/** The fetch that the transport calls. Injected, so tests use a fake; the default is `globalThis.fetch`. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** A request that the server refused (a status that is not 2xx), or a value the OSM limits refuse. */
export class PrefsHttpError extends Error {
  /** The HTTP status. 400 for a key or value that is refused before anything is sent. */
  readonly status: number
  /** The request URL, when a request was made. */
  readonly url: string | undefined
  constructor(status: number, message: string, url?: string) {
    super(message)
    this.name = 'PrefsHttpError'
    this.status = status
    this.url = url
  }
}

/** One request made by a transport: `GET` for the list (key `null`), `PUT` or `DELETE` with its key. */
export type PrefsCall = { method: 'GET' | 'PUT' | 'DELETE'; key: string | null }

/** The three calls the package needs. Every write names one key. */
export type PrefsTransport = {
  /** Every preference of the user, as a record of key to value. */
  list(): Promise<Record<string, string>>
  /** Sets one key. */
  set(key: string, value: string): Promise<void>
  /** Deletes one key. */
  remove(key: string): Promise<void>
}

/**
 * Throws `PrefsHttpError(400)` when the key or the value is outside the OSM limits, the same answer the
 * server gives. Lengths count characters (code points), as the Rails model does.
 */
export function validatePref(key: string, value: string): void {
  const keyLength = Array.from(key).length
  if (keyLength < 1 || keyLength > PREF_LIMITS.keyMax) {
    throw new PrefsHttpError(
      400,
      `A preference key has 1 to ${PREF_LIMITS.keyMax} characters, not ${keyLength}`,
    )
  }
  const valueLength = Array.from(value).length
  if (valueLength < 1 || valueLength > PREF_LIMITS.valueMax) {
    throw new PrefsHttpError(
      400,
      `A preference value has 1 to ${PREF_LIMITS.valueMax} characters, not ${valueLength}`,
    )
  }
}

/** Options of `httpTransport`. */
export type HttpTransportOptions = {
  /** The API root, for example `https://api.openstreetmap.org`, or the mock with a session path. No trailing `/api/0.6`. */
  apiUrl: string
  /** Sent as the `Authorization` header when given, for example `Bearer <token>`. */
  authHeader?: string
  /** Default: `globalThis.fetch`. */
  fetch?: FetchLike
}

/**
 * The transport over HTTP: `GET .../user/preferences.json`, `PUT .../user/preferences/{key}` (the value as
 * `text/plain`) and `DELETE .../user/preferences/{key}`. Any answer that is not 2xx throws `PrefsHttpError`
 * with its status. The body of a failed answer is not read.
 */
export function httpTransport(options: HttpTransportOptions): PrefsTransport {
  const root = `${options.apiUrl.replace(/\/+$/, '')}/api/0.6/user/preferences`
  const send: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init))

  const withAuth = (headers: Record<string, string>): Record<string, string> =>
    options.authHeader === undefined ? headers : { ...headers, Authorization: options.authHeader }

  const keyUrl = (key: string): string => `${root}/${encodeURIComponent(key)}`

  async function call(url: string, init: RequestInit): Promise<Response> {
    const response = await send(url, init)
    if (!response.ok) {
      // the body is not read; cancelling it lets the connection go
      void response.body?.cancel().catch(() => undefined)
      throw new PrefsHttpError(
        response.status,
        `HTTP ${response.status} for ${init.method ?? 'GET'} ${url}`,
        url,
      )
    }
    return response
  }

  return {
    async list() {
      const url = `${root}.json`
      const response = await call(url, {
        method: 'GET',
        headers: withAuth({ Accept: 'application/json' }),
      })
      return readPreferences((await response.json()) as unknown)
    },
    async set(key, value) {
      validatePref(key, value)
      const url = keyUrl(key)
      await call(url, {
        method: 'PUT',
        headers: withAuth({ 'Content-Type': 'text/plain' }),
        body: value,
      })
    },
    async remove(key) {
      try {
        await call(keyUrl(key), { method: 'DELETE', headers: withAuth({}) })
      } catch (error) {
        // a key that is already gone is what a delete wants: a retry after a half-done remove must not fail on it
        if (!(error instanceof PrefsHttpError && error.status === 404)) throw error
      }
    },
  }
}

/** Reads the answer of the list call: `{ "preferences": { key: value } }`. Anything else throws. */
function readPreferences(body: unknown): Record<string, string> {
  if (typeof body !== 'object' || body === null || !('preferences' in body)) {
    throw new Error('The preferences answer has no "preferences" object')
  }
  const { preferences } = body
  if (typeof preferences !== 'object' || preferences === null || Array.isArray(preferences)) {
    throw new Error('The preferences answer has no "preferences" object')
  }
  const entries = Object.entries(preferences).map(([key, value]): [string, string] => {
    if (typeof value !== 'string') throw new Error(`The preference ${key} is not a string`)
    return [key, value]
  })
  // fromEntries defines each key as its own property, so a key named __proto__ stays a plain key
  return Object.fromEntries(entries)
}

/** A transport that keeps the preferences in memory, with the server's limits and its 404 for a missing key. */
export type MemoryTransport = PrefsTransport & {
  /** Every call so far, in order, including the ones that failed. Tests check it. */
  readonly calls: PrefsCall[]
}

/**
 * An in-memory transport for tests and for runs without a server. It refuses what the server refuses:
 * a key or value outside the limits (400), and a delete of a missing key (404; assumed from the server's
 * behaviour, not measured against it).
 */
export function memoryTransport(initial: Record<string, string> = {}): MemoryTransport {
  const store = new Map<string, string>()
  for (const [key, value] of Object.entries(initial)) {
    validatePref(key, value)
    store.set(key, value)
  }
  const calls: PrefsCall[] = []
  return {
    calls,
    async list() {
      calls.push({ method: 'GET', key: null })
      return Object.fromEntries(store)
    },
    async set(key, value) {
      calls.push({ method: 'PUT', key })
      validatePref(key, value)
      store.set(key, value)
    },
    async remove(key) {
      calls.push({ method: 'DELETE', key })
      if (!store.delete(key)) throw new PrefsHttpError(404, `No preference named ${key}`)
    },
  }
}
