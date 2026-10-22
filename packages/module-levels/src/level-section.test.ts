import { describe, expect, test } from 'bun:test'
import {
  levelNumber,
  nextIncline,
  pairOf,
  pairOfSuggestion,
  pairSuggestion,
  pairValue,
} from './level-section.ts'
import type { LevelSuggestion } from './level-suggestions.ts'

describe('pairOf', () => {
  test('level 0;1 with incline=up goes from 0 to 1, known', () => {
    expect(pairOf({ level: '0;1', incline: 'up' })).toEqual({ from: 0, to: 1, known: true })
  })

  test('level 0;1 with incline=down goes from 1 to 0, known', () => {
    expect(pairOf({ level: '0;1', incline: 'down' })).toEqual({ from: 1, to: 0, known: true })
  })

  test('level 0;1 without an incline goes from 0 to 1, not known', () => {
    expect(pairOf({ level: '0;1' })).toEqual({ from: 0, to: 1, known: false })
  })

  test('a slope as incline is no direction', () => {
    expect(pairOf({ level: '0;1', incline: '10%' })).toEqual({ from: 0, to: 1, known: false })
  })

  test('one level: from that level, nothing to', () => {
    expect(pairOf({ level: '2' })).toEqual({ from: 2, to: null, known: true })
  })

  test('no level: nothing at either end', () => {
    expect(pairOf({})).toEqual({ from: null, to: null, known: true })
  })
})

describe('pairValue', () => {
  test('from 1 to 0 writes 0;1 with incline=down', () => {
    expect(pairValue(1, 0)).toEqual({ value: '0;1', incline: 'down' })
  })

  test('from 0 to 1 writes 0;1 with incline=up', () => {
    expect(pairValue(0, 1)).toEqual({ value: '0;1', incline: 'up' })
  })

  test('the pair it writes reads back as the same ends', () => {
    const { value, incline } = pairValue(3, 1)
    expect(pairOf({ level: value, incline })).toEqual({ from: 3, to: 1, known: true })
  })
})

describe('pairOfSuggestion', () => {
  test('a suggested pair reads its ends with its incline', () => {
    expect(pairOfSuggestion(suggestion('0;1', ['connects 0 and 1'], 'down'))).toEqual({
      from: 1,
      to: 0,
      known: true,
    })
  })

  test('a suggested pair without an incline is not known', () => {
    expect(pairOfSuggestion(suggestion('0;1', ['connects 0 and 1']))).toEqual({
      from: 0,
      to: 1,
      known: false,
    })
  })
})

describe('pairSuggestion', () => {
  test('finds the suggestion that connects two levels', () => {
    const connects = suggestion('0;1', ['connects 0 and 1'], 'up')
    expect(pairSuggestion([suggestion('2', ['connected: 3 corridors']), connects])).toBe(connects)
  })

  test('none when no suggestion connects levels', () => {
    expect(pairSuggestion([suggestion('2', ['connected: 3 corridors'])])).toBeUndefined()
  })
})

describe('nextIncline', () => {
  test('up becomes down, down becomes up, missing becomes down', () => {
    expect(nextIncline('up')).toBe('down')
    expect(nextIncline('down')).toBe('up')
    expect(nextIncline(undefined)).toBe('down')
  })
})

describe('levelNumber', () => {
  test('reads a single level, negative ones too', () => {
    expect(levelNumber('2')).toBe(2)
    expect(levelNumber('-1')).toBe(-1)
  })

  test('null for a pair, a range or text', () => {
    expect(levelNumber('0;1')).toBeNull()
    expect(levelNumber('0-2')).toBeNull()
    expect(levelNumber('none')).toBeNull()
  })
})

function suggestion(value: string, reasons: string[], incline?: 'up' | 'down'): LevelSuggestion {
  return incline ? { value, reasons, ids: [], incline } : { value, reasons, ids: [] }
}
