import { describe, expect, test } from 'bun:test'
import type { DataLayerConfig } from './config.ts'
import { sanitizeStored } from './store.ts'

const VALID: DataLayerConfig = {
  id: 'user-1',
  name: 'Added',
  kind: 'geojson',
  url: 'https://example.org/a.geojson',
}

describe('sanitizeStored', () => {
  test('keeps valid added layers and hidden ids', () => {
    expect(sanitizeStored({ added: [VALID], hidden: ['user-1', 'config-x'] })).toEqual({
      added: [VALID],
      hidden: ['user-1', 'config-x'],
    })
  })

  test('drops a stored layer that no longer passes the checks, and keeps the rest', () => {
    const state = sanitizeStored({
      added: [{ ...VALID, id: 'bad id' }, { ...VALID, kind: 'wms' }, VALID],
      hidden: [],
    })
    expect(state.added).toEqual([VALID])
  })

  test('a repeated id keeps its first entry only', () => {
    const state = sanitizeStored({ added: [VALID, { ...VALID, name: 'Second' }] })
    expect(state.added).toEqual([VALID])
  })

  test('anything that is not a state gives an empty state', () => {
    expect(sanitizeStored(undefined)).toEqual({ added: [], hidden: [] })
    expect(sanitizeStored('{"added":[]}')).toEqual({ added: [], hidden: [] })
    expect(sanitizeStored({ added: 'nope', hidden: { 0: 'x' } })).toEqual({ added: [], hidden: [] })
  })

  test('hidden keeps only text, without repeats', () => {
    expect(sanitizeStored({ hidden: ['a', 1, 'a', null, 'b'] }).hidden).toEqual(['a', 'b'])
  })

  test('an older state without the hidden list is read as nothing hidden', () => {
    expect(sanitizeStored({ added: [VALID] })).toEqual({ added: [VALID], hidden: [] })
  })
})
