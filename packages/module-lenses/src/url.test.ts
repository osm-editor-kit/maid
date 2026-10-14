import { describe, expect, test } from 'bun:test'
import { NO_LENS, parseAsLens, startLens } from './url.ts'

const KNOWN = ['surface', 'lit', 'parking']

describe('parseAsLens', () => {
  test('an id and none round trip through the URL value', () => {
    for (const id of ['surface', 'parking', NO_LENS]) {
      expect(parseAsLens.parse(parseAsLens.serialize(id))).toBe(id)
    }
  })

  test('an empty value is no opinion', () => {
    expect(parseAsLens.parse('')).toBeNull()
  })

  test('an unknown id is read as it is: whether it is a lens is decided at start', () => {
    expect(parseAsLens.parse('not-a-lens')).toBe('not-a-lens')
  })
})

describe('startLens: URL, then the stored choice, then none', () => {
  test('the URL names a lens: it is shown, whatever is stored', () => {
    expect(startLens('lit', 'surface', KNOWN)).toBe('lit')
    expect(startLens('lit', null, KNOWN)).toBe('lit')
  })

  test('the URL says none: no lens, even when a lens is stored', () => {
    expect(startLens(NO_LENS, 'surface', KNOWN)).toBeNull()
  })

  test('the URL says nothing: the stored choice is shown', () => {
    expect(startLens(null, 'surface', KNOWN)).toBe('surface')
  })

  test('nothing in the URL and nothing stored: no lens (the default)', () => {
    expect(startLens(null, null, KNOWN)).toBeNull()
  })

  test('an unknown id in the URL is no lens, and it does not fall back to the stored choice', () => {
    expect(startLens('removed-import', 'surface', KNOWN)).toBeNull()
  })

  test('a stored choice that is no lens any more is no lens', () => {
    expect(startLens(null, 'removed-import', KNOWN)).toBeNull()
  })

  test('no lens is known at all: every id is no lens', () => {
    expect(startLens('surface', 'surface', [])).toBeNull()
  })
})
