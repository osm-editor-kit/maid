import { describe, expect, it } from 'bun:test'
import { HttpError, type RemoteFetch } from '@osm-editor-kit/maid-core'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import type { EngineMetrics } from './engine'
import { TileLoader, type TileHost } from './tile-loader'

const API = 'http://mock.test/s/scene'

/** The elements a fake server answers, by path under `/api/0.6/`; a path that is not listed is a 404 */
type Routes = Record<string, OsmJsonElement[] | 'network-error'>

function fakeServer(routes: Routes) {
  const asked: string[] = []
  const remote: RemoteFetch = async (url) => {
    const href = String(url)
    const path = href.slice(`${API}/api/0.6/`.length)
    asked.push(path)
    const answer = routes[path]
    if (answer === 'network-error') throw new TypeError('fetch failed')
    if (answer === undefined) throw new HttpError(404, href)
    return new Response(JSON.stringify({ version: '0.6', elements: answer }))
  }
  return { asked, remote }
}

function hostOf(merged: OsmJsonElement[][]): TileHost {
  const metrics = {
    tiles: 0,
    relations: 0,
    updates: 0,
    compactions: 0,
    bytes: 0,
    fetchMs: 0,
    parseMs: 0,
    mergeMs: 0,
    buildMs: 0,
    pushMs: 0,
    fillInMs: 0,
    features: {},
  } as unknown as EngineMetrics
  return {
    apiUrl: API,
    minDataZoom: 16,
    metrics,
    map: () => undefined,
    merge: (elements) => {
      merged.push(elements)
      return elements.length
    },
    flushAll: () => {},
    wake: () => {},
    touch: () => {},
  }
}

const way5 = { type: 'way', id: 5, nodes: [1, 2] } as OsmJsonElement
const node1 = { type: 'node', id: 1, lat: 0, lon: 0 } as OsmJsonElement
const node2 = { type: 'node', id: 2, lat: 0, lon: 0 } as OsmJsonElement
const parent9 = { type: 'relation', id: 9, members: [] } as OsmJsonElement

/** Silences the console for a test that expects an error to be reported there */
async function quietly<T>(run: () => Promise<T>) {
  const original = console.error
  console.error = () => {}
  try {
    return await run()
  } finally {
    console.error = original
  }
}

describe('loading an entity with its parent relations (iD loadEntity)', () => {
  it('asks for the way in full and for its parents, and counts only the way', async () => {
    const merged: OsmJsonElement[][] = []
    const server = fakeServer({
      'way/5/full.json': [way5, node1, node2],
      'way/5/relations.json': [parent9],
    })
    const loader = new TileLoader(hostOf(merged), server.remote)

    const result = await loader.loadEntity('w5')

    expect(result.added).toBe(3)
    expect(server.asked.sort()).toEqual(['way/5/full.json', 'way/5/relations.json'])
    expect(merged.flat().map((e) => `${e.type}${e.id}`)).toEqual(
      expect.arrayContaining(['way5', 'node1', 'node2', 'relation9']),
    )
  })

  it('asks for the parents of a node too', async () => {
    const server = fakeServer({ 'node/1.json': [node1], 'node/1/relations.json': [parent9] })
    const loader = new TileLoader(hostOf([]), server.remote)
    await loader.loadEntity('n1')
    expect(server.asked.sort()).toEqual(['node/1.json', 'node/1/relations.json'])
  })

  it('does not ask for a new feature', async () => {
    const loader = new TileLoader(hostOf([]), fakeServer({}).remote)
    const failure = await loader.loadEntity('n-1').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('Not an OSM element')
  })

  it('stops asking for the parents once the server answers 404, and the download still works', async () => {
    const server = fakeServer({
      'way/5/full.json': [way5, node1, node2],
      'way/6/full.json': [{ type: 'way', id: 6, nodes: [] } as OsmJsonElement],
    })
    const loader = new TileLoader(hostOf([]), server.remote)

    expect((await loader.loadEntity('w5')).added).toBe(3)
    expect((await loader.loadEntity('w6')).added).toBe(1)

    // the first download asked for the parents once, the second did not ask again
    expect(server.asked.filter((p) => p.endsWith('/relations.json'))).toEqual([
      'way/5/relations.json',
    ])
  })

  it('keeps asking after a failure that is not a 404', async () => {
    const server = fakeServer({
      'way/5/full.json': [way5, node1, node2],
      'way/6/full.json': [{ type: 'way', id: 6, nodes: [] } as OsmJsonElement],
      'way/5/relations.json': 'network-error',
      'way/6/relations.json': [parent9],
    })
    const loader = new TileLoader(hostOf([]), server.remote)

    await quietly(async () => {
      expect((await loader.loadEntity('w5')).added).toBe(3)
    })
    expect((await loader.loadEntity('w6')).added).toBe(1)
    expect(server.asked).toContain('way/6/relations.json')
  })

  it('does not fail the download when the parents cannot be had', async () => {
    const server = fakeServer({
      'way/5/full.json': [way5, node1, node2],
      'way/5/relations.json': 'network-error',
    })
    const loader = new TileLoader(hostOf([]), server.remote)
    await quietly(async () => {
      expect((await loader.loadEntity('w5')).added).toBe(3)
    })
  })

  it('fails the download when the entity itself cannot be had', async () => {
    const server = fakeServer({ 'way/5/relations.json': [parent9] })
    const loader = new TileLoader(hostOf([]), server.remote)
    const failure = await loader.loadEntity('w5').catch((error: unknown) => error)
    expect((failure as Error).message).toBe('OSM API answered 404')
  })
})

describe('loading a relation in full with its parent relations', () => {
  it('asks for the relation and its parents, and counts only the relation', async () => {
    const relation4 = { type: 'relation', id: 4, members: [] } as OsmJsonElement
    const server = fakeServer({
      'relation/4/full.json': [relation4, way5],
      'relation/4/relations.json': [parent9],
    })
    const loader = new TileLoader(hostOf([]), server.remote)

    const { added } = await loader.loadRelation('r4')

    expect(added).toBe(2)
    expect(server.asked.sort()).toEqual(['relation/4/full.json', 'relation/4/relations.json'])
  })

  it('keeps one request in flight per relation', async () => {
    const relation4 = { type: 'relation', id: 4, members: [] } as OsmJsonElement
    const server = fakeServer({
      'relation/4/full.json': [relation4],
      'relation/4/relations.json': [],
    })
    const loader = new TileLoader(hostOf([]), server.remote)
    const first = loader.loadRelation('r4')
    const second = loader.loadRelation('r4')
    await Promise.all([first, second])
    expect(server.asked.filter((p) => p === 'relation/4/full.json')).toHaveLength(1)
  })
})
