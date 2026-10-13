import { describe, expect, test } from 'bun:test'
import { differsFromStored, startShown, writesFor } from './shown.ts'

/** Filter states in any order mean the same: the sorted list is the notation the test compares */
const sorted = (value: string) => value.split(',').filter(Boolean).sort().join(',')

describe('startShown: the URL, else the stored choice, else the default', () => {
  test('the URL wins over the stored choice and the default, and is a link', () => {
    expect(startShown({ url: 'buildings:hidden', stored: 'roads:hidden', fallback: '' })).toEqual({
      value: 'buildings:hidden',
      fromLink: true,
    })
  })

  test('without a URL value the stored choice holds, and nothing comes from a link', () => {
    expect(startShown({ url: null, stored: 'roads:hidden', fallback: '' })).toEqual({
      value: 'roads:hidden',
      fromLink: false,
    })
    expect(startShown({ url: undefined, stored: 'roads:hidden', fallback: '' }).fromLink).toBe(
      false,
    )
  })

  test('without a URL value and without a stored choice the default holds', () => {
    expect(startShown({ url: null, stored: undefined, fallback: 'x:hidden' })).toEqual({
      value: 'x:hidden',
      fromLink: false,
    })
  })

  test('a stored choice of the defaults (an empty value) is a choice: the URL still wins', () => {
    expect(startShown({ url: null, stored: '', fallback: 'x:hidden' })).toEqual({
      value: '',
      fromLink: false,
    })
    expect(startShown({ url: 'roads:hidden', stored: '', fallback: '' })).toEqual({
      value: 'roads:hidden',
      fromLink: true,
    })
  })

  test('an empty URL value is no value', () => {
    expect(startShown({ url: '', stored: 'roads:hidden', fallback: '' })).toEqual({
      value: 'roads:hidden',
      fromLink: false,
    })
  })

  test('a URL that differs from the stored choice comes from a link', () => {
    expect(
      startShown({ url: 'a:hidden,b:readonly', stored: 'a:hidden', fallback: '' }).fromLink,
    ).toBe(true)
  })

  test('a URL that repeats the stored choice is not a difference', () => {
    expect(startShown({ url: 'a:hidden', stored: 'a:hidden', fallback: '' })).toEqual({
      value: 'a:hidden',
      fromLink: false,
    })
    expect(
      startShown(
        { url: 'b:readonly,a:hidden', stored: 'a:hidden,b:readonly', fallback: '' },
        sorted,
      ).fromLink,
    ).toBe(false)
  })
})

describe('differsFromStored: the mark and the row', () => {
  test('nothing is marked when what is shown is the stored choice', () => {
    expect(differsFromStored('a:hidden', 'a:hidden', '')).toBe(false)
  })

  test('the default counts as the stored choice when nothing is stored', () => {
    expect(differsFromStored('', undefined, '')).toBe(false)
    expect(differsFromStored('a:hidden', undefined, '')).toBe(true)
  })

  test('a link that changes the stored choice is marked, and the stored choice of the defaults too', () => {
    expect(differsFromStored('a:hidden', 'b:readonly', '')).toBe(true)
    expect(differsFromStored('a:hidden', '', '')).toBe(true)
    expect(differsFromStored('', 'b:readonly', '')).toBe(true)
  })

  test('with the normalisation, the order of the states is not a difference', () => {
    expect(differsFromStored('b:readonly,a:hidden', 'a:hidden,b:readonly', '', sorted)).toBe(false)
    expect(differsFromStored('b:readonly,a:hidden', 'a:hidden', '', sorted)).toBe(true)
  })
})

describe('writesFor: what a change of the person writes', () => {
  test('a change writes the URL and the stored choice', () => {
    expect(writesFor('buildings:hidden')).toEqual({
      url: 'buildings:hidden',
      stored: 'buildings:hidden',
    })
  })

  test('back to the defaults removes the URL parameter and stores the defaults', () => {
    expect(writesFor('')).toEqual({ url: null, stored: '' })
  })
})
