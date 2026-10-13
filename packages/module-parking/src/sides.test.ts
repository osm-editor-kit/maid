import { describe, expect, test } from 'bun:test'
import {
  applyEdits,
  parseSideKey,
  readSide,
  sideKey,
  SIDES,
  sideSuffixes,
  writeSide,
} from './sides.ts'

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
  })

  test('both is the value the two sides share, however it is spelled', () => {
    expect(readSide({ 'parking:both': 'no' }, 'both')).toBe('no')
    expect(readSide({ 'parking:left': 'lane', 'parking:right': 'lane' }, 'both')).toBe('lane')
    expect(readSide({ 'parking:left': 'lane' }, 'both')).toBeUndefined()
    expect(readSide({ 'parking:both': 'lane', 'parking:left': 'no' }, 'both')).toBeUndefined()
  })

  test('empty values and missing keys are undefined', () => {
    expect(readSide({ 'parking:both': '', 'parking:left': '' }, 'left')).toBeUndefined()
    expect(readSide({ 'parking:both': 'no' }, 'right')).toBe('no')
  })
})

describe('parseSideKey and sideSuffixes', () => {
  test('a side key gives its side and suffix; other keys give undefined', () => {
    expect(parseSideKey('parking:left')).toEqual({ side: 'left', suffix: undefined })
    expect(parseSideKey('parking:both:fee:conditional')).toEqual({
      side: 'both',
      suffix: 'fee:conditional',
    })
    expect(parseSideKey('parking:lane:left')).toBeUndefined()
    expect(parseSideKey('parking')).toBeUndefined()
  })

  test('the suffixes over all three spellings, without empty values', () => {
    const tags = { 'parking:both': 'lane', 'parking:left:fee': 'yes', 'parking:right:zone': '' }
    expect([...sideSuffixes(tags)]).toEqual([undefined, 'fee'])
  })
})

// iD's directional_combo.js `change`: the other side keeps its value; equal sides are written as `both`
describe('writeSide', () => {
  test('writes the key of a side when the other side has no value', () => {
    expect(writeSide({}, 'left', 'orientation', 'parallel')).toEqual([
      { key: 'parking:left:orientation', value: 'parallel' },
    ])
  })

  test('writing one side when both is set splits into left and right', () => {
    const tags = { 'parking:both:orientation': 'parallel' }
    expect(writeSide(tags, 'left', 'orientation', 'diagonal')).toEqual([
      { key: 'parking:left:orientation', value: 'diagonal' },
      { key: 'parking:right:orientation', value: 'parallel' },
      { key: 'parking:both:orientation', value: undefined },
    ])
  })

  test('a split keeps a value the other side already has', () => {
    const tags = { 'parking:both': 'lane', 'parking:right': 'no' }
    expect(writeSide(tags, 'left', undefined, 'street_side')).toEqual([
      { key: 'parking:left', value: 'street_side' },
      { key: 'parking:both', value: undefined },
    ])
  })

  test('clearing one side when both is set leaves the other side the value', () => {
    expect(writeSide({ 'parking:both:fee': 'yes' }, 'right', 'fee', undefined)).toEqual([
      { key: 'parking:left:fee', value: 'yes' },
      { key: 'parking:both:fee', value: undefined },
    ])
  })

  test('a side that gets the value of the other side collapses to both', () => {
    expect(writeSide({ 'parking:right': 'lane' }, 'left', undefined, 'lane')).toEqual([
      { key: 'parking:right', value: undefined },
      { key: 'parking:both', value: 'lane' },
    ])
    // also out of a both key with an own key on one side
    expect(
      writeSide({ 'parking:both:fee': 'yes', 'parking:left:fee': 'no' }, 'left', 'fee', 'yes'),
    ).toEqual([{ key: 'parking:left:fee', value: undefined }])
  })

  test('clearing the last side removes every spelling', () => {
    expect(writeSide({ 'parking:left': 'lane' }, 'left', undefined, undefined)).toEqual([
      { key: 'parking:left', value: undefined },
    ])
  })

  test('writing both sets the both key and removes the side keys', () => {
    const tags = { 'parking:left:fee': 'no', 'parking:right:fee': 'yes' }
    expect(writeSide(tags, 'both', 'fee', 'yes')).toEqual([
      { key: 'parking:left:fee', value: undefined },
      { key: 'parking:right:fee', value: undefined },
      { key: 'parking:both:fee', value: 'yes' },
    ])
    expect(writeSide({ 'parking:left:fee': 'no' }, 'both', 'fee', undefined)).toEqual([
      { key: 'parking:left:fee', value: undefined },
    ])
  })

  test('returns no edit when nothing changes', () => {
    expect(writeSide({ 'parking:left': 'lane' }, 'left', undefined, 'lane')).toEqual([])
    expect(writeSide({}, 'both', 'fee', undefined)).toEqual([])
  })
})

describe('applyEdits', () => {
  test('sets and removes keys', () => {
    expect(
      applyEdits({ a: '1', b: '2' }, [
        { key: 'a', value: undefined },
        { key: 'c', value: '3' },
      ]),
    ).toEqual({ b: '2', c: '3' })
  })
})
