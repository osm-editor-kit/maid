import { describe, expect, test } from 'bun:test'
import {
  canStep,
  compassDegrees,
  formatHeight,
  formatNumber,
  formatSpeed,
  isDirectionKey,
  normalizeNumber,
  parseHeight,
  parseNumber,
  parseSpeed,
  stepValue,
} from './number-logic.ts'

describe('parseNumber', () => {
  test('reads a dot or a decimal comma and counts the decimal places', () => {
    expect(parseNumber('1.50')).toEqual({ value: 1.5, decimals: 2 })
    expect(parseNumber('1,5')).toEqual({ value: 1.5, decimals: 1 })
    expect(parseNumber(' -0.5 ')).toEqual({ value: -0.5, decimals: 1 })
    expect(parseNumber('5.')).toEqual({ value: 5, decimals: 0 })
    expect(parseNumber('.5')).toEqual({ value: 0.5, decimals: 1 })
  })

  test('rejects text that is not a plain number', () => {
    expect(parseNumber('')).toBeUndefined()
    expect(parseNumber('.')).toBeUndefined()
    expect(parseNumber('+')).toBeUndefined()
    expect(parseNumber('50 mph')).toBeUndefined()
    expect(parseNumber('12;14')).toBeUndefined()
    expect(parseNumber('1,5,5')).toBeUndefined()
    expect(parseNumber('1e3')).toBeUndefined()
  })
})

describe('formatNumber', () => {
  test('keeps the decimal places and writes no sign on zero', () => {
    expect(formatNumber(0.3, 1)).toBe('0.3')
    expect(formatNumber(2, 2)).toBe('2.00')
    expect(formatNumber(-0.04, 1)).toBe('0.0')
    expect(formatNumber(-0, 0)).toBe('0')
  })
})

describe('compassDegrees and isDirectionKey', () => {
  test('reads compass words, full names and abbreviations, in any case', () => {
    expect(compassDegrees('NE')).toBe(45)
    expect(compassDegrees(' nnw ')).toBe(337)
    expect(compassDegrees('northeast')).toBe(45)
    expect(compassDegrees('north-east')).toBeUndefined()
    expect(compassDegrees('constructor')).toBeUndefined()
    expect(compassDegrees('12')).toBeUndefined()
  })

  test('a direction key has a direction part', () => {
    expect(isDirectionKey('direction')).toBe(true)
    expect(isDirectionKey('camera:direction')).toBe(true)
    expect(isDirectionKey('directional')).toBe(false)
    expect(isDirectionKey('maxspeed')).toBe(false)
  })
})

describe('stepValue', () => {
  test('steps up and down by the increment, 1 by default', () => {
    expect(stepValue('5', 1)).toBe('6')
    expect(stepValue('5', -1)).toBe('4')
    expect(stepValue('5', 1, { increment: 5 })).toBe('10')
  })

  test('an empty field steps from 0, clamped to minValue', () => {
    expect(stepValue('', 1)).toBe('1')
    expect(stepValue('', -1)).toBe('-1')
    expect(stepValue('', -1, { minValue: 0 })).toBe('0')
    expect(stepValue('', 1, { minValue: 5 })).toBe('5')
  })

  test('clamps to minValue, so -1 and 0 with minValue 0 stay at 0', () => {
    expect(stepValue('-1', 1, { minValue: 0 })).toBe('0')
    expect(stepValue('0', -1, { minValue: 0 })).toBe('0')
    expect(stepValue('2', -1, { minValue: 5 })).toBe('5')
  })

  test('steps every ;-separated value and keeps the parts that are not numbers', () => {
    expect(stepValue('12;14', 1)).toBe('13;15')
    expect(stepValue('12; 14', -1)).toBe('11;13')
    expect(stepValue('12;foo', 1)).toBe('13;foo')
  })

  test('keeps the decimal places, with no float noise', () => {
    expect(stepValue('0.2', 1, { increment: 0.1 })).toBe('0.3')
    expect(stepValue('0.3', 1, { increment: 0.1 })).toBe('0.4')
    expect(stepValue('0.1', 1, { increment: 0.2 })).toBe('0.3')
    expect(stepValue('1.50', 1)).toBe('2.50')
    expect(stepValue('-0.5', 1, { increment: 0.5 })).toBe('0.0')
  })

  test('the increment adds decimal places when it has more than the text', () => {
    expect(stepValue('1', 1, { increment: 0.25 })).toBe('1.25')
  })

  test('a decimal comma is read and the result is written with a dot', () => {
    expect(stepValue('1,5', 1)).toBe('2.5')
    expect(stepValue('1,5;3', -1)).toBe('0.5;2')
  })

  test('text that is not a number does not step', () => {
    expect(stepValue('yes', 1)).toBe('yes')
    expect(stepValue('yes', 1, { wrap: true })).toBe('yes')
  })

  test('direction fields accept a compass word and wrap at 360', () => {
    expect(stepValue('NE', 1, { increment: 5, wrap: true })).toBe('50')
    expect(stepValue('N', -1, { increment: 5, wrap: true })).toBe('355')
    expect(stepValue('359', 1, { wrap: true })).toBe('0')
    expect(stepValue('0', -1, { wrap: true })).toBe('359')
    expect(stepValue('358', 1, { increment: 5, wrap: true })).toBe('3')
    expect(stepValue('400', 1, { wrap: true })).toBe('41')
  })

  test('other fields do not wrap or read compass words', () => {
    expect(stepValue('359', 1)).toBe('360')
    expect(stepValue('NE', 1)).toBe('NE')
    expect(stepValue('NE', 1, { wrap: false })).toBe('NE')
  })
})

describe('canStep', () => {
  test('a field steps when one of its values is a number', () => {
    expect(canStep('')).toBe(true)
    expect(canStep('12;foo')).toBe(true)
    expect(canStep('-1')).toBe(true)
    expect(canStep('yes')).toBe(false)
  })

  test('a compass word only counts for direction fields', () => {
    expect(canStep('NE')).toBe(false)
    expect(canStep('NE', true)).toBe(true)
  })
})

describe('normalizeNumber (typed values)', () => {
  test('writes a decimal comma as a dot and keeps the decimal places', () => {
    expect(normalizeNumber('1,5')).toBe('1.5')
    expect(normalizeNumber('1.50')).toBe('1.50')
    expect(normalizeNumber(' 7 ')).toBe('7')
    expect(normalizeNumber('1,5;2')).toBe('1.5;2')
  })

  test('clamps typed numbers to minValue', () => {
    expect(normalizeNumber('-1', 0)).toBe('0')
    expect(normalizeNumber('-1.5', 0)).toBe('0.0')
    expect(normalizeNumber('-1')).toBe('-1')
  })

  test('keeps text that is not a number', () => {
    expect(normalizeNumber('12;foo', 0)).toBe('12;foo')
    expect(normalizeNumber('abc')).toBe('abc')
    expect(normalizeNumber('')).toBe('')
  })
})

describe('speed (roadspeed)', () => {
  test('a value without mph is km/h, a value with mph is mph', () => {
    expect(parseSpeed('50')).toEqual({ number: '50', unit: 'km/h' })
    expect(parseSpeed('50 mph')).toEqual({ number: '50', unit: 'mph' })
    expect(parseSpeed('')).toEqual({ number: '', unit: 'km/h' })
    expect(parseSpeed('none')).toEqual({ number: 'none', unit: 'km/h' })
  })

  test('km/h is written as a plain number, mph as <n> mph', () => {
    expect(formatSpeed('50', 'km/h')).toBe('50')
    expect(formatSpeed('50', 'mph')).toBe('50 mph')
    expect(formatSpeed('50,5', 'mph')).toBe('50.5 mph')
    expect(formatSpeed(' 50 ', 'km/h')).toBe('50')
  })

  test('empty means no tag, and a value that is not a number has no unit', () => {
    expect(formatSpeed('', 'mph')).toBeUndefined()
    expect(formatSpeed('  ', 'km/h')).toBeUndefined()
    expect(formatSpeed('none', 'mph')).toBe('none')
    expect(formatSpeed('50;60', 'mph')).toBe('50;60')
  })
})

describe('height (roadheight)', () => {
  test('a value in metres is a plain number, feet and inches use quotes', () => {
    expect(parseHeight('3.5')).toEqual({ primary: '3.5', secondary: '', unit: 'm' })
    expect(parseHeight(`11'6"`)).toEqual({ primary: '11', secondary: '6', unit: 'ft' })
    expect(parseHeight(`11'`)).toEqual({ primary: '11', secondary: '', unit: 'ft' })
    expect(parseHeight(`6"`)).toEqual({ primary: '', secondary: '6', unit: 'ft' })
    expect(parseHeight('')).toEqual({ primary: '', secondary: '', unit: 'm' })
  })

  test('metres are written as a number with a dot', () => {
    expect(formatHeight('3,5', '', 'm')).toBe('3.5')
    expect(formatHeight('3.50', '', 'm')).toBe('3.50')
    expect(formatHeight('', '', 'm')).toBeUndefined()
    expect(formatHeight('abc', '', 'm')).toBe('abc')
  })

  test(`feet and inches are written as 5'6" and each part only when it has a value`, () => {
    expect(formatHeight('11', '6', 'ft')).toBe(`11'6"`)
    expect(formatHeight('11', '', 'ft')).toBe(`11'`)
    expect(formatHeight('', '6', 'ft')).toBe(`6"`)
    expect(formatHeight('', '', 'ft')).toBeUndefined()
    expect(formatHeight('11,5', '0', 'ft')).toBe(`11.5'0"`)
  })

  test('a part that is not a number is written as the primary text alone', () => {
    expect(formatHeight('abc', '6', 'ft')).toBe('abc')
    expect(formatHeight('', 'abc', 'ft')).toBeUndefined()
  })
})
