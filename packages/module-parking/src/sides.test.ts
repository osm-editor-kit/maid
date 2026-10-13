import { describe, expect, test } from 'bun:test'
import { readSide, sideKey, SIDES, writeSide } from './sides.ts'

describe('sideKey', () => {
  test('names the per-side keys', () => {
    expect(SIDES).toEqual(['left', 'right', 'both'])
    expect(sideKey('left', 'orientation')).toBe('parking:left:orientation')
    expect(sideKey('both', 'fee:conditional')).toBe('parking:both:fee:conditional')
    expect(sideKey('right')).toBe('parking:right')
    expect(sideKey('right', '')).toBe('parking:right')
  })
})

describe('readSide', () => {
  test('a side reads its own key, else the both key', () => {
    const tags = { 'parking:both:orientation': 'parallel', 'parking:left:orientation': 'diagonal' }
    expect(readSide(tags, 'left', 'orientation')).toBe('diagonal')
    expect(readSide(tags, 'right', 'orientation')).toBe('parallel')
    expect(readSide(tags, 'both', 'orientation')).toBe('parallel')
  })

  test('both reads only the both key; empty values and missing keys are undefined', () => {
    expect(readSide({ 'parking:left': 'lane' }, 'both')).toBeUndefined()
    expect(readSide({ 'parking:both': '', 'parking:left': '' }, 'left')).toBeUndefined()
    expect(readSide({ 'parking:both': 'no' }, 'right')).toBe('no')
  })
})

describe('writeSide', () => {
  test('writes the key of a side when both is not set', () => {
    expect(writeSide({}, 'left', 'orientation', 'parallel')).toEqual([
      { key: 'parking:left:orientation', value: 'parallel' },
    ])
  })

  test('writing one side when both is set splits into left and right', () => {
    const tags = { 'parking:both:orientation': 'parallel' }
    expect(writeSide(tags, 'left', 'orientation', 'diagonal')).toEqual([
      { key: 'parking:both:orientation', value: undefined },
      { key: 'parking:right:orientation', value: 'parallel' },
      { key: 'parking:left:orientation', value: 'diagonal' },
    ])
  })

  test('a split keeps a value the other side already has', () => {
    const tags = { 'parking:both': 'lane', 'parking:right': 'no' }
    expect(writeSide(tags, 'left', undefined, 'street_side')).toEqual([
      { key: 'parking:both', value: undefined },
      { key: 'parking:left', value: 'street_side' },
    ])
  })

  test('clearing one side when both is set leaves the other side the value', () => {
    expect(writeSide({ 'parking:both:fee': 'yes' }, 'right', 'fee', undefined)).toEqual([
      { key: 'parking:both:fee', value: undefined },
      { key: 'parking:left:fee', value: 'yes' },
    ])
  })

  test('writing both sets the both key and removes the side keys', () => {
    const tags = { 'parking:left:fee': 'no', 'parking:right:fee': 'yes' }
    expect(writeSide(tags, 'both', 'fee', 'yes')).toEqual([
      { key: 'parking:both:fee', value: 'yes' },
      { key: 'parking:left:fee', value: undefined },
      { key: 'parking:right:fee', value: undefined },
    ])
  })

  test('returns no edit when nothing changes', () => {
    expect(writeSide({ 'parking:left': 'lane' }, 'left', undefined, 'lane')).toEqual([])
    expect(writeSide({}, 'both', 'fee', undefined)).toEqual([])
  })
})
