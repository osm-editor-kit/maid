import { SERVICES, type ServiceId } from './services.ts'

/** The first pause after a rate-limit answer that names no time (fetching-audit.md, owner rule of 2026-10-13). */
export const RATE_LIMIT_FIRST_PAUSE_MS = 10_000
export const RATE_LIMIT_MAX_PAUSE_MS = 60_000

/**
 * The pause after the n-th rate-limit answer in a row that names no time: 10 s, 20 s, 40 s, then 60 s
 * for every further answer. `answersInARow` starts at 1.
 */
export function rateLimitPauseMs(answersInARow: number): number {
  const doubled = RATE_LIMIT_FIRST_PAUSE_MS * 2 ** Math.max(0, answersInARow - 1)
  return Math.min(RATE_LIMIT_MAX_PAUSE_MS, doubled)
}

/** Called with the time the pause ends, or undefined when the pause is over. */
export type PauseListener = (until: number | undefined) => void

export interface GateOptions {
  /** How many tasks may run at once. At least 1. */
  concurrency: number
  /** Epoch milliseconds. Default `Date.now`. Injected so that tests need no real waiting. */
  now?: () => number
  /** Resolves after `ms` milliseconds. Default `setTimeout`. */
  sleep?: (ms: number) => Promise<void>
}

export interface Gate {
  readonly concurrency: number
  /**
   * Runs `task` when a slot is free. Waiting tasks start in the order of the calls. A call that is
   * still waiting when `signal` aborts is removed from the queue and rejects with the signal's reason.
   */
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>
  /**
   * Holds the queue until `untilMs` (epoch milliseconds). Tasks already running are not touched. A
   * later pause that ends after this one replaces it; an earlier one changes nothing.
   */
  pause(untilMs: number): void
  /** The time the pause ends, while it lasts; undefined when the queue runs. */
  paused(): number | undefined
  /**
   * Called when the end of the pause changes: with the new time when a pause starts or is extended,
   * with undefined when it is over. Returns the unsubscribe function.
   */
  subscribe(listener: PauseListener): () => void
  /**
   * A rate-limit answer (429 or 509). With the time the answer names (Retry-After, in ms) the pause
   * lasts that long. Without one it lasts the back-off of `rateLimitPauseMs`. Either way the answer
   * counts for the back-off. Returns the time the pause ends.
   */
  rateLimited(retryAfterMs: number | undefined): number
  /** A successful answer. The back-off starts again at 10 s. */
  succeeded(): void
}

/** The waiting part of a call to `run`: how it starts, and how it is removed. */
interface Waiting {
  start(): void
}

/** A timer that resolves after `ms`. The gate uses it to end a pause. */
export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createGate(options: GateOptions): Gate {
  const { concurrency } = options
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`A gate needs a concurrency of at least 1, got ${concurrency}`)
  }
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  const state: {
    active: number
    queue: Waiting[]
    pausedUntil: number
    /** The end of the pause that a timer is waiting for, if one is set. */
    wakeAt: number | undefined
    /** Rate-limit answers in a row, for the back-off. */
    answers: number
    /** What the listeners were last told. */
    announced: number | undefined
  } = { active: 0, queue: [], pausedUntil: 0, wakeAt: undefined, answers: 0, announced: undefined }
  const listeners = new Set<PauseListener>()

  function paused(): number | undefined {
    return state.pausedUntil > now() ? state.pausedUntil : undefined
  }

  function announce(): void {
    const until = paused()
    if (until === state.announced) return
    state.announced = until
    for (const listener of listeners) {
      try {
        listener(until)
      } catch (error) {
        // A listener must not stop the queue.
        console.error('[maid-core] a fetch pause listener failed', error)
      }
    }
  }

  function pump(): void {
    while (state.active < concurrency && state.queue.length > 0 && paused() === undefined) {
      const next = state.queue.shift()
      if (next === undefined) return
      state.active++
      next.start()
    }
  }

  /** One timer per pause end. When the timer fires early (the pause was extended), it sets another. */
  function wakeWhenPauseEnds(): void {
    if (state.wakeAt !== undefined || paused() === undefined) return
    const at = state.pausedUntil
    state.wakeAt = at
    void sleep(at - now()).then(() => {
      state.wakeAt = undefined
      wakeWhenPauseEnds()
      pump()
      announce()
    })
  }

  function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      const waiting: Waiting = {
        start() {
          signal?.removeEventListener('abort', cancel)
          let running: Promise<T>
          try {
            running = task()
          } catch (error) {
            running = Promise.reject(error)
          }
          running.then(resolve, reject).finally(() => {
            state.active--
            pump()
          })
        },
      }
      function cancel(): void {
        const index = state.queue.indexOf(waiting)
        if (index !== -1) state.queue.splice(index, 1)
        reject(signal?.reason)
      }
      signal?.addEventListener('abort', cancel, { once: true })
      state.queue.push(waiting)
      pump()
    })
  }

  function pause(untilMs: number): void {
    state.pausedUntil = Math.max(state.pausedUntil, untilMs)
    wakeWhenPauseEnds()
    announce()
  }

  function rateLimited(retryAfterMs: number | undefined): number {
    state.answers++
    const pauseMs = Math.max(0, retryAfterMs ?? rateLimitPauseMs(state.answers))
    pause(now() + pauseMs)
    return state.pausedUntil
  }

  function subscribe(listener: PauseListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    concurrency,
    run,
    pause,
    paused,
    subscribe,
    rateLimited,
    succeeded() {
      state.answers = 0
    },
  }
}

/** One gate per service. The app and the editor use this; tests may build their own. */
export type Gates = Readonly<Record<ServiceId, Gate>>

export function createGates(timing: Pick<GateOptions, 'now' | 'sleep'> = {}): Gates {
  const gate = (id: ServiceId): Gate => createGate({ ...timing, concurrency: SERVICES[id].limit })
  return {
    osm: gate('osm'),
    wikimedia: gate('wikimedia'),
    mapillary: gate('mapillary'),
    panoramax: gate('panoramax'),
    data: gate('data'),
    local: gate('local'),
  }
}
