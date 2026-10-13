import { afterEach, describe, expect, it } from 'bun:test'
import { RECENTS_TO_STORE, useRecents, withRecent } from './recents.ts'

// the store's merge reads a stored value, as a new visit does
function merged(stored: unknown) {
  const options = useRecents.persist.getOptions()
  const current = useRecents.getState()
  return options.merge?.(stored, current) ?? current
}

afterEach(() => {
  useRecents.setState({ ids: [] })
})

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
    useRecents.getState().remember('amenity/bench')
    useRecents.getState().remember('shop/bakery')
    useRecents.getState().remember('amenity/bench')
    expect(useRecents.getState().ids).toEqual(['amenity/bench', 'shop/bakery'])
  })

  it('reads a stored value: strings only, each once, others left out', () => {
    expect(merged({ ids: ['a', 1, 'a', '', 'b', null] })).toMatchObject({ ids: ['a', 'b'] })
  })

  it('reads a stored value that is not a list of ids as none, and keeps the rest of the state', () => {
    expect(merged({ ids: 'a' })).toMatchObject({ ids: [] })
    expect(merged('nothing')).toMatchObject({ ids: [] })
    expect(merged({})).toMatchObject({ ids: [] })
  })

  it('keeps the state as it is when nothing is stored', () => {
    useRecents.setState({ ids: ['a'] })
    expect(merged(undefined)).toMatchObject({ ids: ['a'] })
  })

  it('stores at most 30 ids on load', () => {
    const many = Array.from({ length: 40 }, (_, index) => `p${index}`)
    expect(merged({ ids: many }).ids).toHaveLength(30)
  })

  it('stores only the ids, not the functions', () => {
    const partial = useRecents.persist.getOptions().partialize?.(useRecents.getState())
    expect(Object.keys(partial ?? {})).toEqual(['ids'])
  })
})
