import { describe, expect, test } from 'bun:test'
import type { ModuleStorage } from '../storage.ts'
import { createTaginfoStore } from './taginfo-store.ts'

function memory(): ModuleStorage & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (name) => items.get(name) ?? null,
    setItem: (name, value) => void items.set(name, value),
    removeItem: (name) => void items.delete(name),
  }
}

describe('createTaginfoStore: taginfo answers kept for a week', () => {
  test('an answer comes back until it is older than the limit, then it goes', () => {
    let time = 0
    const storage = memory()
    const store = createTaginfoStore(storage, { maxAge: 1000, now: () => time })
    store.set('https://t/a', { data: [1] })
    time = 999
    expect(store.get('https://t/a')).toEqual({ data: [1] })
    time = 1001
    expect(store.get('https://t/a')).toBeUndefined()
    expect(storage.items.has('maid:taginfo:https://t/a')).toBe(false)
  })

  test('past the most entries the oldest go first', () => {
    let time = 0
    const store = createTaginfoStore(memory(), { maxEntries: 2, now: () => time })
    for (const url of ['a', 'b', 'c']) {
      time += 1
      store.set(url, url)
    }
    expect([store.get('a'), store.get('b'), store.get('c')]).toEqual([undefined, 'b', 'c'])
  })

  test('a broken index or entry is no answer', () => {
    const storage = memory()
    storage.setItem('maid:taginfo-index', 'not json')
    expect(createTaginfoStore(storage).get('a')).toBeUndefined()
  })
})
