import { describe, expect, it } from 'bun:test'
import { splitValue } from './chunks.ts'
import { sampleStatuses } from './measure.ts'

describe('splitValue', () => {
  it('gives no pieces for empty text', () => {
    expect(splitValue('')).toEqual([])
  })

  it('cuts at the given size, and the last piece holds the rest', () => {
    expect(splitValue('abcde', 2)).toEqual(['ab', 'cd', 'e'])
    expect(splitValue('abcd', 2)).toEqual(['ab', 'cd'])
  })

  it('keeps a text of exactly the limit in one piece, and cuts one more character into two', () => {
    expect(splitValue('x'.repeat(255))).toHaveLength(1)
    const two = splitValue('x'.repeat(256))
    expect(two.map((piece) => piece.length)).toEqual([255, 1])
  })

  it('never gives an empty piece and joins back to the input', () => {
    for (let length = 1; length < 700; length += 37) {
      const text = 'Ab-_0'.repeat(length).slice(0, length)
      const pieces = splitValue(text)
      expect(pieces.every((piece) => piece.length > 0 && piece.length <= 255)).toBe(true)
      expect(pieces.join('')).toBe(text)
    }
  })

  it('refuses non-ASCII text, because a character count must be a byte count here', () => {
    expect(() => splitValue('café')).toThrow(RangeError)
    expect(() => splitValue('\u{1d11e}')).toThrow(RangeError)
  })

  it('refuses a piece size below 1', () => {
    expect(() => splitValue('ab', 0)).toThrow(RangeError)
    expect(() => splitValue('ab', 1.5)).toThrow(RangeError)
  })

  it('splits real codec-sized text (seeded statuses) back to the same text', () => {
    const text = sampleStatuses(2000, 'random', 7)
      .map((status) => status.charAt(0))
      .join('')
    expect(splitValue(text).join('')).toBe(text)
  })
})
