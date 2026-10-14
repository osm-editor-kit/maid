import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { RECENTS_TO_STORE, recentsActions, restoreRecents, withRecent } from './recents.ts'

// The store reads and writes localStorage under `maid:recents` (version 1). The write shows what is stored.
const KEY = 'maid:recents'
const entries = new Map<string, string>()
const fake = {
  getItem: (name: string) => entries.get(name) ?? null,
  setItem: (name: string, value: string) => void entries.set(name, value),
  removeItem: (name: string) => void entries.delete(name),
}
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true })
})

afterAll(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

/** What the store wrote last */
function written() {
  return JSON.parse(entries.get(KEY) ?? 'null')
}

describe('withRecent (iD setMostRecent)', () => {
  it('puts a new preset first', () => {
    expect(withRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('moves a preset that is used again to the front, once', () => {
    expect(withRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(withRecent(['a'], 'a')).toEqual(['a'])
  })

  it('keeps at most 30 presets: the least recent goes first (iD MAX_RECENTS_TO_STORE)', () => {
    expect(RECENTS_TO_STORE).toBe(30)
    const full = Array.from({ length: 30 }, (_, index) => `p${index}`)
    const next = withRecent(full, 'new')
    expect(next).toHaveLength(30)
    expect(next[0]).toBe('new')
    expect(next).not.toContain('p29')
    expect(next[1]).toBe('p0')
  })

  it('does not change the list it is given', () => {
    const ids = ['a', 'b']
    withRecent(ids, 'c')
    expect(ids).toEqual(['a', 'b'])
  })
})

describe('the recents store', () => {
  it('remembers the presets chosen, most recent first', () => {
    recentsActions.remember('amenity/bench')
    recentsActions.remember('shop/bakery')
    recentsActions.remember('amenity/bench')
    expect(written().state.ids).toEqual(['amenity/bench', 'shop/bakery'])
  })

  it('writes only the ids, in the shape it has always had', () => {
    recentsActions.remember('shop/bakery')
    expect(written()).toEqual({ state: { ids: ['shop/bakery', 'amenity/bench'] }, version: 1 })
  })

  it('reads a stored value: strings only, each once, others left out', () => {
    expect(restoreRecents({ ids: ['a', 1, 'a', '', 'b', null] }, { ids: [] as string[] })).toEqual({
      ids: ['a', 'b'],
    })
  })

  it('reads a stored value that is not a list of ids as none', () => {
    expect(restoreRecents({ ids: 'a' }, { ids: ['x'] })).toEqual({ ids: [] })
    expect(restoreRecents('nothing', { ids: ['x'] })).toEqual({ ids: [] })
    expect(restoreRecents({}, { ids: ['x'] })).toEqual({ ids: [] })
  })

  it('keeps the state as it is when nothing is stored', () => {
    const current = { ids: ['a'] }
    expect(restoreRecents(undefined, current)).toBe(current)
  })

  it('stores at most 30 ids on load', () => {
    const many = Array.from({ length: 40 }, (_, index) => `p${index}`)
    expect(restoreRecents({ ids: many }, { ids: [] as string[] }).ids).toHaveLength(30)
  })
})
