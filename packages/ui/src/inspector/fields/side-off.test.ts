import { describe, expect, test } from 'bun:test'
import {
  isSideOffValue,
  SIDE_OFF_VALUES,
  sideGroupOfKey,
  sideOffError,
  suffixAllowedWhenOff,
} from './side-off.ts'

describe('side-off: the list the Tags sheet and the inspector share', () => {
  test('the values that turn a side off', () => {
    expect([...SIDE_OFF_VALUES]).toEqual(['separate', 'no', 'none'])
    expect(isSideOffValue('no')).toBe(true)
    expect(isSideOffValue('lane')).toBe(false)
    expect(isSideOffValue(undefined)).toBe(false)
  })

  test('the group of a key', () => {
    expect(sideGroupOfKey('parking:both')).toBe('parking')
    expect(sideGroupOfKey('sidewalk')).toBe('sidewalk')
    expect(sideGroupOfKey('foo:both')).toBeUndefined()
  })

  test('parking:<side>=no keeps reason and restriction (and what is below them), nothing else', () => {
    for (const value of ['no', 'none']) {
      expect(suffixAllowedWhenOff('parking', value, 'reason')).toBe(true)
      expect(suffixAllowedWhenOff('parking', value, 'restriction')).toBe(true)
      expect(suffixAllowedWhenOff('parking', value, 'restriction:conditional')).toBe(true)
      expect(suffixAllowedWhenOff('parking', value, 'orientation')).toBe(false)
      expect(suffixAllowedWhenOff('parking', value, 'restrictions')).toBe(false)
    }
    expect(suffixAllowedWhenOff('parking', 'separate', 'restriction')).toBe(false)
    expect(suffixAllowedWhenOff('cycleway', 'no', 'surface')).toBe(false)
  })

  test('no suffix is the side key itself or its meta key: always valid', () => {
    expect(suffixAllowedWhenOff('sidewalk', 'separate', '')).toBe(true)
  })

  test('the error says remove (no, none) or move (separate), with the side key', () => {
    expect(sideOffError('no', 'parking:left')).toContain('parking:left')
    expect(sideOffError('separate', 'parking:left')).toContain('separate')
  })
})
