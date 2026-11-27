import { describe, expect, test } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { fieldKeys, isModified, isPresent, removeEdits, revertEdits } from '../logic.ts'
import DEFAULT_KEYS from './access-default-keys.json'
import {
  ACCESS_KEYS,
  accessDefaultKeys,
  accessFieldKeys,
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
  test('the keys always, the set access keys too, in the wiki order', () => {
    expect(
      accessRowKeys(['access', 'foot', 'bicycle', 'motor_vehicle'], ['name', 'mofa', 'horse']),
    ).toEqual(['access', 'foot', 'horse', 'bicycle', 'motor_vehicle', 'mofa'])
  })

  test('a key the list does not know stays, after the known ones', () => {
    expect(accessRowKeys(['boat', 'access'], ['dog'])).toEqual(['access', 'dog', 'boat'])
  })
})

describe("accessFieldKeys (the field per feature, the PR's effectiveKeys)", () => {
  test("iD's field on a residential road: the JSON's defaults, no horse", () => {
    expect(accessFieldKeys(DEFAULTS, { tags: { highway: 'residential' } })).toEqual([
      'access',
      'foot',
      'bicycle',
      'motor_vehicle',
    ])
  })

  test('set access keys join, in their place; other keys do not', () => {
    const tags = { highway: 'residential', mofa: 'no', vehicle: 'destination', name: 'A' }
    expect(accessFieldKeys(DEFAULTS, { tags })).toEqual([
      'access',
      'foot',
      'vehicle',
      'bicycle',
      'motor_vehicle',
      'mofa',
    ])
  })

  test('a key set before the edits stays, so revert reaches it', () => {
    expect(
      accessFieldKeys(DEFAULTS, { tags: { highway: 'service' }, baseTags: { bus: 'yes' } }),
    ).toContain('bus')
  })

  test("the preset's own tags and other fields' keys are left out (bus=yes of a bus stop, dog)", () => {
    const tags = { highway: 'bus_stop', public_transport: 'platform', bus: 'yes', dog: 'leashed' }
    const keys = accessFieldKeys(DEFAULTS, {
      tags,
      excluded: new Set(['highway', 'public_transport', 'bus', 'dog']),
    })
    expect(keys).not.toContain('bus')
    expect(keys).not.toContain('dog')
  })

  test("a fork's field with other keys keeps them as its defaults", () => {
    expect(accessFieldKeys(['access', 'motor_vehicle', 'hgv'], { tags: {} })).toEqual([
      'access',
      'motor_vehicle',
      'hgv',
    ])
  })

  test('several features: the defaults of each, and the mixed keys', () => {
    const keys = accessFieldKeys(DEFAULTS, {
      tags: {},
      features: [{ highway: 'residential' }, { highway: 'track', bus: 'no' }],
      combinedKeys: ['highway', 'bus'],
    })
    expect(keys).toContain('horse')
    expect(keys).toContain('bus')
  })
})

describe('addableAccessKeys', () => {
  test('every access key that is not a row yet and not excluded', () => {
    const addable = addableAccessKeys(DEFAULTS, ['dog'])
    expect(addable).toHaveLength(ACCESS_KEYS.length - DEFAULTS.length - 1)
    expect(addable[0]).toBe('ski')
    expect(addable).not.toContain('foot')
  })
})

describe('remove and revert reach the keys of the field as PresetFields gives it', () => {
  const tags = { highway: 'service', mofa: 'no', bus: 'no', foot: 'no' }
  const base = { highway: 'service', bus: 'yes' }
  const field: Field = { ...accessField, keys: accessFieldKeys(DEFAULTS, { tags, baseTags: base }) }

  test('fieldKeys are the field keys', () => {
    expect(fieldKeys(field, tags)).toEqual([
      'access',
      'foot',
      'bicycle',
      'motor_vehicle',
      'mofa',
      'bus',
    ])
  })

  test('remove takes every set access key', () => {
    expect(isPresent(field, tags)).toBe(true)
    expect(removeEdits(field, tags).map((edit) => edit.key)).toEqual(['foot', 'mofa', 'bus'])
  })

  test('revert brings bus back', () => {
    expect(isModified(field, tags, base)).toBe(true)
    expect(revertEdits(field, tags, base)).toEqual([
      { key: 'foot', value: undefined },
      { key: 'mofa', value: undefined },
      { key: 'bus', value: 'yes' },
    ])
  })
})
