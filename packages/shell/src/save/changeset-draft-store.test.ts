import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { changesetDraftActions as actions, currentDraft } from './changeset-draft-store.ts'

/** A localStorage stand-in that keeps what it is given and remembers the keys it was asked to write */
function fakeStorage() {
  const items = new Map<string, string>()
  const writes: string[] = []
  return {
    items,
    writes,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key)
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
  }
}

describe('the changeset draft in storage', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    actions.reset()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  // the links are read once per page: the first test of this file is the one that reads them
  it('a link prefills the draft in memory and writes nothing to storage', () => {
    actions.readLinks({ comment: 'from a link', source: 'survey' })
    actions.open(Date.now())
    expect(currentDraft()).toMatchObject({ comment: 'from a link', source: 'survey' })
    expect(storage.writes).toEqual([])
    expect(storage.items.size).toBe(0)
  })

  it('a change the person commits is what is written', () => {
    actions.open(Date.now())
    actions.edit({ comment: 'my own words' })
    expect(storage.writes).toEqual([])
    actions.commit(Date.now())
    expect(storage.writes).toEqual(['maid:changeset'])
    expect(JSON.parse(storage.items.get('maid:changeset') ?? 'null')).toMatchObject({
      comment: 'my own words',
    })
  })
})
