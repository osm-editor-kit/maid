import { isAutomated as isAutomatedRun } from '../automated.ts'
import type { Gate, Gates } from './gate.ts'
import { isLocalUrl, type ServiceId } from './services.ts'

/** The time limit of a request, from the moment it is sent until the response headers arrive. */
export const DEFAULT_TIMEOUT_MS = 30_000

export class AutomationBlockedError extends Error {
  readonly url: string
  constructor(url: string) {
    super(
      `Automated run: a request to ${new URL(url).host} is refused, only local hosts are allowed`,
    )
    this.name = 'AutomationBlockedError'
    this.url = url
  }
}

/** A "too many requests" answer (429 or 509). The service is paused until `until`. */
export class RateLimitedError extends Error {
  readonly service: ServiceId
  readonly status: number
  /** Epoch milliseconds when the pause of the service ends. */
  readonly until: number
  constructor(service: ServiceId, status: number, until: number) {
    super(
      `The ${service} service answered ${status} (too many requests); paused until ${new Date(until).toISOString()}`,
    )
    this.name = 'RateLimitedError'
    this.service = service
    this.status = status
    this.until = until
  }
}

/** Any other answer that is not 2xx. */
export class HttpError extends Error {
  readonly status: number
  readonly url: string
  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

/** No response headers arrived within the time limit. */
export class RemoteTimeoutError extends Error {
  readonly url: string
  readonly timeoutMs: number
  constructor(url: string, timeoutMs: number) {
    super(`No answer from ${new URL(url).host} within ${timeoutMs} ms`)
    this.name = 'RemoteTimeoutError'
    this.url = url
    this.timeoutMs = timeoutMs
  }
}

/**
 * The value of a `Retry-After` header, in milliseconds from `now`. It is either a number of seconds
 * or an HTTP date. Anything else (absent, empty, signed, fractional, not a date) is undefined, and the
 * caller uses its own back-off. A date in the past means no wait (0).
 */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  const text = value?.trim() ?? ''
  if (text === '') return undefined
  if (/^[+\-.\d]+$/.test(text)) {
    if (!/^\d+$/.test(text)) return undefined
    const ms = Number(text) * 1000
    return Number.isFinite(ms) ? ms : undefined
  }
  const date = Date.parse(text)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - now)
}

/** The fetch that the editor calls. Injected, so tests use a fake; the default is `globalThis.fetch`. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface RemoteFetchOptions {
  /** Cancels the request. The cancel reason comes back as the rejection, not as a timeout. */
  signal?: AbortSignal
  /** Milliseconds until the response headers must arrive. Default 30 000. */
  timeoutMs?: number
  /** Overrides the service found from the URL. */
  service?: ServiceId
}

export type RemoteRequestInit = RequestInit & RemoteFetchOptions

export type RemoteFetch = (url: string | URL, init?: RemoteRequestInit) => Promise<Response>

export interface RemoteFetchDeps {
  gates: Gates
  /** The service of a URL, from the service registry. */
  serviceOf: (url: URL) => ServiceId
  /**
   * Default: the real check (`navigator.webdriver`). Tests set it to simulate an automated run.
   * Leaving it out cannot turn the check off, because the default is the real check.
   */
  isAutomated?: () => boolean
  /** Default: `globalThis.fetch`. */
  fetch?: FetchLike
  /** Epoch milliseconds, for the date form of Retry-After. Default `Date.now`. */
  now?: () => number
}

/**
 * The one function that sends requests to remote hosts. In order: refuse a non-local host under
 * automation (before anything else, so no request object is made); wait for the service's gate;
 * send with a time limit; on 429 or 509 pause the service and throw `RateLimitedError`; on any
 * other non-2xx throw `HttpError`; otherwise return the response.
 *
 * The time limit covers the wait for the headers. Reading the body is the caller's, and is not limited.
 */
export function createRemoteFetch(deps: RemoteFetchDeps): RemoteFetch {
  const { gates, serviceOf } = deps
  const isAutomated = deps.isAutomated ?? isAutomatedRun
  const now = deps.now ?? Date.now
  const send: FetchLike = deps.fetch ?? ((url, init) => globalThis.fetch(url, init))

  return async (url, init = {}) => {
    const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, service, ...requestInit } = init
    const target = new URL(url)
    if (isAutomated() && !isLocalUrl(target)) throw new AutomationBlockedError(target.href)

    const id = service ?? serviceOf(target)
    const gate: Gate = gates[id]
    return gate.run(async () => {
      const response = await sendWithTimeout(target, requestInit, signal, timeoutMs)
      if (response.ok) {
        gate.succeeded()
        return response
      }
      // The body is not read; cancelling it lets the connection go.
      void response.body?.cancel().catch(() => undefined)
      if (response.status === 429 || response.status === 509) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'), now())
        const until = gate.rateLimited(retryAfter)
        throw new RateLimitedError(id, response.status, until)
      }
      throw new HttpError(response.status, target.href)
    }, signal)
  }

  /** Sends one request. It combines the caller's signal and the timer: `AbortController` works in every target browser. */
  async function sendWithTimeout(
    target: URL,
    requestInit: RequestInit,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController()
    let timedOut = false
    const timer = Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : undefined
    const forward = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', forward, { once: true })
    try {
      return await send(target.href, { ...requestInit, signal: controller.signal })
    } catch (error) {
      // The caller's abort wins over a timeout that happened to fire too.
      if (signal?.aborted) throw signal.reason
      if (timedOut) throw new RemoteTimeoutError(target.href, timeoutMs)
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    }
  }
}
