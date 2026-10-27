import 'fake-indexeddb/auto'
import { describe, expect, it } from 'bun:test'
import type { ModuleStorage } from '@osm-editor-kit/maid-core'
import { createFileCache, LAST_LIST_KEY, mirrorKey, readMirror, writeMirror } from './local.ts'
import { openTaskText, restoreLastList } from './open.ts'
import { createTasksStore } from './store.ts'
import { makeFile } from './test-support.ts'

function memoryStorage(): ModuleStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

let counter = 0
const cacheName = () => `test-tasks-${++counter}-${Date.now()}`

const file = makeFile([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
const text = JSON.stringify(file)

describe('the local mirror', () => {
  it('writes and reads statuses and revisions', async () => {
    const storage = memoryStorage()
    await writeMirror(storage, 'key12345', 'hash1234', {
      statuses: ['done', 'open', 'skipped'],
      localRevision: 4,
      ackedRevision: 3,
    })
    expect(storage.map.has(mirrorKey('key12345'))).toBe(true)
    expect(await readMirror(storage, 'key12345', 'hash1234', 3)).toEqual({
      statuses: ['done', 'open', 'skipped'],
      localRevision: 4,
      ackedRevision: 3,
    })
  })

  it('ignores progress for another order, another size, or broken text', async () => {
    const storage = memoryStorage()
    await writeMirror(storage, 'k', 'hash1234', {
      statuses: ['done', 'open'],
      localRevision: 1,
      ackedRevision: 0,
    })
    expect(await readMirror(storage, 'k', 'other', 2)).toBeUndefined()
    expect(await readMirror(storage, 'k', 'hash1234', 5)).toBeUndefined()
    storage.setItem(mirrorKey('k'), '{not json')
    expect(await readMirror(storage, 'k', 'hash1234', 2)).toBeUndefined()
    expect(await readMirror(storage, 'missing', 'h', 2)).toBeUndefined()
  })

  it('drops an older write that ends after a newer one started', async () => {
    const storage = memoryStorage()
    await writeMirror(
      storage,
      'k',
      'h',
      { statuses: ['done'], localRevision: 1, ackedRevision: 0 },
      () => false,
    )
    expect(storage.map.size).toBe(0)
  })
})

describe('the file cache', () => {
  const record = { listKey: 'k1', title: 'T', fileName: 'f.geojson', text, savedAt: 1 }

  it('keeps a file by list key and removes it', async () => {
    const cache = createFileCache(cacheName(), true)
    expect(await cache.load('k1')).toBeUndefined()
    await cache.save(record)
    expect(await cache.load('k1')).toEqual(record)
    await cache.remove('k1')
    expect(await cache.load('k1')).toBeUndefined()
  })

  it('is off when disabled (automation): nothing is kept', async () => {
    const cache = createFileCache(cacheName(), false)
    await cache.save(record)
    expect(await cache.load('k1')).toBeUndefined()
  })
})

describe('opening a file', () => {
  it('opens, remembers the file and the list, and restores both on the next visit', async () => {
    const storage = memoryStorage()
    const cache = createFileCache(cacheName(), true)
    const first = createTasksStore()
    expect(await openTaskText({ store: first, storage, cache }, text, 'my.geojson')).toBe(true)
    first.getState().actions.setStatus(1, 'done')
    const { list, statuses, localRevision, ackedRevision } = first.getState()
    await writeMirror(storage, list!.listKey, list!.orderHash, {
      statuses,
      localRevision,
      ackedRevision,
    })
    expect(storage.getItem(LAST_LIST_KEY)).toBe(list!.listKey)

    const second = createTasksStore()
    expect(await restoreLastList({ store: second, storage, cache })).toBe(true)
    expect(second.getState().list?.fileName).toBe('my.geojson')
    expect(second.getState().statuses).toEqual(['open', 'done', 'open'])
    expect(second.getState().localRevision).toBe(1)
  })

  it('starts all open when the file has other tasks than the saved progress', async () => {
    const storage = memoryStorage()
    const cache = createFileCache(cacheName(), true)
    const store = createTasksStore()
    await openTaskText({ store, storage, cache }, text, 'a.geojson')
    store.getState().actions.setStatus(0, 'done')
    const { list, statuses, localRevision, ackedRevision } = store.getState()
    await writeMirror(storage, list!.listKey, list!.orderHash, {
      statuses,
      localRevision,
      ackedRevision,
    })
    const changed = JSON.stringify(makeFile([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]))
    const again = createTasksStore()
    await openTaskText({ store: again, storage, cache }, changed, 'a.geojson')
    expect(again.getState().statuses).toEqual(['open', 'open', 'open', 'open'])
  })

  it('reports the first errors of an invalid file and keeps the open list', async () => {
    const storage = memoryStorage()
    const cache = createFileCache(cacheName(), true)
    const store = createTasksStore()
    await openTaskText({ store, storage, cache }, text, 'ok.geojson')
    const bad = JSON.stringify({ type: 'FeatureCollection', features: [] })
    expect(await openTaskText({ store, storage, cache }, bad, 'bad.geojson')).toBe(false)
    const state = store.getState()
    expect(state.error?.fileName).toBe('bad.geojson')
    expect(state.error?.errors.length).toBeGreaterThan(0)
    expect(state.list?.fileName).toBe('ok.geojson')
    expect(await openTaskText({ store, storage, cache }, '{nope', 'x')).toBe(false)
    expect(store.getState().error?.errors[0]?.message).toContain('Not valid JSON')
  })

  it('remembers nothing under automation (empty storage and cache)', async () => {
    const store = createTasksStore()
    const cache = createFileCache(cacheName(), false)
    const storage: ModuleStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    await openTaskText({ store, storage, cache }, text, 'x.geojson')
    expect(await restoreLastList({ store: createTasksStore(), storage, cache })).toBe(false)
  })

  it('opens the fixture file', async () => {
    const fixture = await Bun.file(
      new URL('../../../fixtures/tasks/small.tasks.geojson', import.meta.url),
    ).text()
    const store = createTasksStore()
    const storage = memoryStorage()
    expect(
      await openTaskText(
        { store, storage, cache: createFileCache(cacheName(), false) },
        fixture,
        'small',
      ),
    ).toBe(true)
    const state = store.getState()
    expect(state.statuses).toHaveLength(40)
    expect(state.list?.refs.size).toBeGreaterThan(0)
    expect(state.list?.geojson.features).toHaveLength(40)
  })
})
