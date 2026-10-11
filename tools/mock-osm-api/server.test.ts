import { describe, expect, test } from 'bun:test'
import { createHandler, loadScenes } from './server'

const handler = createHandler(await loadScenes(['small']), { latency: 0 })
const get = (path: string, init?: RequestInit) =>
  handler(new Request(`http://localhost${path}`, init))

describe('mock OSM API', () => {
  test('capabilities as JSON and XML', async () => {
    expect((await (await get('/s/small/api/capabilities.json')).json()).api.status.api).toBe(
      'online',
    )
    expect(await (await get('/s/small/api/capabilities')).text()).toContain(
      '<status database="online"',
    )
  })

  test('map returns nodes in the box plus complete ways', async () => {
    const res = await get('/s/small/api/0.6/map.json?bbox=13.399,52.388,13.401,52.39')
    const { elements } = await res.json()
    const nodeIds = new Set(elements.filter((e: any) => e.type === 'node').map((e: any) => e.id))
    const ways = elements.filter((e: any) => e.type === 'way')
    expect(ways.length).toBeGreaterThan(10)
    for (const way of ways) for (const n of way.nodes) expect(nodeIds.has(n)).toBe(true)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  test('writes are rejected', async () => {
    expect((await get('/s/small/api/0.6/changeset/create', { method: 'PUT' })).status).toBe(405)
  })

  test('unknown scene is a 404', async () => {
    expect((await get('/s/nope/api/capabilities.json')).status).toBe(404)
  })
})
