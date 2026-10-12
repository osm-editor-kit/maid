import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  addableFields,
  addPicked,
  defaultOnPick,
  pickedFields,
  rowFields,
  searchFields,
} from './add-field-logic.ts'

function field(id: string, label: string, extra: Partial<Field> = {}): Field {
  return { id, type: 'text', key: id, label, options: [], universal: false, ...extra }
}

const wheelchair = field('wheelchair', 'Wheelchair Access')
const internet = field('internet_access', 'Internet Connection')
const level = field('level', 'Level')
const website = field('website', 'Website', { universal: true })
const fields = [website, level, wheelchair, internet]

describe('searchFields', () => {
  it('lists every field in the given order for an empty query', () => {
    expect(searchFields(fields, '')).toEqual(fields)
    expect(searchFields(fields, '   ')).toEqual(fields)
  })

  it('finds a field by its label, ignoring case', () => {
    expect(searchFields(fields, 'WHEEL')).toEqual([wheelchair])
  })

  it('ranks a label that starts with the query before one that contains it', () => {
    const contains = field('ramp', 'Access Wheelchair Ramp')
    const result = searchFields([contains, wheelchair], 'wheelchair')
    expect(result.map((entry) => entry.id)).toEqual(['wheelchair', 'ramp'])
  })

  it('finds a field by its key, and a space in the query matches an underscore', () => {
    expect(searchFields(fields, 'internet access')).toEqual([internet])
    expect(searchFields(fields, 'internet_access')).toEqual([internet])
  })

  it('ranks a key-only match after the label matches', () => {
    // "level" is a label prefix of level; the key of internet_access does not contain "level"
    const keyOnly = field('level_hint', 'Floors')
    const result = searchFields([keyOnly, level], 'level')
    expect(result.map((entry) => entry.id)).toEqual(['level', 'level_hint'])
  })

  it('finds nothing for a query that matches no label and no key', () => {
    expect(searchFields(fields, 'xyz')).toEqual([])
  })

  it('searches the keys of a multi-key field too', () => {
    const multi = field('payment_multi', 'Payment', { key: undefined, keys: ['payment:cash'] })
    expect(searchFields([multi], 'payment:cash')).toEqual([multi])
  })
})

describe('addableFields', () => {
  it('leaves out the fields whose ids are rows already', () => {
    const rows = new Set(['level', 'website'])
    expect(addableFields(fields, rows).map((entry) => entry.id)).toEqual([
      'wheelchair',
      'internet_access',
    ])
  })

  it('keeps everything when there are no rows', () => {
    expect(addableFields(fields, new Set())).toEqual(fields)
  })
})

describe('rowFields', () => {
  it('lists the shown fields first, then the picked ones in the order picked', () => {
    const picked = [internet, wheelchair]
    expect(rowFields([website, level], picked).map((entry) => entry.id)).toEqual([
      'website',
      'level',
      'internet_access',
      'wheelchair',
    ])
  })

  it('lists a picked field once when it now has a value and is shown', () => {
    const shown = [level, wheelchair]
    const result = rowFields(shown, [wheelchair, internet])
    expect(result.map((entry) => entry.id)).toEqual(['level', 'wheelchair', 'internet_access'])
  })

  it('lists nothing for no shown and no picked fields', () => {
    expect(rowFields([], [])).toEqual([])
  })
})

describe('addPicked', () => {
  it('adds an id at the end', () => {
    expect(addPicked(['level'], 'wheelchair')).toEqual(['level', 'wheelchair'])
  })

  it('keeps the place of an id that is picked already', () => {
    expect(addPicked(['level', 'wheelchair'], 'level')).toEqual(['level', 'wheelchair'])
  })

  it('does not change the list it was given', () => {
    const before = ['level']
    addPicked(before, 'wheelchair')
    expect(before).toEqual(['level'])
  })
})

describe('pickedFields', () => {
  it('resolves the ids in the order picked', () => {
    expect(pickedFields(['wheelchair', 'level'], fields)).toEqual([wheelchair, level])
  })

  it('leaves out an id that no field has', () => {
    expect(pickedFields(['gone', 'level'], fields)).toEqual([level])
  })
})

describe('defaultOnPick', () => {
  const withDefault = field('smoking', 'Smoking', { default: 'no' })

  it('writes the default when the key is empty', () => {
    expect(defaultOnPick(withDefault, {})).toBe('no')
    expect(defaultOnPick(withDefault, { smoking: '' })).toBe('no')
  })

  it('writes nothing when the key already has a value', () => {
    expect(defaultOnPick(withDefault, { smoking: 'yes' })).toBeUndefined()
  })

  it('writes nothing for a field without a default', () => {
    expect(defaultOnPick(wheelchair, {})).toBeUndefined()
  })

  it('writes nothing for a field without a key', () => {
    const keyless = field('access', 'Access', { key: undefined, default: 'yes' })
    expect(defaultOnPick(keyless, {})).toBeUndefined()
  })
})
