import { describe, expect, test } from 'bun:test'
import fixture from './fixture-values.json'
import { levelsOf, parseLevels } from './parse.ts'

/** The real values of the fixtures, per key: [value, number of features]; JSON types the pairs as plain arrays */
const values = fixture as unknown as Record<string, [string, number][]>

describe('parseLevels: parts', () => {
  test('a semicolon separates levels, sorted upwards', () => {
    expect(parseLevels('1;-2;0;1')).toEqual({
      levels: [-2, 0, 1],
      problems: [{ key: 'level', part: '1', reason: 'duplicate' }],
    })
    expect(parseLevels('-1;0;1;2;3').levels).toEqual([-1, 0, 1, 2, 3])
  })

  test('spaces around a part are trimmed', () => {
    expect(parseLevels(' 1 ; 2 ')).toEqual({ levels: [1, 2], problems: [] })
  })

  test('an empty part adds nothing and is a problem', () => {
    expect(parseLevels(';0')).toEqual({
      levels: [0],
      problems: [{ key: 'level', part: '', reason: 'empty' }],
    })
    expect(parseLevels('0;')).toEqual({
      levels: [0],
      problems: [{ key: 'level', part: '', reason: 'empty' }],
    })
    expect(parseLevels('')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '', reason: 'empty' }],
    })
  })

  test('the key of the tag is used in the problems', () => {
    expect(parseLevels('0,5', 'repeat_on').problems).toEqual([
      { key: 'repeat_on', part: '0,5', reason: 'comma' },
    ])
  })
})

describe('parseLevels: numbers', () => {
  test('a number may be negative or have decimals', () => {
    expect(parseLevels('40').levels).toEqual([40])
    expect(parseLevels('-1.3').levels).toEqual([-1.3])
    expect(parseLevels('0.5').levels).toEqual([0.5])
    expect(parseLevels('-0.3').levels).toEqual([-0.3])
  })

  test('a decimal keeps its exact value (no float drift)', () => {
    expect(parseLevels('-1.3').levels[0]).toBe(-1.3)
    expect(parseLevels('-1.7;-1.3').levels).toEqual([-1.7, -1.3])
  })

  test('minus zero is zero', () => {
    expect(Object.is(parseLevels('-0').levels[0], 0)).toBe(true)
  })

  test('a comma inside a part is ambiguous: a problem, no level', () => {
    expect(parseLevels('0,5')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '0,5', reason: 'comma' }],
    })
    expect(parseLevels('0,1;2')).toEqual({
      levels: [2],
      problems: [{ key: 'level', part: '0,1', reason: 'comma' }],
    })
  })

  test('anything else is not a number', () => {
    for (const part of ['abc', '1.', '.5', '+1', '--1', '1-2.5', '0 - 6', '1e3']) {
      expect(parseLevels(part)).toEqual({
        levels: [],
        problems: [{ key: 'level', part, reason: 'not-a-number' }],
      })
    }
  })
})

describe('parseLevels: ranges', () => {
  test('a range gives every whole level from a to b, both ends included', () => {
    expect(parseLevels('0-6').levels).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(parseLevels('0-1')).toEqual({ levels: [0, 1], problems: [] })
  })

  test('the minus of a negative start or end belongs to the number', () => {
    expect(parseLevels('-1-0').levels).toEqual([-1, 0])
    expect(parseLevels('-3--1').levels).toEqual([-3, -2, -1])
  })

  test('a range with equal ends gives that one level', () => {
    expect(parseLevels('3-3').levels).toEqual([3])
  })

  test('a range that runs downwards adds nothing and is a problem', () => {
    expect(parseLevels('5-2')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '5-2', reason: 'reversed-range' }],
    })
    expect(parseLevels('-1--3').problems).toEqual([
      { key: 'level', part: '-1--3', reason: 'reversed-range' },
    ])
  })

  test('a range has whole numbers only', () => {
    expect(parseLevels('0-1.5').problems).toEqual([
      { key: 'level', part: '0-1.5', reason: 'not-a-number' },
    ])
  })

  test('a range and a level may be combined in one value, with the duplicate kept once', () => {
    expect(parseLevels('0-2;1')).toEqual({
      levels: [0, 1, 2],
      problems: [{ key: 'level', part: '1', reason: 'duplicate' }],
    })
  })
})

describe('parseLevels: duplicates', () => {
  test('the same level twice is kept once and is a problem', () => {
    expect(parseLevels('0;0')).toEqual({
      levels: [0],
      problems: [{ key: 'level', part: '0', reason: 'duplicate' }],
    })
    expect(parseLevels('-1;-1')).toEqual({
      levels: [-1],
      problems: [{ key: 'level', part: '-1', reason: 'duplicate' }],
    })
  })

  test('a duplicated level is reported once, however often it repeats', () => {
    expect(parseLevels('0;0;0').problems).toEqual([
      { key: 'level', part: '0', reason: 'duplicate' },
    ])
  })

  test('each duplicated level is reported once', () => {
    expect(parseLevels('1;0;1;0').problems).toEqual([
      { key: 'level', part: '1', reason: 'duplicate' },
      { key: 'level', part: '0', reason: 'duplicate' },
    ])
  })
})

describe('levelsOf', () => {
  test('no tags of levels: nothing', () => {
    expect(levelsOf({ name: 'Foyer', shop: 'yes' })).toEqual({ levels: [], problems: [] })
    expect(levelsOf({})).toEqual({ levels: [], problems: [] })
  })

  test('level', () => {
    expect(levelsOf({ level: '-2;-1' })).toEqual({ levels: [-2, -1], problems: [] })
  })

  test('level and repeat_on give the levels of both, sorted and without duplicates', () => {
    expect(levelsOf({ level: '0', repeat_on: '1;2' })).toEqual({ levels: [0, 1, 2], problems: [] })
  })

  test('a level named in level and in repeat_on is a duplicate, reported with repeat_on', () => {
    expect(levelsOf({ level: '0', repeat_on: '0;1' })).toEqual({
      levels: [0, 1],
      problems: [{ key: 'repeat_on', part: '0', reason: 'duplicate' }],
    })
  })

  test('problems carry the key of their tag', () => {
    expect(levelsOf({ level: '0,5', repeat_on: '-1;' }).problems).toEqual([
      { key: 'level', part: '0,5', reason: 'comma' },
      { key: 'repeat_on', part: '', reason: 'empty' },
    ])
  })

  test('without level and repeat_on, min_level and max_level give every whole level from min to max', () => {
    expect(levelsOf({ min_level: '-1', max_level: '2' })).toEqual({
      levels: [-1, 0, 1, 2],
      problems: [],
    })
    expect(levelsOf({ min_level: '0', max_level: '5' }).levels).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('only min_level or only max_level gives that one level', () => {
    expect(levelsOf({ min_level: '-5' })).toEqual({ levels: [-5], problems: [] })
    expect(levelsOf({ max_level: '10' })).toEqual({ levels: [10], problems: [] })
  })

  test('min_level and max_level with the same value give that one level', () => {
    expect(levelsOf({ min_level: '0', max_level: '0' })).toEqual({ levels: [0], problems: [] })
  })

  test('a decimal bound gives the whole levels inside it (inferred, not decided)', () => {
    expect(levelsOf({ min_level: '-1.5', max_level: '1' }).levels).toEqual([-1, 0, 1])
  })

  test('min_level above max_level adds nothing and is a problem', () => {
    expect(levelsOf({ min_level: '3', max_level: '1' })).toEqual({
      levels: [],
      problems: [{ key: 'min_level', part: '3-1', reason: 'reversed-range' }],
    })
  })

  test('a min_level or max_level that is not a number is ignored', () => {
    expect(levelsOf({ min_level: '-1', max_level: 'roof' })).toEqual({ levels: [-1], problems: [] })
    expect(levelsOf({ min_level: 'basement' })).toEqual({ levels: [], problems: [] })
  })

  test('level, repeat_on and min_level are not combined: a level wins over min_level and max_level', () => {
    expect(levelsOf({ level: '2', min_level: '-3', max_level: '5' })).toEqual({
      levels: [2],
      problems: [],
    })
    expect(levelsOf({ repeat_on: '2', min_level: '-3', max_level: '5' })).toEqual({
      levels: [2],
      problems: [],
    })
  })

  test('level:ref is a label, not a level', () => {
    expect(levelsOf({ 'level:ref': '-1' })).toEqual({ levels: [], problems: [] })
    expect(levelsOf({ level: '2', 'level:ref': 'EG' })).toEqual({ levels: [2], problems: [] })
  })
})

describe('the real values of the fixtures', () => {
  test('every value of level, min_level, max_level and building:min_level parses without throwing', () => {
    for (const [key, rows] of Object.entries(values)) {
      for (const [value] of rows) {
        const result = parseLevels(value, key)
        for (const level of result.levels) expect(Number.isFinite(level)).toBe(true)
        expect([...result.levels].sort((a, b) => a - b)).toEqual([...result.levels])
        expect(new Set(result.levels).size).toBe(result.levels.length)
      }
    }
  })

  test('the fixtures have the keys and the number of values they are cut with', () => {
    expect(Object.keys(values).sort()).toEqual([
      'building:min_level',
      'level',
      'max_level',
      'min_level',
    ])
    expect(values.level?.length).toBe(79)
  })

  test('the values with a comma, an empty part or a duplicate give the problems', () => {
    expect(parseLevels('0,5')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '0,5', reason: 'comma' }],
    })
    expect(parseLevels('0,1')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '0,1', reason: 'comma' }],
    })
    expect(parseLevels(';0')).toEqual({
      levels: [0],
      problems: [{ key: 'level', part: '', reason: 'empty' }],
    })
    expect(parseLevels('0;0')).toEqual({
      levels: [0],
      problems: [{ key: 'level', part: '0', reason: 'duplicate' }],
    })
  })

  test('the values with a range give every whole level in it', () => {
    expect(parseLevels('0-1')).toEqual({ levels: [0, 1], problems: [] })
    expect(parseLevels('-1-0')).toEqual({ levels: [-1, 0], problems: [] })
    expect(parseLevels('0-6')).toEqual({ levels: [0, 1, 2, 3, 4, 5, 6], problems: [] })
  })

  test('-2;-1.7 gives -2 and -1.7', () => {
    expect(parseLevels('-2;-1.7')).toEqual({ levels: [-2, -1.7], problems: [] })
  })

  test('the real values give the levels they are tagged with', () => {
    const expected: [string, number[]][] = [
      ['0', [0]],
      ['-1', [-1]],
      ['1;2', [1, 2]],
      ['-2;-1', [-2, -1]],
      ['-1;0', [-1, 0]],
      ['0;1', [0, 1]],
      ['-1.7', [-1.7]],
      ['-1.3;-1', [-1.3, -1]],
      ['-1.7;-1.3', [-1.7, -1.3]],
      ['-0.5', [-0.5]],
      ['0.5', [0.5]],
      ['-0.9;-1', [-1, -0.9]],
      ['0.3;-0.9', [-0.9, 0.3]],
      ['0;-0.3', [-0.3, 0]],
      ['-5;-3;-1;0', [-5, -3, -1, 0]],
      ['-1;-3;-5', [-5, -3, -1]],
      ['-2;-1;0;1;2', [-2, -1, 0, 1, 2]],
      ['-3;-2;-1;0', [-3, -2, -1, 0]],
      ['8;9;10', [8, 9, 10]],
      ['40', [40]],
      ['0;3;4', [0, 3, 4]],
      ['3;4;5', [3, 4, 5]],
      ['-2;1', [-2, 1]],
      ['2;0', [0, 2]],
      ['0;-2', [-2, 0]],
    ]
    for (const [value, levels] of expected) {
      expect(parseLevels(value).levels).toEqual(levels)
    }
  })

  test('the real min_level, max_level and building:min_level values give their level', () => {
    expect(levelsOf({ min_level: '-1' })).toEqual({ levels: [-1], problems: [] })
    expect(levelsOf({ max_level: '0' })).toEqual({ levels: [0], problems: [] })
    expect(levelsOf({ min_level: '-5', max_level: '0' }).levels).toEqual([-5, -4, -3, -2, -1, 0])
    expect(parseLevels('12', 'building:min_level')).toEqual({ levels: [12], problems: [] })
  })
})

describe('a range wider than a building', () => {
  test('is too wide and adds no level', () => {
    expect(parseLevels('0-1000000000')).toEqual({
      levels: [],
      problems: [{ key: 'level', part: '0-1000000000', reason: 'too-wide' }],
    })
    expect(levelsOf({ min_level: '0', max_level: '5000' }).problems[0]?.reason).toBe('too-wide')
  })
})
