import type { QueryClient } from '@tanstack/query-core'
import { createGates, type PauseListener } from './gate.ts'
import { createEditorQueryClient } from './query-client.ts'
import { createRemoteFetch, type RemoteFetch } from './remote-fetch.ts'
import {
  createServiceRegistry,
  SERVICE_IDS,
  type ServiceId,
  type ServiceRegistry,
} from './services.ts'

export interface FetchPause {
  readonly service: ServiceId
  /** Epoch milliseconds when the pause ends. */
  readonly until: number
}

export interface FetchPauses {
  /** The services that are paused now, with the time each pause ends. */
  list(): readonly FetchPause[]
  /** Called with the list after each change of a pause. Returns the unsubscribe function. */
  subscribe(listener: (pauses: readonly FetchPause[]) => void): () => void
}

export interface EditorFetch {
  readonly queries: QueryClient
  readonly fetch: RemoteFetch
  readonly services: ServiceRegistry
  readonly fetchPauses: FetchPauses
}

/** The clock, the fetch and the automation check can be replaced in tests. Leave them out in the app. */
export interface EditorFetchOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  isAutomated?: () => boolean
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}

/** The fetching of one editor: its gates, service registry, fetch, query client and pause list. */
export function createEditorFetch(options: EditorFetchOptions = {}): EditorFetch {
  const gates = createGates({ now: options.now, sleep: options.sleep })
  const services = createServiceRegistry()
  const fetch = createRemoteFetch({
    gates,
    serviceOf: (url) => services.serviceOf(url),
    isAutomated: options.isAutomated,
    fetch: options.fetch,
    now: options.now,
  })

  const listeners = new Set<(pauses: readonly FetchPause[]) => void>()
  const list = (): readonly FetchPause[] =>
    SERVICE_IDS.flatMap((service) => {
      const until = gates[service].paused()
      return until === undefined ? [] : [{ service, until }]
    })
  const emit: PauseListener = () => {
    const pauses = list()
    for (const listener of listeners) {
      try {
        listener(pauses)
      } catch (error) {
        console.error('[maid-core] a fetch pause listener failed', error)
      }
    }
  }
  for (const service of SERVICE_IDS) gates[service].subscribe(emit)

  return {
    queries: createEditorQueryClient(),
    fetch,
    services,
    fetchPauses: {
      list,
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
  }
}
