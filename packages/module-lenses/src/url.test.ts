import { describe, expect, test } from 'bun:test'
import { NO_LENS, parseAsLens, resolveLens } from './url.ts'

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

  test('an unknown id is read as it is: whether it is a lens is decided by resolveLens', () => {
    expect(parseAsLens.parse('not-a-lens')).toBe('not-a-lens')
  })
})

describe('resolveLens: an id the editor has is shown, any other id is none', () => {
  test('a lens here is shown as it is', () => {
    expect(resolveLens('lit', KNOWN)).toBe('lit')
    expect(resolveLens('surface', KNOWN)).toBe('surface')
  })

  test('none is none', () => {
    expect(resolveLens(NO_LENS, KNOWN)).toBe(NO_LENS)
  })

  test('an unknown id becomes none, so that the URL is corrected to it', () => {
    expect(resolveLens('removed-import', KNOWN)).toBe(NO_LENS)
  })

  test('no lens is known at all: every id is none', () => {
    expect(resolveLens('surface', [])).toBe(NO_LENS)
  })
})
