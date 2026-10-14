import { describe, expect, test } from 'bun:test'
import { ID_NOTES, notesValueFor, parseAsNotes, shownNotes } from './url.ts'

describe('the notes parameter', () => {
  test('iD names it notes, and Maid writes the same name', () => {
    expect(ID_NOTES.name).toBe('notes')
    expect(ID_NOTES.aliases).toBeUndefined()
  })

  test('a value turns the notes on, as iD reads it; an empty value is no opinion', () => {
    expect(parseAsNotes.parse('1')).toBe(true)
    expect(parseAsNotes.parse('yes')).toBe(true)
    expect(parseAsNotes.parse('0')).toBe(true)
    expect(parseAsNotes.parse('')).toBeNull()
  })

  test('Maid writes 1, and the round trip gives on again', () => {
    expect(parseAsNotes.serialize(true)).toBe('1')
    expect(parseAsNotes.parse(parseAsNotes.serialize(true))).toBe(true)
  })

  test('on is written as a key, off as no key', () => {
    expect(notesValueFor(true)).toBe(true)
    expect(notesValueFor(false)).toBeNull()
  })
})

describe('shownNotes: the URL, then the stored choice', () => {
  test('a link turns the notes on over a stored off', () => {
    expect(shownNotes(true, false)).toBe(true)
  })

  test('a link without the key shows the stored choice, on or off', () => {
    expect(shownNotes(null, true)).toBe(true)
    expect(shownNotes(null, false)).toBe(false)
  })

  test('the default is off: nothing is requested until the person or a link switches the notes on', () => {
    expect(shownNotes(null, false)).toBe(false)
  })
})
