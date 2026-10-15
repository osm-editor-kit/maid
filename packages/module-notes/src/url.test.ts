import { describe, expect, test } from 'bun:test'
import { ID_NOTES, parseAsNotes } from './url.ts'

describe('the notes parameter', () => {
  test('iD names it notes, and Maid writes the same name', () => {
    expect(ID_NOTES.name).toBe('notes')
    expect(ID_NOTES.aliases).toBeUndefined()
  })

  test('a value turns the notes on, as iD reads it (notes=0 too)', () => {
    expect(parseAsNotes.parse('1')).toBe(true)
    expect(parseAsNotes.parse('yes')).toBe(true)
    expect(parseAsNotes.parse('0')).toBe(true)
  })

  test('the empty value is off: it is what Maid writes for off, and core then removes the key', () => {
    expect(parseAsNotes.parse('')).toBe(false)
    expect(parseAsNotes.serialize(false)).toBe('')
  })

  test('on is written as 1, and the round trip gives on and off again', () => {
    expect(parseAsNotes.serialize(true)).toBe('1')
    expect(parseAsNotes.parse(parseAsNotes.serialize(true))).toBe(true)
    expect(parseAsNotes.parse(parseAsNotes.serialize(false))).toBe(false)
  })

  test('equal values compare equal, so that an unchanged value writes nothing', () => {
    expect(parseAsNotes.eq?.(true, true)).toBe(true)
    expect(parseAsNotes.eq?.(true, false)).toBe(false)
  })
})
