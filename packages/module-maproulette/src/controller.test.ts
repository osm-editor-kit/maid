import { describe, expect, it } from 'bun:test'
import type { ModuleStorage } from '@osm-editor-kit/maid-core'
import type { FetchInit, FetchLike } from '@osm-editor-kit/maid-maproulette'
import { createController } from './controller.ts'
import { createMapRouletteStore } from './store.ts'

const API = 'https://mr.test/api/v2'

/** A task of the box answer: a footway with its line, in challenge 7 */
const boxTask = (id: number, status = 0) => ({
  id,
  parentId: 7,
  title: `way/${id}`,
  status,
  point: { lng: 13.4, lat: 52.39 },
  geometries: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { '@id': `way/${id}` },
        geometry: {
          type: 'LineString',
          coordinates: [
            [13.4, 52.39],
            [13.401, 52.39],
          ],
        },
      },
    ],
  },
})

/** A fake MapRoulette: records the requests; a status PUT needs an Authorization header; task 13 is always refused */
function fakeServer() {
  const requests: { method: string; url: string; init?: FetchInit }[] = []
  const answer = (status: number, body: unknown = {}) => ({
    ok: status < 300,
    status,
    json: async () => body,
  })
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET'
    requests.push({ method, url, ...(init ? { init } : {}) })
    const path = url.replace(API, '').split('?')[0] ?? ''
    if (path.startsWith('/tasks/box/')) return answer(200, [boxTask(1), boxTask(2), boxTask(3, 1)])
    if (path === '/challenge/7')
      return answer(200, { id: 7, name: 'Footways', checkinComment: 'Footways #maproulette' })
    if (/^\/task\/\d+$/.test(path) && method === 'GET')
      return answer(200, boxTask(Number(path.slice(6))))
    if (!init?.headers?.Authorization) return answer(401, { status: 'NotAuthorized' })
    if (path.startsWith('/task/13')) return answer(500, { message: 'no' })
    return answer(200, {})
  }
  return { fetch, requests }
}

function memoryStorage(): ModuleStorage & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

function setUp() {
  const server = fakeServer()
  const store = createMapRouletteStore()
  const storage = memoryStorage()
  const controller = createController({ store, apiUrl: API, storage, fetch: server.fetch })
  return { store, controller, server, storage }
}

const VIEW = {
  bbox: [13.39, 52.38, 13.41, 52.4] as const,
  zoom: 16,
  center: [13.4, 52.39] as const,
}

describe('the tasks of the view', () => {
  it('reads nothing below zoom 12', async () => {
    const { store, controller, server } = setUp()
    await controller.loadView({ ...VIEW, zoom: 11 })
    expect(server.requests).toHaveLength(0)
    expect(store.getState().zoomedOut).toBe(true)
  })

  it('keeps the tasks with the OSM features they name, and reads their challenge', async () => {
    const { store, controller, server } = setUp()
    await controller.loadView(VIEW)
    const state = store.getState()
    expect(Object.keys(state.tasks)).toEqual(['1', '2', '3'])
    expect(state.byEntity.w2).toEqual(['2'])
    expect(server.requests.map((r) => r.url)).toContain(`${API}/challenge/7`)
    expect(controller.featuresOf('1')).toEqual(['w1'])
  })
})

describe('finishing a task', () => {
  it('with the upload: an earmark, stored for a reload, and Undo takes it out', async () => {
    const { store, controller, server, storage } = setUp()
    await controller.loadView(VIEW)
    const before = server.requests.length
    await controller.finish('1', 1)
    expect(server.requests).toHaveLength(before)
    expect(store.getState().earmarks.map((e) => [e.taskId, e.status, e.localDone])).toEqual([
      ['1', 1, true],
    ])
    expect(storage.items.get('maid-maproulette:earmarks')).toContain('"taskId":"1"')
    controller.undo('1')
    expect(store.getState().earmarks).toEqual([])
  })

  it('right away: refused without a token, sent with one (comment, status, release)', async () => {
    const { store, controller, server } = setUp()
    await controller.loadView(VIEW)
    controller.setTiming('right_away')
    await controller.finish('2', 2, { comment: 'not a footway' })
    expect(store.getState().sending['2']).toEqual({
      failed: 'MapRoulette did not accept the login.',
      unauthorized: true,
    })
    controller.setToken('mrt_abc')
    const before = server.requests.length
    await controller.finish('2', 2, { comment: 'not a footway' })
    const sent = server.requests.slice(before)
    expect(sent.map((r) => `${r.method} ${r.url.replace(API, '').split('?')[0]}`)).toEqual([
      'POST /task/2/comment',
      'PUT /task/2/2',
      'GET /task/2/release',
    ])
    expect(sent[0]?.init?.headers?.Authorization).toBe('Bearer mrt_abc')
    expect(store.getState().finished['2']).toBe(2)
    expect(store.getState().sending['2']).toBeUndefined()
  })
})

describe('after the upload', () => {
  it('sends the included earmarks with a link to the changeset, keeps the refused and the left-out ones', async () => {
    const { store, controller, server } = setUp()
    await controller.loadView(VIEW)
    controller.setToken('mrt_abc')
    await controller.finish('1', 1)
    await controller.finish('13', 1)
    await controller.finish('2', 5)
    controller.include('2', false)
    const before = server.requests.length
    await controller.afterUpload({
      changesetId: 99,
      changesetUrl: 'https://osm.test/changeset/99',
      comment: 'Footways #maproulette',
      user: 'Mapper',
    })
    const comment = server.requests
      .slice(before)
      .find((r) => r.url.startsWith(`${API}/task/1/comment`))?.init?.body
    expect(comment).toContain('https://osm.test/changeset/99')
    expect(comment).toContain('Mapper')
    const state = store.getState()
    expect(state.finished['1']).toBe(1)
    expect(state.earmarks.map((e) => e.taskId).toSorted()).toEqual(['13', '2'])
    expect(state.resolve).toEqual({
      state: 'done',
      ok: 1,
      failed: 1,
      changesetUrl: 'https://osm.test/changeset/99',
    })
  })
})
