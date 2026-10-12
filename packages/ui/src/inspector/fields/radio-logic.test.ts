import { describe, expect, test } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import {
  accessOptions,
  impliedAccess,
  radioChoices,
  radioChosen,
  radioOptions,
  radioPick,
  radioWrite,
  structureLayer,
  structureTypeEdits,
} from './radio-logic.ts'

function field(overrides: Partial<Field>): Field {
  return {
    id: 'test',
    type: 'radio',
    label: 'Test',
    options: [],
    universal: false,
    ...overrides,
  }
}

const surface = field({
  id: 'surface',
  key: 'surface',
  options: [
    { value: 'paved', label: 'Paved' },
    { value: 'unpaved', label: 'Unpaved' },
    { value: '', label: 'Unknown' },
  ],
})

const structure = field({
  id: 'structure',
  type: 'structureRadio',
  keys: ['bridge', 'tunnel', 'embankment', 'cutting', 'ford'],
  options: [{ value: 'bridge', label: 'Bridge' }],
})

const pair = field({ id: 'pair', type: 'structureRadio', keys: ['tunnel', 'bridge'] })

const apply = (tags: Tags, edits: { key: string; value: string | undefined }[]): Tags => {
  const next: Tags = { ...tags }
  for (const edit of edits) {
    if (edit.value === undefined) delete next[edit.key]
    else next[edit.key] = edit.value
  }
  return next
}

describe('radioOptions and radioChoices (one key)', () => {
  test('lists the options without the unset one', () => {
    expect(radioOptions(surface).map((o) => o.value)).toEqual(['paved', 'unpaved'])
  })

  test('no value: no chosen button', () => {
    expect(radioChoices(surface, {})).toEqual([
      { value: 'paved', label: 'Paved', raw: false },
      { value: 'unpaved', label: 'Unpaved', raw: false },
    ])
    expect(radioChosen(surface, {})).toBeUndefined()
  })

  test('a value that is no option is an extra raw choice', () => {
    expect(radioChoices(surface, { surface: 'sett' })).toEqual([
      { value: 'paved', label: 'Paved', raw: false },
      { value: 'unpaved', label: 'Unpaved', raw: false },
      { value: 'sett', label: 'sett', raw: true },
    ])
    expect(radioChosen(surface, { surface: 'sett' })).toBe('sett')
  })

  test('an option value is chosen and not repeated', () => {
    expect(radioChoices(surface, { surface: 'paved' }).filter((c) => c.raw)).toEqual([])
    expect(radioChosen(surface, { surface: 'paved' })).toBe('paved')
  })
})

describe('radioWrite over one key', () => {
  test('choosing writes key=value', () => {
    expect(radioWrite(surface, {}, 'paved')).toEqual([{ key: 'surface', value: 'paved' }])
  })

  test('choosing another option replaces the value', () => {
    expect(radioWrite(surface, { surface: 'paved' }, 'unpaved')).toEqual([
      { key: 'surface', value: 'unpaved' },
    ])
  })

  test('clearing removes the key; nothing to clear gives no edit', () => {
    expect(radioWrite(surface, { surface: 'paved' }, undefined)).toEqual([
      { key: 'surface', value: undefined },
    ])
    expect(radioWrite(surface, {}, undefined)).toEqual([])
  })

  test('choosing the chosen one again clears it', () => {
    expect(radioPick(surface, { surface: 'paved' }, 'paved')).toEqual([
      { key: 'surface', value: undefined },
    ])
    expect(radioPick(surface, { surface: 'paved' }, 'unpaved')).toEqual([
      { key: 'surface', value: 'unpaved' },
    ])
  })

  test('choosing the raw extra again clears it too', () => {
    expect(radioPick(surface, { surface: 'sett' }, 'sett')).toEqual([
      { key: 'surface', value: undefined },
    ])
  })

  test('a plain radio writes no layer', () => {
    expect(radioWrite(surface, {}, 'paved')).toHaveLength(1)
  })
})

describe('radioWrite over keys (structureRadio)', () => {
  test('no key set: no chosen structure', () => {
    expect(radioChosen(structure, {})).toBeUndefined()
    expect(radioChosen(structure, { bridge: 'no' })).toBeUndefined()
  })

  test('several keys set: none is chosen', () => {
    expect(radioChosen(structure, { bridge: 'yes', tunnel: 'yes' })).toBeUndefined()
  })

  test('a key set to a value other than no is chosen', () => {
    expect(radioChosen(structure, { bridge: 'viaduct' })).toBe('bridge')
    expect(radioChoices(structure, { bridge: 'viaduct' })).toEqual([
      { value: 'bridge', label: 'Bridge', raw: false },
      { value: 'tunnel', label: 'tunnel', raw: false },
      { value: 'embankment', label: 'embankment', raw: false },
      { value: 'cutting', label: 'cutting', raw: false },
      { value: 'ford', label: 'ford', raw: false },
    ])
  })

  test('a radio over keys has no raw extra', () => {
    expect(radioChoices(structure, { waterway: 'x', ford: 'yes' }).some((c) => c.raw)).toBe(false)
  })

  test('choosing a ford writes ford=yes, no layer', () => {
    expect(radioWrite(structure, {}, 'ford')).toEqual([{ key: 'ford', value: 'yes' }])
  })

  test('choosing a structure removes the others', () => {
    const tags = { embankment: 'yes', bridge: 'yes' }
    expect(radioWrite(structure, tags, 'ford')).toEqual([
      { key: 'bridge', value: undefined },
      { key: 'embankment', value: undefined },
      { key: 'ford', value: 'yes' },
    ])
  })

  test('bridge gets layer 1 when there is none', () => {
    expect(radioWrite(structure, {}, 'bridge')).toEqual([
      { key: 'bridge', value: 'yes' },
      { key: 'layer', value: '1' },
    ])
  })

  test('bridge keeps a layer above 0 and gets 1 for a layer of 0 or below', () => {
    expect(radioWrite(structure, { layer: '2' }, 'bridge')).toEqual([
      { key: 'bridge', value: 'yes' },
    ])
    expect(radioWrite(structure, { layer: '0' }, 'bridge')).toEqual([
      { key: 'bridge', value: 'yes' },
      { key: 'layer', value: '1' },
    ])
  })

  test('tunnel gets layer -1, and keeps a layer below 0', () => {
    expect(radioWrite(pair, {}, 'tunnel')).toEqual([
      { key: 'tunnel', value: 'yes' },
      { key: 'layer', value: '-1' },
    ])
    expect(radioWrite(pair, { layer: '-2' }, 'tunnel')).toEqual([{ key: 'tunnel', value: 'yes' }])
  })

  test('a tunnel of type building_passage gets no layer', () => {
    expect(structureLayer('tunnel', 'building_passage', undefined)).toBeUndefined()
    expect(structureLayer('tunnel', 'culvert', undefined)).toBe('-1')
  })

  test('clearing a bridge removes the default layer it set', () => {
    expect(radioWrite(structure, { bridge: 'yes', layer: '1' }, undefined)).toEqual([
      { key: 'bridge', value: undefined },
      { key: 'layer', value: undefined },
    ])
  })

  test('clearing a bridge keeps a layer the user set', () => {
    expect(radioWrite(structure, { bridge: 'yes', layer: '2' }, undefined)).toEqual([
      { key: 'bridge', value: undefined },
    ])
  })

  test('changing from a bridge to a ford removes the default layer', () => {
    const tags = { bridge: 'yes', layer: '1' }
    expect(apply(tags, radioPick(structure, tags, 'ford'))).toEqual({ ford: 'yes' })
  })

  test('changing from a tunnel to a bridge sets layer 1', () => {
    const tags = { tunnel: 'culvert', layer: '-1' }
    expect(apply(tags, radioPick(structure, tags, 'bridge'))).toEqual({
      bridge: 'yes',
      layer: '1',
    })
  })

  test('picking the chosen structure clears it and its default layer', () => {
    const tags = { tunnel: 'yes', layer: '-1' }
    expect(apply(tags, radioPick(structure, tags, 'tunnel'))).toEqual({})
  })

  test('a bridge keeps its type and gets its layer', () => {
    expect(radioWrite(structure, { bridge: 'viaduct' }, 'bridge')).toEqual([
      { key: 'layer', value: '1' },
    ])
  })
})

describe('structureTypeEdits', () => {
  test('a type is written to the structure key', () => {
    expect(structureTypeEdits('bridge', { bridge: 'yes', layer: '1' }, 'viaduct')).toEqual([
      { key: 'bridge', value: 'viaduct' },
    ])
  })

  test('clearing the type gives yes', () => {
    expect(structureTypeEdits('bridge', { bridge: 'viaduct', layer: '1' }, '')).toEqual([
      { key: 'bridge', value: 'yes' },
    ])
  })

  test('a tunnel of type building_passage loses its default layer', () => {
    expect(
      structureTypeEdits('tunnel', { tunnel: 'culvert', layer: '-1' }, 'building_passage'),
    ).toEqual([
      { key: 'tunnel', value: 'building_passage' },
      { key: 'layer', value: undefined },
    ])
  })

  test('a tunnel leaving building_passage gets layer -1 when it has none', () => {
    expect(structureTypeEdits('tunnel', { tunnel: 'building_passage' }, 'culvert')).toEqual([
      { key: 'tunnel', value: 'culvert' },
      { key: 'layer', value: '-1' },
    ])
  })
})

describe('impliedAccess', () => {
  test('the key own value comes first', () => {
    expect(impliedAccess({ foot: 'private', highway: 'footway' }, 'foot')).toBe('private')
  })

  test('footway: motor_vehicle is no, foot is designated', () => {
    expect(impliedAccess({ highway: 'footway' }, 'motor_vehicle')).toBe('no')
    expect(impliedAccess({ highway: 'footway' }, 'foot')).toBe('designated')
  })

  test('motorroad=yes gives no for foot, bicycle and horse only', () => {
    const tags = { highway: 'primary', motorroad: 'yes' }
    expect(impliedAccess(tags, 'foot')).toBe('no')
    expect(impliedAccess(tags, 'bicycle')).toBe('no')
    expect(impliedAccess(tags, 'horse')).toBe('no')
    expect(impliedAccess(tags, 'motor_vehicle')).toBe('yes')
  })

  test('vehicle is inherited by bicycle and motor_vehicle', () => {
    expect(impliedAccess({ vehicle: 'destination' }, 'bicycle')).toBe('destination')
    expect(impliedAccess({ vehicle: 'destination' }, 'motor_vehicle')).toBe('destination')
    expect(impliedAccess({ vehicle: 'destination' }, 'foot')).toBeUndefined()
  })

  test('access is inherited by every row', () => {
    expect(impliedAccess({ access: 'private', highway: 'footway' }, 'bicycle')).toBe('private')
  })

  test('access=private on a bicycle row shows private', () => {
    expect(impliedAccess({ access: 'private' }, 'bicycle')).toBe('private')
  })

  test('the highway value gives the default before the barrier', () => {
    expect(impliedAccess({ highway: 'cycleway' }, 'bicycle')).toBe('designated')
    expect(impliedAccess({ highway: 'construction' }, 'access')).toBe('no')
    expect(impliedAccess({ barrier: 'bollard' }, 'foot')).toBe('yes')
  })

  test('access is yes by default unless there is a barrier', () => {
    expect(impliedAccess({ highway: 'unknown_thing' }, 'access')).toBe('yes')
    expect(impliedAccess({ barrier: 'gate' }, 'access')).toBeUndefined()
    expect(impliedAccess({}, 'access')).toBe('yes')
  })

  test('a row with no implied value gives undefined', () => {
    expect(impliedAccess({}, 'horse')).toBeUndefined()
  })
})

describe('accessOptions', () => {
  test('access drops yes and designated', () => {
    const values = accessOptions('access').map((option) => option.value)
    expect(values).toEqual([
      'no',
      'permissive',
      'destination',
      'customers',
      'private',
      'permit',
      'unknown',
    ])
  })

  test('the other rows have the nine values', () => {
    expect(accessOptions('foot')).toHaveLength(9)
    expect(accessOptions('foot')[0]).toEqual({ value: 'yes', label: 'Yes' })
  })

  test('bicycle adds dismount', () => {
    expect(
      accessOptions('bicycle')
        .map((option) => option.value)
        .at(-1),
    ).toBe('dismount')
    expect(accessOptions('bicycle')).toHaveLength(10)
  })
})
