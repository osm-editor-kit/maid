/**
 * The MapRoulette API client. It holds no state but the set of task updates in flight. The `fetch` function and the
 * way to sign in are injected, so a test uses a fake and the package never decides which server it talks to.
 */
import {
  parseChallenge,
  parseTask,
  parseTasksInBox,
  type MapRouletteChallenge,
  type MapRouletteTask,
  type MapRouletteTaskInBox,
} from './schema.ts'
import { BOX_STATUSES } from './status.ts'

/** What the client needs of `RequestInit` (the global one is assignable to it) */
export type FetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

/** What the client needs of a `Response` */
export type FetchResponse = {
  ok: boolean
  status: number
  statusText?: string
  json(): Promise<unknown>
}

/** The injected `fetch`; the global `fetch` fits */
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>

/**
 * How requests sign in. `headers()` returns the headers to add to a request, or undefined for none. It is asked
 * before every request, so a token can be refreshed. MapRoulette dropped API keys; the replacement (a personal
 * access token or a token exchange) goes behind this interface.
 */
export type MapRouletteAuth = {
  headers(): Promise<Record<string, string> | undefined>
}

/** No sign-in: the read requests work without it */
export const noAuth: MapRouletteAuth = { headers: async () => undefined }

/** `Authorization: Bearer <token>`, for a personal access token (`mrt_...`) or an exchanged token */
export function bearerAuth(
  getToken: () => string | undefined | Promise<string | undefined>,
): MapRouletteAuth {
  return {
    headers: async () => {
      const token = await getToken()
      return token ? { Authorization: `Bearer ${token}` } : undefined
    },
  }
}

/** The old `apiKey` header */
export function apiKeyAuth(
  getKey: () => string | undefined | Promise<string | undefined>,
): MapRouletteAuth {
  return {
    headers: async () => {
      const key = await getKey()
      return key ? { apiKey: key } : undefined
    },
  }
}

/** What went wrong with a request */
export type MapRouletteErrorKind =
  | 'unauthorized'
  | 'http'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'inflight'
  | 'parse'

/** The error of every client method. `status` is the HTTP status, or 0 when there was no answer. */
export class MapRouletteError extends Error {
  readonly kind: MapRouletteErrorKind
  readonly status: number
  readonly body: unknown

  constructor(kind: MapRouletteErrorKind, message: string, status = 0, body: unknown = null) {
    super(message)
    this.name = 'MapRouletteError'
    this.kind = kind
    this.status = status
    this.body = body
  }

  /** The server did not accept the sign-in (HTTP 401, or a body that says NotAuthorized) */
  get unauthorized(): boolean {
    return this.kind === 'unauthorized'
  }
}

/** Options every request takes */
export type RequestOptions = { signal?: AbortSignal }

/** What `setStatus` takes besides the signal */
export type SetStatusOptions = RequestOptions & {
  /** A comment to post before the status is set */
  comment?: string
  /** The answers of the instruction's form fields, sent as the body of the status request */
  completionResponses?: Record<string, string | boolean>
  /** Give up after this time (default 30000) */
  timeoutMs?: number
}

/** What `setStatus` reports: the status is set when it returns; the release is best effort */
export type SetStatusResult = { commented: boolean; released: boolean }

export type MapRouletteClientOptions = {
  /** The API root, e.g. `https://maproulette.org/api/v2` */
  baseUrl: string
  fetch: FetchLike
  auth?: MapRouletteAuth
}

export type MapRouletteClient = {
  /** The tasks in a box [west, south, east, north], with geometries. Default statuses: every one but deleted. */
  tasksInBox(
    bbox: readonly [number, number, number, number],
    statuses?: readonly number[],
    options?: RequestOptions,
  ): Promise<MapRouletteTaskInBox[]>
  challenge(id: string | number, options?: RequestOptions): Promise<MapRouletteChallenge>
  task(id: string | number, options?: RequestOptions): Promise<MapRouletteTask>
  /** Comment (if any), set the status, release the task. The same three requests as iD. */
  setStatus(
    taskId: string | number,
    status: number,
    options?: SetStatusOptions,
  ): Promise<SetStatusResult>
}

/** The default time `setStatus` waits */
export const DEFAULT_SUBMIT_TIMEOUT_MS = 30000

function isNotAuthorized(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === 'object' &&
    (body as { status?: unknown }).status === 'NotAuthorized'
  )
}

/** Create a client */
export function createMapRouletteClient(options: MapRouletteClientOptions): MapRouletteClient {
  const base = options.baseUrl.replace(/\/+$/, '')
  const auth = options.auth ?? noAuth
  const inflight = new Set<string>()

  /** One request: the error is a MapRouletteError, the answer is checked for `ok` */
  async function request(
    url: string,
    init: FetchInit,
    signal: AbortSignal | undefined,
    timedOut: () => boolean = () => false,
  ): Promise<FetchResponse> {
    const authHeaders = await auth.headers()
    const headers = { ...init.headers, ...authHeaders }
    if (signal?.aborted)
      throw new MapRouletteError(timedOut() ? 'timeout' : 'aborted', 'MapRoulette request aborted')
    let response: FetchResponse
    try {
      response = await options.fetch(url, { ...init, headers, signal })
    } catch (error) {
      if (timedOut()) throw new MapRouletteError('timeout', 'MapRoulette request timed out')
      if (isAbort(error) || signal?.aborted)
        throw new MapRouletteError('aborted', 'MapRoulette request aborted')
      throw new MapRouletteError(
        'network',
        error instanceof Error ? error.message : 'Network error',
      )
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      const unauthorized = response.status === 401 || isNotAuthorized(body)
      throw new MapRouletteError(
        unauthorized ? 'unauthorized' : 'http',
        response.statusText || `HTTP ${response.status}`,
        response.status,
        body,
      )
    }
    return response
  }

  async function getJson(
    url: string,
    requestOptions: RequestOptions | undefined,
  ): Promise<unknown> {
    const response = await request(url, { method: 'GET' }, requestOptions?.signal)
    try {
      return await response.json()
    } catch {
      throw new MapRouletteError('parse', 'The answer is not JSON', response.status)
    }
  }

  return {
    async tasksInBox(bbox, statuses = BOX_STATUSES, requestOptions) {
      const [west, south, east, north] = bbox
      const url =
        `${base}/tasks/box/${west}/${south}/${east}/${north}` +
        `?tStatus=${statuses.join(',')}&includeGeometries=true`
      return parseTasksInBox(await getJson(url, requestOptions))
    },

    async challenge(id, requestOptions) {
      const challenge = parseChallenge(await getJson(`${base}/challenge/${id}`, requestOptions))
      if (!challenge) throw new MapRouletteError('parse', `Challenge ${id} is not an object`)
      return challenge
    },

    async task(id, requestOptions) {
      const task = parseTask(await getJson(`${base}/task/${id}`, requestOptions))
      if (!task) throw new MapRouletteError('parse', `Task ${id} has no id`)
      return task
    },

    async setStatus(taskId, status, setOptions = {}) {
      const id = String(taskId)
      // a second update of the same task while one runs (a double click) is refused
      if (inflight.has(id)) throw new MapRouletteError('inflight', 'Task update already inflight')
      inflight.add(id)

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, setOptions.timeoutMs ?? DEFAULT_SUBMIT_TIMEOUT_MS)
      const outer = setOptions.signal
      const onOuterAbort = () => controller.abort()
      if (outer?.aborted) controller.abort()
      else outer?.addEventListener('abort', onOuterAbort, { once: true })

      const json = { 'Content-Type': 'application/json' }
      const isTimedOut = () => timedOut
      try {
        let commented = false
        if (setOptions.comment) {
          // actionId is a query parameter; in the body the server would ignore it
          await request(
            `${base}/task/${id}/comment?actionId=2`,
            {
              method: 'POST',
              headers: json,
              body: JSON.stringify({ comment: setOptions.comment }),
            },
            controller.signal,
            isTimedOut,
          )
          commented = true
        }
        const responses = setOptions.completionResponses
        const hasResponses = !!responses && Object.keys(responses).length > 0
        await request(
          `${base}/task/${id}/${status}`,
          {
            method: 'PUT',
            headers: json,
            ...(hasResponses ? { body: JSON.stringify(responses) } : {}),
          },
          controller.signal,
          isTimedOut,
        )
        // best effort: the status above is what marks the task done. No Content-Type on a GET, which
        // would only cause a CORS preflight.
        let released = true
        try {
          await request(
            `${base}/task/${id}/release`,
            { method: 'GET' },
            controller.signal,
            isTimedOut,
          )
        } catch {
          released = false
        }
        return { commented, released }
      } finally {
        clearTimeout(timer)
        outer?.removeEventListener('abort', onOuterAbort)
        inflight.delete(id)
      }
    },
  }
}

function isAbort(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}
