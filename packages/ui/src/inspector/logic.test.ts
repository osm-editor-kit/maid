import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  checkState,
  checkCycle,
  checkLabel,
  checkValue,
  cleanValue,
  comboHint,
  fieldKeys,
  impliesYes,
  isModified,
  isPresent,
  isUnsetOption,
  keysWithValue,
  lengthNotice,
  nextCheckValue,
  removeEdits,
  revertEdits,
  valueLength,
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

describe('cleanValue', () => {
  it('trims the draft', () => {
    expect(cleanValue('  a b ')).toBe('a b')
  })
  it('turns an empty or blank draft into undefined, which removes the tag', () => {
    expect(cleanValue('')).toBeUndefined()
    expect(cleanValue('   ')).toBeUndefined()
  })
  it('keeps 0 as a value', () => {
    expect(cleanValue('0')).toBe('0')
  })
  it('puts the text in Unicode NFC', () => {
    expect(cleanValue('Café')).toBe('Café')
  })
  it('keeps a value of exactly 255 characters', () => {
    const value = 'a'.repeat(255)
    expect(cleanValue(value)).toBe(value)
  })
  it('cuts a value to 255 characters', () => {
    expect(cleanValue('a'.repeat(300))).toBe('a'.repeat(255))
  })
  it('counts characters, not UTF-16 code units, when it cuts', () => {
    const cut = cleanValue('😀'.repeat(300))
    expect(cut).toBe('😀'.repeat(255))
  })
})

describe('lengthNotice', () => {
  it('is silent until 10 characters before the limit', () => {
    expect(lengthNotice('a'.repeat(244))).toBeUndefined()
    expect(lengthNotice('a'.repeat(245))).toEqual({ length: 245, atLimit: false })
  })
  it('is amber at the limit and over it', () => {
    expect(lengthNotice('a'.repeat(254))).toEqual({ length: 254, atLimit: false })
    expect(lengthNotice('a'.repeat(255))).toEqual({ length: 255, atLimit: true })
    expect(lengthNotice('a'.repeat(300))).toEqual({ length: 300, atLimit: true })
  })
  it('counts characters, as the limit does', () => {
    expect(valueLength('😀'.repeat(3))).toBe(3)
  })
})

describe('isUnsetOption', () => {
  it('treats undefined and empty values as unset', () => {
    expect(isUnsetOption({ value: undefined })).toBe(true)
    expect(isUnsetOption({ value: '' })).toBe(true)
    expect(isUnsetOption({ value: 'yes' })).toBe(false)
  })
})

describe('fieldKeys, presence and modification', () => {
  const name = field({ type: 'localized', key: 'name' })

  it('a keyed field is present when its key has a value', () => {
    const text = field({ key: 'note' })
    expect(isPresent(text, { note: 'x' })).toBe(true)
    expect(isPresent(text, { note: '' })).toBe(false)
    expect(isPresent(text, {})).toBe(false)
  })

  it('a multi-key field is present when any of its keys has a value', () => {
    const address = field({ keys: ['addr:street', 'addr:city'] })
    expect(isPresent(address, { 'addr:city': 'Bern' })).toBe(true)
    expect(isPresent(address, { shop: 'x' })).toBe(false)
  })

  it('a multiCombo key ending in ":" matches every key with that prefix', () => {
    const payment = field({ type: 'multiCombo', key: 'payment:' })
    expect(
      fieldKeys(payment, { 'payment:cash': 'yes', 'payment:visa': 'no', amenity: 'cafe' }),
    ).toEqual(['payment:', 'payment:cash', 'payment:visa'])
    expect(isPresent(payment, { 'payment:cash': 'yes' })).toBe(true)
    expect(isPresent(payment, { 'payment:': '' })).toBe(false)
  })

  it('a localized name matches name:<language>, not name:etymology', () => {
    expect(
      fieldKeys(name, { name: 'a', 'name:de': 'b', 'name:etymology': 'c', 'name:zh-Hant': 'd' }),
    ).toEqual(['name', 'name:de', 'name:zh-Hant'])
    expect(isPresent(name, { 'name:de': 'Bern' })).toBe(true)
  })

  it('a key that only starts like the field key does not belong to it', () => {
    expect(fieldKeys(field({ key: 'name' }), { namesake: 'x' })).toEqual(['name'])
  })

  it('is modified when a key differs from the base, including a key the base has and the tags lack', () => {
    const text = field({ key: 'note' })
    expect(isModified(text, { note: 'new' }, { note: 'old' })).toBe(true)
    expect(isModified(text, {}, { note: 'old' })).toBe(true)
    expect(isModified(text, { note: 'old' }, { note: 'old' })).toBe(false)
    expect(isModified(text, {}, {})).toBe(false)
  })
})

describe('removeEdits and revertEdits', () => {
  const address = field({ keys: ['addr:street', 'addr:city'] })

  it('remove: every key of the field that has a value is set to undefined', () => {
    expect(removeEdits(address, { 'addr:street': 'Main', 'addr:city': '', shop: 'x' })).toEqual([
      { key: 'addr:street', value: undefined },
    ])
  })

  it('revert: every key that differs gets its base value, or undefined when the base lacks it', () => {
    expect(
      revertEdits(
        address,
        { 'addr:street': 'Side', 'addr:city': 'Bern' },
        { 'addr:street': 'Main' },
      ),
    ).toEqual([
      { key: 'addr:street', value: 'Main' },
      { key: 'addr:city', value: undefined },
    ])
  })

  it('revert: nothing to do when the tags equal the base', () => {
    expect(revertEdits(address, { 'addr:street': 'Main' }, { 'addr:street': 'Main' })).toEqual([])
  })

  it('a prefix key removes and reverts the keys it owns', () => {
    const payment = field({ type: 'multiCombo', key: 'payment:' })
    expect(removeEdits(payment, { 'payment:cash': 'yes' })).toEqual([
      { key: 'payment:cash', value: undefined },
    ])
    expect(
      revertEdits(
        payment,
        { 'payment:cash': 'no' },
        { 'payment:cash': 'yes', 'payment:visa': 'yes' },
      ),
    ).toEqual([
      { key: 'payment:cash', value: 'yes' },
      { key: 'payment:visa', value: 'yes' },
    ])
  })
})

describe('checkValue and checkState', () => {
  it('lower-cases the value and maps empty to unset', () => {
    expect(checkValue('check', 'YES')).toBe('yes')
    expect(checkValue('check', '')).toBeUndefined()
    expect(checkValue('check', undefined)).toBeUndefined()
  })

  it('onewayCheck reads 1 and -1 as yes; other checks keep them', () => {
    expect(checkValue('onewayCheck', '1')).toBe('yes')
    expect(checkValue('onewayCheck', '-1')).toBe('yes')
    expect(checkValue('check', '1')).toBe('1')
  })

  it('check: unset is mixed, yes is checked, no is unchecked', () => {
    expect(checkState('check', undefined)).toBe('mixed')
    expect(checkState('check', 'yes')).toBe(true)
    expect(checkState('check', 'no')).toBe(false)
  })

  it('defaultCheck: unset is unchecked, it has no mixed state', () => {
    expect(checkState('defaultCheck', undefined)).toBe(false)
    expect(checkState('defaultCheck', 'yes')).toBe(true)
  })

  it('a raw value that is not yes or no counts as checked', () => {
    expect(checkState('check', 'limited')).toBe(true)
  })

  it('an implied yes is mixed when unset', () => {
    expect(checkState('onewayCheck', undefined, true)).toBe('mixed')
  })
})

describe('impliesYes', () => {
  const oneway = field({ id: 'oneway', type: 'onewayCheck', key: 'oneway' })

  it('oneway is implied yes by a roundabout when it is unset', () => {
    expect(impliesYes(oneway, { junction: 'roundabout' })).toBe(true)
  })
  it('oneway is not implied when a value is set or no tag implies it', () => {
    expect(impliesYes(oneway, { junction: 'roundabout', oneway: 'no' })).toBe(false)
    expect(impliesYes(oneway, { highway: 'residential' })).toBe(false)
  })
  it('oneway_yes is implied yes whenever it is unset', () => {
    expect(impliesYes(field({ id: 'oneway_yes', type: 'onewayCheck', key: 'oneway' }), {})).toBe(
      true,
    )
  })
  it('other fields are never implied', () => {
    expect(impliesYes(field({ id: 'two_sided', type: 'defaultCheck', key: 'two_sided' }), {})).toBe(
      false,
    )
  })
})

describe('checkCycle and nextCheckValue', () => {
  it('check without options: unset, yes, no, then unset again', () => {
    const check = field({ type: 'check', key: 'covered' })
    const cycle = checkCycle(check)
    expect(cycle).toEqual([undefined, 'yes', 'no'])
    expect(nextCheckValue('check', undefined, cycle)).toBe('yes')
    expect(nextCheckValue('check', 'yes', cycle)).toBe('no')
    expect(nextCheckValue('check', 'no', cycle)).toBeUndefined()
  })

  it('defaultCheck: unset and yes only, no is never offered', () => {
    const cycle = checkCycle(field({ type: 'defaultCheck', key: 'two_sided' }))
    expect(cycle).toEqual([undefined, 'yes'])
    expect(nextCheckValue('defaultCheck', undefined, cycle)).toBe('yes')
    expect(nextCheckValue('defaultCheck', 'yes', cycle)).toBeUndefined()
    expect(nextCheckValue('defaultCheck', 'no', cycle)).toBeUndefined()
  })

  it('onewayCheck: 1 is yes, so the next value is no', () => {
    const cycle = checkCycle(field({ type: 'onewayCheck', key: 'oneway' }))
    expect(nextCheckValue('onewayCheck', '1', cycle)).toBe('no')
    expect(nextCheckValue('onewayCheck', '-1', cycle)).toBe('no')
  })

  it('a raw value outside the cycle goes to unset', () => {
    const cycle = checkCycle(field({ type: 'check', key: 'covered' }))
    expect(nextCheckValue('check', 'limited', cycle)).toBeUndefined()
  })

  it('without a cycle the type default applies: defaultCheck never offers no', () => {
    expect(nextCheckValue('defaultCheck', undefined)).toBe('yes')
    expect(nextCheckValue('defaultCheck', 'yes')).toBeUndefined()
    expect(nextCheckValue('check', 'yes')).toBe('no')
  })

  it('with options: the option values are the cycle, and reversible and alternating are skipped', () => {
    const cycle = checkCycle(
      field({
        type: 'onewayCheck',
        key: 'oneway',
        options: [
          { value: '', label: 'Unknown' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'reversible', label: 'Reversible' },
          { value: 'alternating', label: 'Alternating' },
        ],
      }),
    )
    expect(cycle).toEqual([undefined, 'yes', 'no'])
  })

  it('with options: a value that is an option but not yes or no stays in the cycle', () => {
    const cycle = checkCycle(
      field({
        type: 'check',
        key: 'covered',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'limited', label: 'Limited' },
        ],
      }),
    )
    expect(nextCheckValue('check', 'yes', cycle)).toBe('limited')
    expect(nextCheckValue('check', 'limited', cycle)).toBeUndefined()
  })
})

describe('checkLabel', () => {
  const plain = field({ type: 'check', key: 'covered' })

  it('unset: Unknown, or the label of the unset option', () => {
    expect(checkLabel(plain, 'check', undefined)).toBe('Unknown')
    const withUnset = field({
      type: 'check',
      key: 'covered',
      options: [{ value: '', label: 'Not specified' }],
    })
    expect(checkLabel(withUnset, 'check', undefined)).toBe('Not specified')
  })

  it('an implied yes says it is assumed', () => {
    expect(checkLabel(plain, 'onewayCheck', undefined, true)).toBe('Assumed to be Yes')
  })

  it('yes and no without options: Yes and No', () => {
    expect(checkLabel(plain, 'check', 'yes')).toBe('Yes')
    expect(checkLabel(plain, 'check', 'no')).toBe('No')
  })

  it('the option label wins over the default', () => {
    const withOptions = field({
      type: 'check',
      key: 'covered',
      options: [{ value: 'yes', label: 'Present' }],
    })
    expect(checkLabel(withOptions, 'check', 'yes')).toBe('Present')
  })

  it('a raw value that is not an option is shown in quotes', () => {
    expect(checkLabel(plain, 'check', 'maybe')).toBe('"maybe"')
  })

  it('1 and -1 on a oneway read as Yes', () => {
    expect(checkLabel(field({ type: 'onewayCheck', key: 'oneway' }), 'onewayCheck', '-1')).toBe(
      'Yes',
    )
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
