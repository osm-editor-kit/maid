import { QueryClient } from '@tanstack/query-core'
import { AutomationBlockedError, HttpError, RateLimitedError } from './remote-fetch.ts'

const MINUTE_MS = 60_000

/** At most this many retries after the first try: three tries in all. */
export const MAX_RETRIES = 2
export const FIRST_RETRY_DELAY_MS = 1_000
export const MAX_RETRY_DELAY_MS = 30_000

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

/**
 * The retry rule of every query. TanStack passes `failureCount` as the number of retries made so far
 * (0 before the first retry). Never retried: a 4xx answer, a rate limit (the gate pauses instead), a
 * refused automated request, and an abort. Other errors, including timeouts and 5xx, get two retries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (isAbortError(error)) return false
  if (error instanceof RateLimitedError || error instanceof AutomationBlockedError) return false
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false
  return true
}

/** The pause before a retry: 1 s, then 2 s, capped at 30 s. `failureCount` as passed by TanStack. */
export function retryDelayFor(failureCount: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2 ** Math.max(0, failureCount))
}

/**
 * Data that follows the map view (fetching-audit.md, 5.2): stale at once, so each use asks again.
 * A request already in flight for the same key is shared, not repeated. It stays in memory for five
 * minutes after the last use.
 */
export const VIEW_DATA = { staleTime: 0, gcTime: 5 * MINUTE_MS } as const

/** Reference data (wiki pages, Wikidata entities, a relation in full, the user, capabilities): kept for the session. */
export const SESSION_DATA = { staleTime: Infinity, gcTime: Infinity } as const

/**
 * The editor's query client. Defaults: no refetch on focus or reconnect, queries wait while offline,
 * the retry rule above, and mutations are never retried (a failed save is not repeated by code).
 */
export function createEditorQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        ...VIEW_DATA,
        retry: shouldRetry,
        retryDelay: retryDelayFor,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        networkMode: 'online',
      },
      mutations: { retry: false },
    },
  })
}

export type KeyParam = string | number | boolean | null
/** Filters and options in a key: plain values only, so that the key serialises the same way every time. */
export type KeyParams = Readonly<Record<string, KeyParam>>
export type PhotoProvider = 'mapillary' | 'panoramax'

/** The origin of an API URL. It keeps the mock, live and dev servers' data apart. */
function originOf(apiUrl: string): string {
  return new URL(apiUrl).origin
}

/**
 * Query keys: `[service, resource, ...params]`, with the service as in services.ts. Params are
 * strings, numbers, booleans or null, so every key serialises the same way each time.
 */
export const keys = {
  wiki: (title: string) => ['wikimedia', 'page', title] as const,
  wikidata: (id: string) => ['wikimedia', 'entity', id] as const,
  osmRelation: (apiUrl: string, id: number) =>
    ['osm', 'relation', originOf(apiUrl), id, 'full'] as const,
  osmUser: (apiUrl: string) => ['osm', 'user', originOf(apiUrl), 'me'] as const,
  osmCapabilities: (apiUrl: string) => ['osm', 'capabilities', originOf(apiUrl)] as const,
  imageryIndex: () => ['data', 'imagery-index'] as const,
  photos: (provider: PhotoProvider, z: number, x: number, y: number, filters: KeyParams) =>
    [provider, 'photos', z, x, y, filters] as const,
  notes: (apiUrl: string, z: number, x: number, y: number, options: KeyParams) =>
    ['osm', 'notes', originOf(apiUrl), z, x, y, options] as const,
}
