import { describe, expect, test } from 'bun:test'
import {
  createPreviewStore,
  PREVIEW_MAX_AGE_MS,
  type PreviewCache,
  type PreviewEntry,
} from './preview-store.ts'

const ANSWER = JSON.stringify({
  postpass_properties: { timestamp: '2026-11-05T04:00:00Z' },
  result: [{ k: 'R', id: 7, tags: { type: 'route' }, members: [] }],
})

function memoryCache(): PreviewCache & { rows: Map<string, PreviewEntry> } {
  const rows = new Map<string, PreviewEntry>()
  return {
    rows,
    read: async (id) => rows.get(id),
    write: async (id, entry) => {
      rows.set(id, entry)
    },
  }
}

function setup(answer: () => Response = () => new Response(ANSWER)) {
  const asked: URL[] = []
  const cache = memoryCache()
  let time = 1_000_000
  const store = createPreviewStore({
    fetch: async (url) => {
      asked.push(new URL(url))
      return answer()
    },
    url: 'http://localhost:8090/postpass/api/interpreter',
    cache,
    now: () => time,
  })
  return { store, asked, cache, later: (ms: number) => (time += ms) }
}

describe('createPreviewStore', () => {
  test('asks once with the SQL and no GeoJSON shape, then keeps the answer', async () => {
    const { store, asked, cache } = setup()
    expect(store.state('r7').status).toBe('none')
    await store.load('r7')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.searchParams.get('data')).toContain('-- maid:route-preview 7')
    expect(asked[0]?.searchParams.get('options[geojson]')).toBe('false')
    const state = store.state('r7')
    expect(state.status).toBe('ready')
    expect(cache.rows.has('r7')).toBe(true)
    await store.load('r7')
    expect(asked).toHaveLength(1)
  })

  test('"Reload" asks again; a day later a press asks again too', async () => {
    const { store, asked, later } = setup()
    await store.load('r7')
    await store.load('r7', { refresh: true })
    expect(asked).toHaveLength(2)
    later(PREVIEW_MAX_AGE_MS)
    await store.load('r7')
    expect(asked).toHaveLength(3)
  })

  test('restore shows a stored preview without a request', async () => {
    const { store, asked, cache } = setup()
    cache.rows.set('r7', {
      loadedAt: 1,
      preview: {
        root: 'r7',
        timestamp: 't',
        relations: new Map(),
        ways: new Map(),
        nodes: new Map(),
      },
    })
    store.restore('r7')
    await Promise.resolve()
    await Promise.resolve()
    expect(store.state('r7').status).toBe('ready')
    expect(asked).toHaveLength(0)
  })

  test('a failed or wrong answer is an error that keeps the earlier preview', async () => {
    let answer = new Response(ANSWER)
    const { store } = setup(() => answer)
    await store.load('r7')
    answer = new Response('<html>busy</html>')
    await store.load('r7', { refresh: true })
    const state = store.state('r7')
    expect(state).toMatchObject({ status: 'error', reason: 'format' })
    expect('entry' in state && state.entry !== undefined).toBe(true)
  })

  test('without a preview URL nothing is asked', async () => {
    const asked: string[] = []
    const store = createPreviewStore({
      fetch: async (url) => {
        asked.push(String(url))
        return new Response(ANSWER)
      },
      url: undefined,
      cache: memoryCache(),
    })
    expect(store.enabled).toBe(false)
    await store.load('r7')
    expect(asked).toHaveLength(0)
  })
})
