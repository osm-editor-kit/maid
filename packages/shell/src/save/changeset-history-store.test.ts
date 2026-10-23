import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { changesetHistoryActions as actions, currentHistory } from './changeset-history-store.ts'
import { parseHistory } from './changeset-history.ts'

/** A localStorage stand-in that keeps what it is given */
function fakeStorage(failing = false) {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failing) throw new Error('storage is full')
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
  }
}

describe('the changeset history in storage', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('an upload is kept in memory and in storage under its own versioned key', () => {
    actions.remember({ comment: 'Added benches', source: 'survey;gps' })
    expect(currentHistory().comments[0]).toBe('Added benches')
    expect(currentHistory().sources.slice(0, 2)).toEqual(['survey', 'gps'])
    expect(parseHistory(storage.items.get('maid:changeset-history') ?? null)).toEqual(
      currentHistory(),
    )
  })

  it('full or blocked storage does not stop the list from working for this visit', () => {
    storage = fakeStorage(true)
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    actions.remember({ comment: 'Kept in memory only' })
    expect(currentHistory().comments[0]).toBe('Kept in memory only')
    expect(storage.items.size).toBe(0)
  })
})
