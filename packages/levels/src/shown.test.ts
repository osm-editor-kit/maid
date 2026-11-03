import { describe, expect, test } from 'bun:test'
import { levelState, onEveryLevel } from './shown.ts'

describe('levelState', () => {
  test('on level 4, 3 to 5 stay in view, the rest is hidden', () => {
    expect([2, 3, 3.5, 4, 5, 6].map((level) => levelState(level, 4))).toEqual([
      'hidden',
      'shown',
      'shown',
      'edited',
      'shown',
      'hidden',
    ])
  })
  test('mezzanines next to level -1: -2.5 is hidden, -1.3 and -0.5 are shown', () => {
    expect([levelState(-2.5, -1), levelState(-1.3, -1), levelState(-0.5, -1)]).toEqual([
      'hidden',
      'shown',
      'shown',
    ])
  })
})

describe('onEveryLevel', () => {
  test('is true for a building or building part without any level key', () => {
    expect(onEveryLevel({ building: 'yes' })).toBe(true)
    expect(onEveryLevel({ 'building:part': 'yes' })).toBe(true)
  })
  test('is false with a level key, for building=no and for other features', () => {
    expect(onEveryLevel({ building: 'yes', min_level: '0', max_level: '3' })).toBe(false)
    expect(onEveryLevel({ building: 'yes', level: '0' })).toBe(false)
    expect(onEveryLevel({ building: 'no' })).toBe(false)
    expect(onEveryLevel({ indoor: 'room' })).toBe(false)
  })
})
