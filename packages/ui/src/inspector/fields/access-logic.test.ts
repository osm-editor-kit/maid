import { describe, expect, test } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { fieldKeys, isModified, isPresent, removeEdits, revertEdits } from '../logic.ts'
import DEFAULT_KEYS from './access-default-keys.json'
import {
  ACCESS_KEYS,
  accessDefaultKeys,
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

describe('accessDefaultKeys (access-default-keys.json)', () => {
  test('a residential road, a barrier or no tags: access, foot, bicycle, motor_vehicle; no horse', () => {
    const cases: Tags[] = [{ highway: 'residential' }, { barrier: 'gate' }, {}]
    for (const tags of cases) {
      expect(accessDefaultKeys([tags])).toEqual(['access', 'foot', 'bicycle', 'motor_vehicle'])
    }
  })

  test('a track and a bridleway add horse, a cycleway moped and mofa, a primary road hgv', () => {
    expect(accessDefaultKeys([{ highway: 'track' }])).toContain('horse')
    expect(accessDefaultKeys([{ highway: 'bridleway' }])).toContain('horse')
    expect(accessDefaultKeys([{ highway: 'cycleway' }])).toEqual(
      expect.arrayContaining(['moped', 'mofa']),
    )
    expect(accessDefaultKeys([{ highway: 'primary' }])).toContain('hgv')
  })

  test('several features: every key one of them has by default', () => {
    expect(accessDefaultKeys([{ highway: 'residential' }, { highway: 'track' }])).toContain('horse')
  })

  test('a value that is a name of Object.prototype is no entry', () => {
    expect(accessDefaultKeys([{ highway: 'constructor' }])).toEqual(accessDefaultKeys([{}]))
  })

  test('every key of the table is an access key', () => {
    const lists = [DEFAULT_KEYS.default, ...Object.values(DEFAULT_KEYS.byTag.highway)]
    for (const key of lists.flat()) expect(isAccessKey(key)).toBe(true)
  })
})

describe('accessRowKeys', () => {
  const defaults = accessDefaultKeys([{ highway: 'residential' }])

  test("without other access tags: the default keys in the wiki order; the field's horse is not shown", () => {
    expect(accessRowKeys(defaults, DEFAULTS, [])).toEqual([
      'access',
      'foot',
      'bicycle',
      'motor_vehicle',
    ])
  })

  test('a set access key gets a row in its place, horse too', () => {
    expect(
      accessRowKeys(defaults, DEFAULTS, ['highway', 'name', 'mofa', 'vehicle', 'bus', 'horse']),
    ).toEqual(['access', 'foot', 'horse', 'vehicle', 'bicycle', 'motor_vehicle', 'mofa', 'bus'])
  })

  test('a field key that is no access key stays, after the known ones', () => {
    expect(accessRowKeys(['access'], ['boat', 'access'], ['dog'])).toEqual([
      'access',
      'dog',
      'boat',
    ])
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
