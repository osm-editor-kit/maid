import { describe, expect, test } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { fieldKeys, isModified, isPresent, removeEdits, revertEdits } from '../logic.ts'
import {
  ACCESS_KEYS,
  accessKeyLabel,
  accessRowKeys,
  addableAccessKeys,
  isAccessKey,
} from './access-logic.ts'

const DEFAULTS = ['access', 'foot', 'motor_vehicle', 'bicycle', 'horse']

const accessField: Field = {
  id: 'access',
  type: 'access',
  keys: DEFAULTS,
  label: 'Allowed Access',
  options: [],
  universal: false,
}

describe('ACCESS_KEYS', () => {
  test('has no duplicates and holds the default five', () => {
    expect(new Set(ACCESS_KEYS).size).toBe(ACCESS_KEYS.length)
    for (const key of DEFAULTS) expect(isAccessKey(key)).toBe(true)
  })

  test('every key has a label of its own', () => {
    for (const key of ACCESS_KEYS) expect(accessKeyLabel(key)).not.toBe(key)
  })

  test('a key the list does not know shows as it is', () => {
    expect(isAccessKey('highway')).toBe(false)
    expect(accessKeyLabel('boat')).toBe('boat')
  })
})

describe('accessRowKeys', () => {
  test('without other access tags: the field keys, in the wiki order', () => {
    expect(accessRowKeys(DEFAULTS, [])).toEqual([
      'access',
      'foot',
      'horse',
      'bicycle',
      'motor_vehicle',
    ])
  })

  test('a set access key that is not a field key gets a row in its place', () => {
    expect(accessRowKeys(DEFAULTS, ['highway', 'name', 'mofa', 'vehicle', 'bus'])).toEqual([
      'access',
      'foot',
      'horse',
      'vehicle',
      'bicycle',
      'motor_vehicle',
      'mofa',
      'bus',
    ])
  })

  test('a field key the list does not know stays, after the known ones', () => {
    expect(accessRowKeys(['boat', 'access'], ['dog'])).toEqual(['access', 'dog', 'boat'])
  })
})

describe('addableAccessKeys', () => {
  test('every access key that is not a row yet', () => {
    const addable = addableAccessKeys(DEFAULTS)
    expect(addable).toHaveLength(ACCESS_KEYS.length - DEFAULTS.length)
    expect(addable[0]).toBe('dog')
    expect(addable).not.toContain('foot')
  })
})

describe('the access field owns every access key (remove, revert, present)', () => {
  test('fieldKeys adds the set access keys, not others', () => {
    expect(fieldKeys(accessField, { highway: 'service', mofa: 'no', bus: 'designated' })).toEqual([
      ...DEFAULTS,
      'mofa',
      'bus',
    ])
  })

  test('a set mofa makes the field present; removing it removes mofa', () => {
    const tags = { highway: 'service', mofa: 'no' }
    expect(isPresent(accessField, tags)).toBe(true)
    expect(removeEdits(accessField, tags)).toEqual([{ key: 'mofa', value: undefined }])
  })

  test('revert reaches a changed bus tag', () => {
    const base = { highway: 'service', bus: 'yes' }
    const tags = { highway: 'service', bus: 'no', foot: 'no' }
    expect(isModified(accessField, tags, base)).toBe(true)
    expect(revertEdits(accessField, tags, base)).toEqual([
      { key: 'foot', value: undefined },
      { key: 'bus', value: 'yes' },
    ])
  })
})
