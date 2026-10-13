import { describe, expect, test } from 'bun:test'
import {
  AutomationBlockedError,
  createEditor,
  type RemoteFetch,
  HttpError,
  RateLimitedError,
  RemoteTimeoutError,
} from '@osm-editor-kit/maid-core'
import { MaidEngine } from './engine'
import {
  createTileLoads,
  nearestFirst,
  notePause,
  outcomeOf,
  planLoads,
  REST_MS,
  resetLoads,
  settleLoad,
  stateOf,
  TILE_TIMEOUT_MS,
  tileKey,
  tileXY,
  type TileLoads,
  waitAfterFailure,
} from './tile-loading'

const T = 1_700_000_000_000
const SOME_URL = 'http://localhost:8090/api/0.6/map.json?bbox=0,0,1,1'
const KEY = '10/20'

/** Asks for the tile `key` now, as a view that wants `wanted` would. The controller, or undefined when it is not asked. */
function ask(loads: TileLoads, key: string, now: number, wanted: readonly string[] = [key]) {
  return planLoads(loads, wanted, now).start.find((s) => s.key === key)?.controller
}

/** Asks for the tile and fails it, as the engine does when the request fails. Returns the controller. */
function askAndFail(loads: TileLoads, now: number) {
  const controller = ask(loads, KEY, now)
  if (!controller) throw new Error('the tile was not asked')
  settleLoad(loads, KEY, controller, { kind: 'failed' }, now)
  return controller
}

/** The message a promise rejects with, or 'resolved' when it does not reject. */
async function rejectionOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
}

describe('waitAfterFailure', () => {
  test('1 s after the first failure, 2 s after the second, 30 s from the third on', () => {
    expect([1, 2, 3, 4, 9].map(waitAfterFailure)).toEqual([1_000, 2_000, 30_000, 30_000, 30_000])
  })
})

describe('failed tiles', () => {
  test('a failed tile is not asked again by ten moves within a second', () => {
    const loads = createTileLoads()
    askAndFail(loads, T)
    for (let i = 1; i <= 10; i++) expect(ask(loads, KEY, T + i * 90)).toBeUndefined()
    expect(ask(loads, KEY, T + 1_000)).toBeDefined()
  })

  test('it is asked again after its wait, and the second wait is two seconds', () => {
    const loads = createTileLoads()
    askAndFail(loads, T)
    const second = ask(loads, KEY, T + 1_000)
    if (!second) throw new Error('the tile was not asked again after 1 s')
    settleLoad(loads, KEY, second, { kind: 'failed' }, T + 1_000)
    expect(ask(loads, KEY, T + 2_999)).toBeUndefined()
    expect(ask(loads, KEY, T + 3_000)).toBeDefined()
  })

  test('after two retries it rests 30 s, and a failure then waits 30 s again', () => {
    const loads = createTileLoads()
    askAndFail(loads, T) // try 1, wait 1 s
    const second = ask(loads, KEY, T + 1_000)
    if (!second) throw new Error('no second try')
    settleLoad(loads, KEY, second, { kind: 'failed' }, T + 1_000) // try 2, wait 2 s
    const third = ask(loads, KEY, T + 3_000)
    if (!third) throw new Error('no third try')
    settleLoad(loads, KEY, third, { kind: 'failed' }, T + 3_000) // try 3: rest
    expect(ask(loads, KEY, T + 3_000 + REST_MS - 1)).toBeUndefined()
    const fourth = ask(loads, KEY, T + 3_000 + REST_MS)
    expect(fourth).toBeDefined()
    if (!fourth) throw new Error('no fourth try')
    settleLoad(loads, KEY, fourth, { kind: 'failed' }, T + 3_000 + REST_MS)
    expect(ask(loads, KEY, T + 3_000 + REST_MS + REST_MS - 1)).toBeUndefined()
    expect(ask(loads, KEY, T + 3_000 + REST_MS + REST_MS)).toBeDefined()
  })

  test('the next wake-up of a waiting wanted tile is the end of its wait', () => {
    const loads = createTileLoads()
    askAndFail(loads, T)
    expect(planLoads(loads, [KEY], T + 500).nextWakeAt).toBe(T + 1_000)
    expect(planLoads(loads, [KEY], T + 500).start).toEqual([])
  })

  test('a timeout counts as a failure', () => {
    const loads = createTileLoads()
    const controller = ask(loads, KEY, T)
    if (!controller) throw new Error('not asked')
    const outcome = outcomeOf(new RemoteTimeoutError(SOME_URL, TILE_TIMEOUT_MS), controller.signal)
    expect(outcome).toEqual({ kind: 'failed' })
    settleLoad(loads, KEY, controller, outcome, T)
    expect(stateOf(loads, KEY)).toEqual({
      status: 'failed',
      tries: 1,
      reason: 'error',
      retryAt: T + 1_000,
    })
  })
})

describe('refused tiles (4xx, no retry)', () => {
  test('a 404 is not asked again while the tile stays in view', () => {
    const loads = createTileLoads()
    const controller = ask(loads, KEY, T)
    if (!controller) throw new Error('not asked')
    settleLoad(
      loads,
      KEY,
      controller,
      outcomeOf(new HttpError(404, SOME_URL), controller.signal),
      T,
    )
    for (const later of [T + 1_000, T + 31_000, T + 3_600_000]) {
      expect(ask(loads, KEY, later)).toBeUndefined()
    }
    expect(planLoads(loads, [KEY], T + 1_000).nextWakeAt).toBeUndefined()
  })

  test('once it has left the view, it is asked again when wanted 30 s after it left', () => {
    const loads = createTileLoads()
    const controller = ask(loads, KEY, T)
    if (!controller) throw new Error('not asked')
    settleLoad(loads, KEY, controller, { kind: 'refused' }, T)
    planLoads(loads, [], T + 5_000) // leaves the view: the 30 s start now
    expect(ask(loads, KEY, T + 5_000 + REST_MS - 1)).toBeUndefined()
    expect(ask(loads, KEY, T + 5_000 + REST_MS)).toBeDefined()
  })

  test('an automation refusal is refused too', () => {
    const outcome = outcomeOf(new AutomationBlockedError(SOME_URL), new AbortController().signal)
    expect(outcome).toEqual({ kind: 'refused' })
  })
})

describe('leaving the view', () => {
  test('a loading tile that leaves the view is aborted, counts no failure, and is asked fresh when wanted again', () => {
    const loads = createTileLoads()
    const first = ask(loads, KEY, T)
    if (!first) throw new Error('not asked')
    planLoads(loads, [], T + 100)
    expect(first.signal.aborted).toBe(true)
    expect(stateOf(loads, KEY)).toEqual({ status: 'idle', tries: 0 })
    // the late answer of the aborted request changes nothing
    expect(settleLoad(loads, KEY, first, { kind: 'failed' }, T + 200)).toBe(false)
    expect(stateOf(loads, KEY)).toEqual({ status: 'idle', tries: 0 })
    const again = ask(loads, KEY, T + 300)
    expect(again).toBeDefined()
    expect(again).not.toBe(first)
  })

  test('an aborted request keeps the tries it had, and an answer of an old request does not touch a newer one', () => {
    const loads = createTileLoads()
    askAndFail(loads, T) // tries 1
    const second = ask(loads, KEY, T + 1_000)
    if (!second) throw new Error('not asked')
    planLoads(loads, [], T + 1_100) // aborted: tries 1 stays
    expect(stateOf(loads, KEY)).toEqual({ status: 'idle', tries: 1 })
    const third = ask(loads, KEY, T + 1_200)
    if (!third) throw new Error('not asked')
    expect(settleLoad(loads, KEY, second, { kind: 'loaded' }, T + 1_300)).toBe(false)
    expect(stateOf(loads, KEY)).toEqual({
      status: 'loading',
      tries: 1,
      controller: third,
      startedAt: T + 1_200,
    })
  })

  test('a loaded tile that leaves and returns is not asked again', () => {
    const loads = createTileLoads()
    const controller = ask(loads, KEY, T)
    if (!controller) throw new Error('not asked')
    expect(settleLoad(loads, KEY, controller, { kind: 'loaded' }, T + 50)).toBe(true)
    planLoads(loads, [], T + 100)
    expect(ask(loads, KEY, T + 200)).toBeUndefined()
    expect(stateOf(loads, KEY)).toEqual({ status: 'loaded' })
  })
})

describe('rate limit', () => {
  test('a rate limit stops every request until the pause ends, then resumes without a move', () => {
    const loads = createTileLoads()
    const wanted = ['1/1', '2/2']
    const asked = planLoads(loads, wanted, T).start
    expect(asked.map((s) => s.key)).toEqual(wanted)
    const until = T + 10_000
    for (const { key, controller } of asked) {
      settleLoad(loads, key, controller, { kind: 'rateLimited', until }, T + 10)
    }
    expect(stateOf(loads, '1/1')).toEqual({ status: 'idle', tries: 0 })

    const later = ['1/1', '2/2', '3/3']
    const during = planLoads(loads, later, T + 1_000)
    expect(during.start).toEqual([])
    expect(during.nextWakeAt).toBe(until)
    expect(planLoads(loads, later, until - 1).start).toEqual([])
    const resumed = planLoads(loads, later, until)
    expect(resumed.start.map((s) => s.key)).toEqual(later)
  })

  test('a rate limit is not a failure: the tile keeps its tries', () => {
    const loads = createTileLoads()
    askAndFail(loads, T)
    const controller = ask(loads, KEY, T + 1_000)
    if (!controller) throw new Error('not asked')
    const outcome = outcomeOf(new RateLimitedError('osm', 429, T + 20_000), controller.signal)
    settleLoad(loads, KEY, controller, outcome, T + 1_000)
    expect(stateOf(loads, KEY)).toEqual({ status: 'idle', tries: 1 })
    expect(loads.pausedUntil).toBe(T + 20_000)
  })

  test('a pause noted by someone else holds the requests too, and a shorter one changes nothing', () => {
    const loads = createTileLoads()
    notePause(loads, T + 5_000)
    notePause(loads, T + 1_000)
    expect(ask(loads, KEY, T + 4_999)).toBeUndefined()
    expect(ask(loads, KEY, T + 5_000)).toBeDefined()
  })
})

describe('success, reset and what is asked per call', () => {
  test('a tile that failed and then loaded is loaded, and stays so', () => {
    const loads = createTileLoads()
    const controller = ask(loads, KEY, T)
    if (!controller) throw new Error('not asked')
    expect(settleLoad(loads, KEY, controller, { kind: 'loaded' }, T)).toBe(true)
    expect(ask(loads, KEY, T + 1_000_000)).toBeUndefined()
  })

  test('reset aborts every request in flight and forgets every tile, and keeps the pause', () => {
    const loads = createTileLoads()
    const asked = planLoads(loads, ['a/1', 'b/2'], T).start
    askAndFail(loads, T) // a failed tile, its own key
    notePause(loads, T + 30_000)
    resetLoads(loads)
    for (const { controller } of asked) expect(controller.signal.aborted).toBe(true)
    expect(loads.tiles.size).toBe(0)
    expect(loads.pausedUntil).toBe(T + 30_000)
    const [first] = asked
    if (!first) throw new Error('nothing was asked')
    expect(settleLoad(loads, first.key, first.controller, { kind: 'loaded' }, T + 1)).toBe(false)
  })

  test('every idle wanted tile is asked in one call, in the order given, with no cap', () => {
    const loads = createTileLoads()
    const wanted = Array.from({ length: 40 }, (_, i) => tileKey(i, 0))
    expect(planLoads(loads, wanted, T).start.map((s) => s.key)).toEqual(wanted)
    expect(planLoads(loads, wanted, T + 1).start).toEqual([])
  })

  test('nearest first: the tiles are ordered by their distance from the centre', () => {
    const tiles: [number, number][] = [
      [0, 0],
      [5, 5],
      [2, 2],
    ]
    expect(nearestFirst(tiles, [2, 2])).toEqual([
      [2, 2],
      [0, 0],
      [5, 5],
    ])
    expect(tiles[0]).toEqual([0, 0])
  })

  test('tile keys round-trip', () => {
    expect(tileXY(tileKey(34_567, 21_098))).toEqual([34_567, 21_098])
  })
})

describe('outcomeOf', () => {
  const open = new AbortController().signal

  test('sorts the ways a request can end', () => {
    expect(outcomeOf(new HttpError(404, SOME_URL), open)).toEqual({ kind: 'refused' })
    expect(outcomeOf(new HttpError(500, SOME_URL), open)).toEqual({ kind: 'failed' })
    expect(outcomeOf(new Error('network down'), open)).toEqual({ kind: 'failed' })
    expect(outcomeOf(new RateLimitedError('osm', 509, 42), open)).toEqual({
      kind: 'rateLimited',
      until: 42,
    })
  })

  test('an abort wins over the error it caused', () => {
    const controller = new AbortController()
    controller.abort(new Error('left the view'))
    expect(outcomeOf(new Error('The operation was aborted'), controller.signal)).toEqual({
      kind: 'aborted',
    })
  })
})

describe('the engine on its own: relation loads through the fetch option', () => {
  const relationAnswer = () =>
    new Response(JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] }))

  function engineWith(fetch: RemoteFetch) {
    const editor = createEditor()
    return new MaidEngine({
      editor,
      apiUrl: 'http://localhost:8090/s/small',
      minDataZoom: 16,
      fetch,
    })
  }

  test('a relation is loaded through the fetch option, with a signal, and its new entities are counted', async () => {
    const calls: { url: string; signal: AbortSignal | undefined }[] = []
    const engine = engineWith(async (url, init) => {
      calls.push({ url: String(url), signal: init?.signal })
      return relationAnswer()
    })
    expect(await engine.loadRelation('r5')).toEqual({ added: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('http://localhost:8090/s/small/api/0.6/relation/5/full.json')
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  test('a rate limit on a relation load rejects with the answer, as today', async () => {
    const engine = engineWith(async () => {
      throw new RateLimitedError('osm', 429, Date.now() + 60_000)
    })
    expect(await rejectionOf(engine.loadRelation('r5'))).toContain('OSM API answered 429')
  })

  test('a 404 on a relation load rejects with the answer, as today', async () => {
    const engine = engineWith(async () => {
      throw new HttpError(404, 'http://localhost:8090/api/0.6/relation/5/full.json')
    })
    expect(await rejectionOf(engine.loadRelation('r5'))).toContain('OSM API answered 404')
  })

  const hanging: RemoteFetch = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })

  test('a relation load is cancelled when its relation is no longer selected', async () => {
    const engine = engineWith(hanging)
    const load = engine.loadRelation('r5')
    engine.setSelected('r9')
    expect(await rejectionOf(load)).toContain('no answer from the OSM API')
  })

  test('a relation load that is still selected is not cancelled', async () => {
    let answer: (response: Response) => void = () => undefined
    const engine = engineWith(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        }),
    )
    engine.setSelected('r5')
    const load = engine.loadRelation('r5')
    engine.setSelected(['r5', 'n1'])
    answer(relationAnswer())
    expect(await load).toEqual({ added: 1 })
  })

  test('destroy cancels the relation loads', async () => {
    const engine = engineWith(hanging)
    const load = engine.loadRelation('r5')
    engine.destroy()
    expect(await rejectionOf(load)).toContain('no answer from the OSM API')
  })
})
