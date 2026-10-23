import { describe, expect, test } from 'bun:test'
import type { OsmJsonElement } from '@osm-editor-kit/maid-model'
import { type LoadDeps, loadServerState } from './load.ts'
import { parseOsmChange } from './parse.ts'
import { planOf } from './plan.ts'

const API = 'http://localhost:8090/s/small'

/** A stand-in for the API: answers by path, 404 for anything else; records what was asked */
function fakeApi(answers: Record<string, OsmJsonElement[]>) {
  const asked: string[] = []
  const fetch = async (url: string) => {
    const path = url.slice(`${API}/api/0.6/`.length)
    asked.push(path)
    const elements = answers[path]
    if (!elements) throw Object.assign(new Error('HTTP 404'), { status: 404 })
    return Response.json({ version: '0.6', elements })
  }
  return { fetch, asked }
}

function deps(answers: Record<string, OsmJsonElement[]>, overrides: Partial<LoadDeps> = {}) {
  const api = fakeApi(answers)
  const merged: OsmJsonElement[] = []
  const value: LoadDeps = {
    apiUrl: API,
    fetch: api.fetch,
    loadedVersion: (key) => {
      const found = merged.find((element) => element.type.charAt(0) + element.id === key)
      return found ? found.version : 'missing'
    },
    edited: () => new Set(),
    merge: (elements) => merged.push(...elements),
    parents: () => [],
    ...overrides,
  }
  return { deps: value, asked: api.asked, merged }
}

function file(xml: string) {
  const result = parseOsmChange(`<osmChange version="0.6">${xml}</osmChange>`)
  if (!result.ok) throw new Error(result.error.id)
  return result.file
}

const bench = (version: number, tags: Record<string, string>): OsmJsonElement => ({
  type: 'node',
  id: 1,
  version,
  lat: 52,
  lon: 13,
  tags,
})

describe('loadServerState', () => {
  test('the current state, and the base from the history when the server is newer', async () => {
    const {
      deps: d,
      asked,
      merged,
    } = deps({
      'node/1.json': [bench(3, { amenity: 'bench', colour: 'red', backrest: 'yes' })],
      'node/1/2.json': [bench(2, { amenity: 'bench', colour: 'red' })],
    })
    const changes = file(
      '<modify><node id="1" version="2" lat="52" lon="13"><tag k="amenity" v="bench"/><tag k="colour" v="green"/></node></modify>',
    )
    const loaded = await loadServerState(changes, d)
    if (!loaded.ok) throw new Error(loaded.error.id)
    expect(asked).toEqual(['node/1.json', 'node/1/2.json'])
    expect(merged.map((element) => element.id)).toEqual([1])
    const plan = planOf(changes, loaded.states, loaded.parents, {})
    expect(plan.items[0]).toMatchObject({
      status: 'auto',
      result: { version: 3, tags: { amenity: 'bench', colour: 'green', backrest: 'yes' } },
    })
  })

  test('a way is read with its nodes; a node it newly uses is loaded too; nothing for a create', async () => {
    const way: OsmJsonElement = {
      type: 'way',
      id: 5,
      version: 1,
      nodes: [1, 2],
      tags: { highway: 'path' },
    }
    const nodes = [1, 2, 3].map((id) => ({
      type: 'node' as const,
      id,
      version: 1,
      lat: 52,
      lon: 13 + id / 1000,
    }))
    const { deps: d, asked } = deps({
      'way/5/full.json': [nodes[0]!, nodes[1]!, way],
      'node/3.json': [nodes[2]!],
    })
    const changes = file(
      '<create><node id="-1" lat="1" lon="1"/></create><modify><way id="5" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="highway" v="path"/></way></modify>',
    )
    const loaded = await loadServerState(changes, d)
    expect(loaded.ok).toBe(true)
    // and the box around the new node, for new elements that are on the server already (match.ts)
    expect(asked).toEqual([
      'way/5/full.json',
      'node/3.json',
      'map.json?bbox=0.999700,0.999700,1.000300,1.000300',
    ])
  })

  test('deleted on the server (404): known as deleted, no base asked for', async () => {
    const { deps: d, asked } = deps({})
    const changes = file('<delete><node id="9" version="1"/></delete>')
    const loaded = await loadServerState(changes, d)
    if (!loaded.ok) throw new Error(loaded.error.id)
    expect(loaded.states.get('n9')).toEqual({ current: 'deleted' })
    expect(asked).toEqual(['node/9.json'])
  })

  test('no base in the history: merged without one', async () => {
    const { deps: d } = deps({ 'node/1.json': [bench(3, { amenity: 'bench' })] })
    const loaded = await loadServerState(
      file('<modify><node id="1" version="2" lat="52" lon="13"/></modify>'),
      d,
    )
    if (!loaded.ok) throw new Error(loaded.error.id)
    expect(loaded.states.get('n1')).toEqual({
      current: { type: 'node', id: 1, version: 3, tags: { amenity: 'bench' }, lat: 52, lon: 13 },
    })
  })

  test('refused: the person changed one of the elements in the editor and did not save', async () => {
    const { deps: d, asked } = deps({}, { edited: () => new Set(['n1']) })
    const loaded = await loadServerState(
      file('<modify><node id="1" version="2" lat="52" lon="13"/></modify>'),
      d,
    )
    expect(loaded).toEqual({
      ok: false,
      error: { id: 'osmchange_error_local_edits', values: { ids: 'n1' } },
    })
    expect(asked).toEqual([])
  })

  test('refused: the map shows an older version than the server', async () => {
    const { deps: d } = deps(
      { 'node/1.json': [bench(3, {})] },
      { loadedVersion: (key) => (key === 'n1' ? 2 : 'missing') },
    )
    const loaded = await loadServerState(
      file('<modify><node id="1" version="2" lat="52" lon="13"/></modify>'),
      d,
    )
    expect(loaded).toEqual({
      ok: false,
      error: { id: 'osmchange_error_stale', values: { ids: 'n1' } },
    })
  })

  test('refused: a way of the file uses a node that is not on the server', async () => {
    const { deps: d } = deps({})
    const loaded = await loadServerState(
      file('<create><way id="-1"><nd ref="7"/><nd ref="8"/></way></create>'),
      d,
    )
    expect(loaded).toEqual({
      ok: false,
      error: { id: 'osmchange_error_missing', values: { ids: 'n7, n8' } },
    })
  })

  test('refused: the API answers with another error', async () => {
    const loaded = await loadServerState(file('<delete><node id="1" version="2"/></delete>'), {
      ...deps({}).deps,
      fetch: async () => {
        throw Object.assign(new Error('HTTP 500'), { status: 500 })
      },
    })
    expect(loaded).toEqual({
      ok: false,
      error: { id: 'osmchange_error_fetch', values: { reason: 'HTTP 500' } },
    })
  })

  test('the parents of a deleted element come from the editor, after the merge', async () => {
    const { deps: d } = deps(
      { 'node/1.json': [bench(2, {})] },
      { parents: (key) => (key === 'n1' ? ['w4'] : []) },
    )
    const changes = file('<delete><node id="1" version="2"/></delete>')
    const loaded = await loadServerState(changes, d)
    if (!loaded.ok) throw new Error(loaded.error.id)
    expect(loaded.parents.get('n1')).toEqual(['w4'])
    expect(planOf(changes, loaded.states, loaded.parents, {}).items[0]!.conflicts).toMatchObject([
      { kind: 'delete', usedBy: ['w4'] },
    ])
  })
})
