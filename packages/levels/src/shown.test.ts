import { describe, expect, test } from 'bun:test'
import { levelState } from './shown.ts'

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
