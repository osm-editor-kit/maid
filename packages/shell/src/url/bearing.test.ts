import { describe, expect, test } from 'bun:test'
import { normaliseBearing, roundDegrees, TURN_STEP, turnForKey } from './bearing.ts'

describe('normaliseBearing: from -180 up to 180', () => {
  test('a bearing in range is kept, and the others wrap around', () => {
    expect(normaliseBearing(0)).toBe(0)
    expect(normaliseBearing(37.5)).toBe(37.5)
    expect(normaliseBearing(-160)).toBe(-160)
    expect(normaliseBearing(370)).toBe(10)
    expect(normaliseBearing(725)).toBe(5)
    expect(normaliseBearing(-190)).toBe(170)
    expect(normaliseBearing(180)).toBe(-180)
    expect(normaliseBearing(-180)).toBe(-180)
  })
})

describe('turnForKey: Shift with the arrows turns 2.5 degrees, as Rapid', () => {
  test('the step is 2.5 degrees, and Shift+Right turns clockwise (a lower bearing)', () => {
    expect(TURN_STEP).toBe(2.5)
    expect(turnForKey('ArrowRight')).toBe(-2.5)
    expect(turnForKey('ArrowLeft')).toBe(2.5)
  })
})

describe('roundDegrees: hundredths, for the URL', () => {
  test('rounds to two decimals', () => {
    expect(roundDegrees(37.5)).toBe(37.5)
    expect(roundDegrees(12.3456)).toBe(12.35)
    expect(roundDegrees(-160.004)).toBe(-160)
    expect(roundDegrees(0.001) === 0).toBe(true)
  })
})
