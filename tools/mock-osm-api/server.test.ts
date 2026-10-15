import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { createHandler, loadScenes, SceneIndex } from './server'

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

  test('the relations an element is a member of', async () => {
    // a way that some relation of the scene holds, found from the map's answer
    const map = await (
      await get('/s/small/api/0.6/map.json?bbox=13.393,52.385,13.407,52.393')
    ).json()
    type Element = { type: string; id: number; members?: { type: string; ref: number }[] }
    const holder = (map.elements as Element[]).find((e) => e.members?.some((m) => m.type === 'way'))
    const wayId = holder?.members?.find((m) => m.type === 'way')?.ref
    expect(wayId).toBeDefined()
    const res = await get(`/s/small/api/0.6/way/${wayId}/relations.json`)
    expect(res.status).toBe(200)
    const elements = (await res.json()).elements as Element[]
    expect(elements.some((e) => e.id === holder?.id)).toBe(true)
    expect(
      elements.every((e) => e.type === 'relation' && e.members?.some((m) => m.ref === wayId)),
    ).toBe(true)
    // an element no relation holds gets an empty list
    expect((await (await get('/s/small/api/0.6/node/1/relations.json')).json()).elements).toEqual(
      [],
    )
  })

  describe('notes', () => {
    const SMALL = '13.393,52.385,13.407,52.393'
    const notesOf = async (query: string) => {
      const res = await get(`/s/small/api/0.6/notes.json?${query}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      return (await res.json()).features as any[]
    }

    test('open and closed notes of the box, with comments', async () => {
      const features = await notesOf(`bbox=${SMALL}&closed=-1&limit=100`)
      expect(features.length).toBeGreaterThanOrEqual(6)
      expect(features.some((f) => f.properties.status === 'closed')).toBe(true)
      for (const f of features) {
        expect(f.type).toBe('Feature')
        expect(f.geometry.type).toBe('Point')
        expect(f.properties.comments.length).toBeGreaterThan(0)
      }
    })

    test('one note by its id, and 404 for an id the fixture does not have', async () => {
      const [first] = await notesOf(`bbox=${SMALL}&closed=-1`)
      const res = await get(`/s/small/api/0.6/notes/${first.properties.id}.json`)
      expect(res.status).toBe(200)
      expect((await res.json()).properties.id).toBe(first.properties.id)
      expect((await get('/s/small/api/0.6/notes/999999999.json')).status).toBe(404)
    })

    test('closed=0 gives open notes only', async () => {
      const all = await notesOf(`bbox=${SMALL}&closed=-1`)
      const open = await notesOf(`bbox=${SMALL}&closed=0`)
      expect(open.length).toBeGreaterThan(0)
      expect(open.length).toBeLessThan(all.length)
      expect(open.every((f) => f.properties.status === 'open')).toBe(true)
    })

    test('only notes inside the box, and the limit caps the list', async () => {
      const box = await notesOf('bbox=13.3990,52.3880,13.4010,52.3900&closed=-1')
      expect(box.length).toBeGreaterThan(0)
      for (const f of box) {
        const [lon, lat] = f.geometry.coordinates
        expect(lon).toBeGreaterThanOrEqual(13.399)
        expect(lon).toBeLessThanOrEqual(13.401)
        expect(lat).toBeGreaterThanOrEqual(52.388)
        expect(lat).toBeLessThanOrEqual(52.39)
      }
      expect((await notesOf(`bbox=${SMALL}&closed=-1&limit=2`)).length).toBe(2)
    })

    test('a bad bbox is a 400, writes are refused', async () => {
      expect((await get('/s/small/api/0.6/notes.json?bbox=1,2,3')).status).toBe(400)
      expect(
        (await get(`/s/small/api/0.6/notes.json?bbox=${SMALL}`, { method: 'POST' })).status,
      ).toBe(405)
    })

    test('an unknown scene answers an empty collection', async () => {
      const res = await get('/s/nope/api/0.6/notes.json?bbox=13.39,52.38,13.41,52.40')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ type: 'FeatureCollection', features: [] })
    })

    test('the fixtures have 6 to 10 notes each, inside their scene, in the shape the API uses', async () => {
      const { SCENES } = await import('../fixtures/scenes')
      const seen = new Set<number>()
      for (const name of ['small', 'dense']) {
        const scene = SCENES.find((s) => s.name === name)!
        const file = (await Bun.file(
          join(import.meta.dir, `../../fixtures/notes/${name}.json`),
        ).json()) as {
          type: string
          features: any[]
        }
        expect(file.type).toBe('FeatureCollection')
        expect(file.features.length).toBeGreaterThanOrEqual(6)
        expect(file.features.length).toBeLessThanOrEqual(10)
        for (const f of file.features) {
          const [lon, lat] = f.geometry.coordinates
          const [w, s, e, n] = scene.bbox
          expect(lon).toBeGreaterThanOrEqual(w)
          expect(lon).toBeLessThanOrEqual(e)
          expect(lat).toBeGreaterThanOrEqual(s)
          expect(lat).toBeLessThanOrEqual(n)
          expect(f.properties.id).toBeGreaterThanOrEqual(9000001)
          expect(seen.has(f.properties.id)).toBe(false)
          seen.add(f.properties.id)
          expect(['open', 'closed']).toContain(f.properties.status)
          expect(f.properties.status === 'closed').toBe(typeof f.properties.closed_at === 'string')
          expect(f.properties.comments.length).toBeGreaterThanOrEqual(1)
          expect(f.properties.comments.length).toBeLessThanOrEqual(3)
          for (const c of f.properties.comments) expect(typeof c.text).toBe('string')
        }
      }
    })
  })
})

describe('full (relation and way with their members)', () => {
  // A hand-made fixture: n4 is a member that is not in the fixture (not loaded from the API either).
  const tiny = new SceneIndex([
    { type: 'node', id: 1, lat: 52.5, lon: 13.4 },
    { type: 'node', id: 2, lat: 52.5, lon: 13.41 },
    { type: 'node', id: 3, lat: 52.5, lon: 13.42 },
    { type: 'node', id: 5, lat: 52.5, lon: 13.43 },
    { type: 'way', id: 10, nodes: [1, 2] },
    { type: 'way', id: 11, nodes: [2, 3] },
    { type: 'way', id: 12, nodes: [3, 1] },
    // r22 is a member of r21 only: it must not come with r20
    { type: 'relation', id: 22, members: [{ type: 'way', ref: 10 }] },
    {
      type: 'relation',
      id: 21,
      members: [
        { type: 'way', ref: 12 },
        { type: 'node', ref: 3 },
        { type: 'relation', ref: 22 },
      ],
    },
    {
      type: 'relation',
      id: 20,
      members: [
        { type: 'node', ref: 1 },
        { type: 'way', ref: 10 },
        { type: 'way', ref: 11 },
        { type: 'node', ref: 4 },
        { type: 'relation', ref: 21 },
      ],
    },
  ])
  const tinyHandler = createHandler(new Map([['tiny', tiny]]), { latency: 0 })
  const full = async (path: string) => {
    const res = await tinyHandler(new Request(`http://localhost/s/tiny${path}`))
    return res
  }
  const keys = (elements: any[]) => elements.map((e) => `${e.type[0]}${e.id}`)

  test('a relation: its nodes, ways with their nodes, member relations one level, each once', async () => {
    const res = await full('/api/0.6/relation/20/full.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const { elements } = await res.json()
    // n1 (member), n2 (node of w10), w10, n3 (node of w11), w11, r21 (member relation), r20 last
    expect(keys(elements)).toEqual(['n1', 'n2', 'w10', 'n3', 'w11', 'r21', 'r20'])
    expect(new Set(keys(elements)).size).toBe(elements.length)
  })

  test('a member relation comes without its own members', async () => {
    const { elements } = await (await full('/api/0.6/relation/21/full')).json()
    // w12 with its nodes 3 and 1, n3 is a member (once), r22 is a member relation, not expanded
    expect(keys(elements)).toEqual(['n3', 'n1', 'w12', 'r22', 'r21'])
  })

  test('a way: its nodes and the way', async () => {
    const { elements } = await (await full('/api/0.6/way/10/full.json')).json()
    expect(keys(elements)).toEqual(['n1', 'n2', 'w10'])
  })

  test('an unknown relation is 404', async () => {
    expect((await full('/api/0.6/relation/999/full.json')).status).toBe(404)
  })
})
