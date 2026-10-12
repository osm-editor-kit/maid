import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  checkChoices,
  comboHint,
  commitValue,
  isUnsetOption,
  keysWithValue,
  valueSignature,
} from './logic.ts'

const field = (over: Partial<Field>): Field => ({
  id: 'test',
  type: 'text',
  label: 'Test',
  options: [],
  universal: false,
  ...over,
})

describe('commitValue', () => {
  it('trims the draft', () => {
    expect(commitValue('  a b ')).toBe('a b')
  })
  it('turns an empty or blank draft into undefined, which removes the tag', () => {
    expect(commitValue('')).toBeUndefined()
    expect(commitValue('   ')).toBeUndefined()
  })
  it('keeps 0 as a value', () => {
    expect(commitValue('0')).toBe('0')
  })
})

describe('isUnsetOption', () => {
  it('treats undefined and empty values as unset', () => {
    expect(isUnsetOption({ value: undefined })).toBe(true)
    expect(isUnsetOption({ value: '' })).toBe(true)
    expect(isUnsetOption({ value: 'yes' })).toBe(false)
  })
})

describe('checkChoices', () => {
  it('without options: Yes and No, with the dash for not set', () => {
    expect(checkChoices(field({ type: 'check' }), undefined)).toEqual({
      unsetLabel: '–',
      choices: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    })
  })

  it('without options: a current "no" adds nothing', () => {
    expect(checkChoices(field({ type: 'check' }), 'no').choices).toHaveLength(2)
  })

  it('without options: a current value that is not yes or no is added as a choice', () => {
    expect(checkChoices(field({ type: 'check' }), 'maybe').choices).toEqual([
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'maybe', label: 'maybe' },
    ])
  })

  it('with options: the unset option gives the empty entry, the rest are choices', () => {
    const result = checkChoices(
      field({
        type: 'check',
        options: [
          { value: '', label: 'Unknown' },
          { value: 'yes', label: 'Present' },
          { value: 'limited', label: 'Limited' },
        ],
      }),
      'limited',
    )
    expect(result).toEqual({
      unsetLabel: 'Unknown',
      choices: [
        { value: 'yes', label: 'Present' },
        { value: 'limited', label: 'Limited' },
      ],
    })
  })

  it('with options but no unset option: the dash, and only the options', () => {
    expect(checkChoices(field({ options: [{ value: 'yes', label: 'Y' }] }), undefined)).toEqual({
      unsetLabel: '–',
      choices: [{ value: 'yes', label: 'Y' }],
    })
  })
})

describe('comboHint', () => {
  const combo = field({
    type: 'combo',
    options: [
      { value: 'residential', label: 'Residential area' },
      { value: 'farm', label: 'farm' },
    ],
  })

  it('gives the label of the option the value stands for', () => {
    expect(comboHint(combo, 'residential')).toBe('Residential area')
  })
  it('gives nothing when the label only repeats the value', () => {
    expect(comboHint(combo, 'farm')).toBeUndefined()
  })
  it('gives nothing for a free value or for no value', () => {
    expect(comboHint(combo, 'village')).toBeUndefined()
    expect(comboHint(combo, '')).toBeUndefined()
    expect(comboHint(combo, undefined)).toBeUndefined()
  })
})

describe('keysWithValue', () => {
  it('lists the keys that have a non-empty value, in field order', () => {
    const address = field({ keys: ['addr:street', 'addr:city', 'addr:postcode'] })
    expect(
      keysWithValue(address, { 'addr:street': 'Main', 'addr:city': '', 'addr:postcode': '1' }),
    ).toEqual(['addr:street', 'addr:postcode'])
  })
  it('is empty when no key has a value', () => {
    expect(keysWithValue(field({ keys: ['a'] }), {})).toEqual([])
  })
})

describe('valueSignature', () => {
  it('follows the value of a keyed field', () => {
    const named = field({ key: 'name' })
    expect(valueSignature(named, { name: 'a' })).not.toBe(valueSignature(named, { name: 'b' }))
    expect(valueSignature(named, { name: 'a' })).toBe(
      valueSignature(named, { name: 'a', other: 'x' }),
    )
  })
  it('follows all values of a multi-key field, in key order', () => {
    const address = field({ keys: ['a', 'b'] })
    expect(valueSignature(address, { a: '1' })).toBe('["1",""]')
    expect(valueSignature(address, { b: '2' })).toBe('["","2"]')
  })
})
