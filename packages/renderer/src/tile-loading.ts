/**
 * The state of the OSM map data tiles that the engine loads (docs/research/fetching-audit.md, 4a and 5.5).
 * One state per tile key, and the rules for when a tile may be asked again. Pure: the time is passed in,
 * and the only side effect is that a request which is no longer wanted gets aborted.
 *
 * The rules:
 * - A tile is asked when it is wanted (in view), and is neither loaded, loading, nor waiting.
 * - A failure (network error, timeout, a 5xx answer, bad JSON) waits 1 s after the first failure and 2 s
 *   after the second. The third failure in a row, and every later one, waits 30 s. So a tile that keeps
 *   failing costs one request per 30 s once its three quick tries are used, never one per map move.
 * - A 4xx answer is not retried. While the tile stays in view it is not asked again. When it leaves the
 *   view, the 30 s wait starts, and it may be asked again once the view wants it after that wait.
 * - A rate-limit answer (429 or 509) puts the tile back to idle. Nothing is asked until the pause ends.
 * - A request that is aborted (the tile left the view, or the engine was reset) goes back to idle. It counts
 *   as neither a failure nor a try.
 * - A request that is no longer the tile's current one (it was aborted and the tile was asked again) has
 *   no effect when it ends.
 */
import { AutomationBlockedError, HttpError, RateLimitedError } from '@osm-editor-kit/maid-core'

/** A tile as the engine keys it: `x/y` in OSM zoom 16 tile numbers. */
export type TileKey = string

/** The time limit of one tile request, from the send until the answer's headers arrive. */
export const TILE_TIMEOUT_MS = 30_000
/** The wait after a refused tile leaves the view, and the wait after the third failure in a row and every later one. */
export const REST_MS = 30_000

/** The wait after a failure, given how many failures in a row the tile has now: 1 s, 2 s, then the rest. */
export function waitAfterFailure(tries: number): number {
  if (tries === 1) return 1_000
  if (tries === 2) return 2_000
  return REST_MS
}

export type TileState =
  /** Not asked. `tries` counts the failures in a row, and is kept when a request is aborted. */
  | { readonly status: 'idle'; readonly tries: number }
  /** Asked; `controller` cancels the request, `startedAt` is the time it was sent. */
  | {
      readonly status: 'loading'
      readonly tries: number
      readonly controller: AbortController
      readonly startedAt: number
    }
  | { readonly status: 'loaded' }
  /**
   * Not asked again before `retryAt` (epoch ms). For a refused tile in view `retryAt` is Infinity: it waits
   * until it leaves the view and the rest has passed.
   */
  | {
      readonly status: 'failed'
      readonly tries: number
      readonly reason: 'error' | 'refused'
      readonly retryAt: number
    }

/** How a request ended, as the engine reports it. */
export type TileOutcome =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'refused' }
  | { readonly kind: 'rateLimited'; readonly until: number }
  | { readonly kind: 'aborted' }

export interface TileLoads {
  readonly tiles: Map<TileKey, TileState>
  /** Epoch ms until which no tile is asked, after a rate-limit answer. 0 when there is no pause. */
  pausedUntil: number
}

export interface LoadPlan {
  /** The tiles to ask now, in the order they were wanted, each with the controller that cancels its request. */
  readonly start: readonly { readonly key: TileKey; readonly controller: AbortController }[]
  /** Epoch ms of the next moment at which a wanted tile may be asked (the end of a wait or of a pause). */
  readonly nextWakeAt: number | undefined
}

const FRESH: TileState = { status: 'idle', tries: 0 }

export function createTileLoads(): TileLoads {
  return { tiles: new Map(), pausedUntil: 0 }
}

export function tileKey(x: number, y: number): TileKey {
  return `${x}/${y}`
}

export function tileXY(key: TileKey): [number, number] {
  const [x = Number.NaN, y = Number.NaN] = key.split('/').map(Number)
  return [x, y]
}

/** The tiles ordered by their distance from the centre of the view, nearest first. A copy; the input is not changed. */
export function nearestFirst(
  tiles: readonly (readonly [number, number])[],
  centre: readonly [number, number],
): [number, number][] {
  const [cx, cy] = centre
  const distance = ([x, y]: readonly [number, number]) => Math.hypot(x - cx, y - cy)
  return tiles.map(([x, y]): [number, number] => [x, y]).sort((a, b) => distance(a) - distance(b))
}

/** The state of a tile; a tile that was never asked is idle. */
export function stateOf(loads: TileLoads, key: TileKey): TileState {
  return loads.tiles.get(key) ?? FRESH
}

/**
 * What the engine does with the wanted tiles now, and what it must cancel.
 *
 * First the tiles that are no longer wanted: a loading one is aborted and goes back to idle, and a refused
 * one that has left the view starts its 30 s wait. Then the wanted tiles in the given order: a tile that is
 * loading or loaded is left alone; a failed tile is asked once its wait is over; an idle one is asked. While
 * a rate-limit pause lasts nothing is asked. `nextWakeAt` is the moment the engine should plan again, for a
 * wait or a pause that ends while the tile is still wanted. Its state changes are made here, so calling it
 * again with the same wanted tiles starts nothing new.
 */
export function planLoads(loads: TileLoads, wanted: readonly TileKey[], now: number): LoadPlan {
  const { tiles } = loads
  const inView = new Set(wanted)
  for (const [key, state] of tiles) {
    if (inView.has(key)) continue
    if (state.status === 'loading') {
      state.controller.abort(new DOMException(`tile ${key} left the view`, 'AbortError'))
      tiles.set(key, { status: 'idle', tries: state.tries })
    } else if (state.status === 'failed' && state.retryAt === Number.POSITIVE_INFINITY) {
      tiles.set(key, { ...state, retryAt: now + REST_MS })
    }
  }

  const paused = loads.pausedUntil > now
  const start: { key: TileKey; controller: AbortController }[] = []
  let nextWakeAt: number | undefined
  const wakeAt = (at: number) => {
    nextWakeAt = nextWakeAt === undefined ? at : Math.min(nextWakeAt, at)
  }
  for (const key of wanted) {
    const state = stateOf(loads, key)
    if (state.status === 'loading' || state.status === 'loaded') continue
    if (state.status === 'failed' && state.retryAt > now) {
      if (Number.isFinite(state.retryAt)) wakeAt(state.retryAt)
      continue
    }
    if (paused) {
      wakeAt(loads.pausedUntil)
      continue
    }
    const controller = new AbortController()
    tiles.set(key, { status: 'loading', tries: state.tries, controller, startedAt: now })
    start.push({ key, controller })
  }
  return { start, nextWakeAt }
}

/** Holds the requests until `until` (epoch ms), as the gate of the service does. A later end replaces an earlier one. */
export function notePause(loads: TileLoads, until: number): void {
  loads.pausedUntil = Math.max(loads.pausedUntil, until)
}

/**
 * Records how a request ended. Returns true when the request was the tile's current one, so the answer
 * may be used (a loaded tile) or counts (a failure). A request that was aborted, or that the tile no longer
 * waits for, returns false and changes nothing. A rate-limit answer always notes the pause.
 */
export function settleLoad(
  loads: TileLoads,
  key: TileKey,
  controller: AbortController,
  outcome: TileOutcome,
  now: number,
): boolean {
  if (outcome.kind === 'rateLimited') notePause(loads, outcome.until)
  const state = loads.tiles.get(key)
  if (state?.status !== 'loading' || state.controller !== controller) return false
  const { tries } = state
  switch (outcome.kind) {
    case 'loaded':
      loads.tiles.set(key, { status: 'loaded' })
      return true
    case 'aborted':
    case 'rateLimited':
      loads.tiles.set(key, { status: 'idle', tries })
      return true
    case 'failed':
      loads.tiles.set(key, {
        status: 'failed',
        tries: tries + 1,
        reason: 'error',
        retryAt: now + waitAfterFailure(tries + 1),
      })
      return true
    case 'refused':
      loads.tiles.set(key, {
        status: 'failed',
        tries: tries + 1,
        reason: 'refused',
        retryAt: Number.POSITIVE_INFINITY,
      })
      return true
  }
}

/** Sorts the way a request ended into an outcome. An abort wins over whatever error the abort caused. */
export function outcomeOf(error: unknown, signal: AbortSignal): TileOutcome {
  if (signal.aborted) return { kind: 'aborted' }
  if (error instanceof RateLimitedError) return { kind: 'rateLimited', until: error.until }
  if (error instanceof AutomationBlockedError) return { kind: 'refused' }
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
    return { kind: 'refused' }
  }
  return { kind: 'failed' }
}

/** Aborts every request in flight and forgets every tile. The rate-limit pause is kept: the service is still paused. */
export function resetLoads(loads: TileLoads): void {
  for (const [key, state] of loads.tiles) {
    if (state.status === 'loading') {
      state.controller.abort(new DOMException(`tile ${key} was reset`, 'AbortError'))
    }
  }
  loads.tiles.clear()
}
