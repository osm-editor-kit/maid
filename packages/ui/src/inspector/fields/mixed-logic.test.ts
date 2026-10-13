import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  handlesSeveral,
  keyDisplay,
  MULTIPLE_VALUES,
  mixedKeysOf,
  mixedOf,
  mixedSignature,
  mixedTitle,
} from './mixed-logic.ts'
import type { CombinedTags } from './shared.ts'

function field(overrides: Partial<Field>): Field {
  return { id: 'f', type: 'text', label: 'Field', options: [], universal: false, ...overrides }
}

const combined: CombinedTags = {
  name: { kind: 'mixed', values: ['A', 'B', 'C'], missing: false },
  oneway: { kind: 'mixed', values: ['yes', 'no'], missing: true },
  lanes: { kind: 'one', value: '2' },
  surface: { kind: 'mixed', values: ['asphalt'], missing: true },
}

describe('mixedOf', () => {
  it('a mixed key gives its entry', () => {
    expect(mixedOf(combined, 'name')).toEqual({
      kind: 'mixed',
      values: ['A', 'B', 'C'],
      missing: false,
    })
  })

  it('one value on all features is not mixed', () => {
    expect(mixedOf(combined, 'lanes')).toBeUndefined()
  })

  it('a key no feature has is not mixed', () => {
    expect(mixedOf(combined, 'maxspeed')).toBeUndefined()
  })

  it('a mixed key with missing is mixed, even with one value', () => {
    expect(mixedOf(combined, 'surface')).toEqual({
      kind: 'mixed',
      values: ['asphalt'],
      missing: true,
    })
  })

  it('no combined tags or no key: nothing is mixed', () => {
    expect(mixedOf(undefined, 'name')).toBeUndefined()
    expect(mixedOf(combined, undefined)).toBeUndefined()
  })

  it('an inherited property name is not a key', () => {
    expect(mixedOf(combined, 'constructor')).toBeUndefined()
  })
})

describe('mixedKeysOf', () => {
  it('a field with one key: its key when it is mixed, else nothing', () => {
    expect(mixedKeysOf(field({ key: 'name' }), combined)).toEqual(['name'])
    expect(mixedKeysOf(field({ key: 'lanes' }), combined)).toEqual([])
    expect(mixedKeysOf(field({ key: 'maxspeed' }), combined)).toEqual([])
  })

  it("a field with several keys: the mixed ones, in the field's order", () => {
    const access = field({ type: 'access', keys: ['access', 'foot', 'bicycle'] })
    const access2: CombinedTags = {
      foot: { kind: 'mixed', values: ['yes', 'no'], missing: false },
      bicycle: { kind: 'one', value: 'no' },
      access: { kind: 'mixed', values: ['yes'], missing: true },
    }
    expect(mixedKeysOf(access, access2)).toEqual(['access', 'foot'])
  })

  it('a field owns the translations of its key: a localized name lists the mixed ones', () => {
    const localized = field({ type: 'localized', key: 'name' })
    const names: CombinedTags = {
      'name:de': { kind: 'mixed', values: ['A', 'B'], missing: true },
      'name:en': { kind: 'one', value: 'C' },
      'name:etymology': { kind: 'mixed', values: ['X', 'Y'], missing: false },
    }
    expect(mixedKeysOf(localized, names)).toEqual(['name:de'])
  })

  it('a prefix key (multiCombo) owns the keys with that prefix', () => {
    const multi = field({ type: 'multiCombo', key: 'payment:' })
    const payments: CombinedTags = {
      'payment:cash': { kind: 'mixed', values: ['yes', 'no'], missing: false },
      'payment:visa': { kind: 'one', value: 'yes' },
    }
    expect(mixedKeysOf(multi, payments)).toEqual(['payment:cash'])
  })

  it('no combined tags: nothing', () => {
    expect(mixedKeysOf(field({ key: 'name' }), undefined)).toEqual([])
  })
})

describe('mixedTitle', () => {
  it('lists the values, one per line', () => {
    expect(mixedTitle({ kind: 'mixed', values: ['A', 'B', 'C'], missing: false })).toBe('A\nB\nC')
  })

  it('adds "not set" last when some feature lacks the key', () => {
    expect(mixedTitle({ kind: 'mixed', values: ['asphalt'], missing: true })).toBe(
      'asphalt\nnot set',
    )
  })
})

describe('keyDisplay', () => {
  it('one value on all features: the value and the given placeholder', () => {
    const shown = keyDisplay('lanes', { lanes: '2' }, combined, 'Lanes')
    expect(shown).toEqual({ value: '2', placeholder: 'Lanes', title: undefined, mixed: undefined })
  })

  it('an absent key: an empty value and the given placeholder', () => {
    const shown = keyDisplay('maxspeed', {}, combined, '50')
    expect(shown).toEqual({ value: '', placeholder: '50', title: undefined, mixed: undefined })
  })

  it('a mixed key: empty, "Multiple values", the values as the title', () => {
    const shown = keyDisplay('name', {}, combined, 'Name')
    expect(shown.value).toBe('')
    expect(shown.placeholder).toBe(MULTIPLE_VALUES)
    expect(shown.title).toBe('A\nB\nC')
    expect(shown.mixed).toEqual({ kind: 'mixed', values: ['A', 'B', 'C'], missing: false })
  })

  it('a mixed key ignores a tag of the same key (the tags are the shared ones)', () => {
    const shown = keyDisplay('oneway', { oneway: 'yes' }, combined, undefined)
    expect(shown.value).toBe('')
    expect(shown.title).toBe('yes\nno\nnot set')
  })

  it('no key: nothing to show', () => {
    expect(keyDisplay(undefined, {}, combined, 'x')).toEqual({
      value: '',
      placeholder: 'x',
      title: undefined,
      mixed: undefined,
    })
  })
})

describe('handlesSeveral', () => {
  it('the types with their own several-values control', () => {
    for (const type of ['text', 'number', 'combo', 'semiCombo', 'check', 'radio', 'access']) {
      expect(handlesSeveral(type)).toBe(true)
    }
  })

  it('other types get the generic control', () => {
    for (const type of ['wikipedia', 'lanes', 'wikidata', 'integer', 'restrictions']) {
      expect(handlesSeveral(type)).toBe(false)
    }
  })
})

describe('mixedSignature', () => {
  it('changes when the mixed state of the field changes, and not otherwise', () => {
    const name = field({ key: 'name' })
    const before = mixedSignature(name, combined)
    expect(
      mixedSignature(name, {
        ...combined,
        lanes: { kind: 'mixed', values: ['1', '2'], missing: false },
      }),
    ).toBe(before)
    expect(mixedSignature(name, { ...combined, name: { kind: 'one', value: 'A' } })).not.toBe(
      before,
    )
    expect(
      mixedSignature(name, {
        ...combined,
        name: { kind: 'mixed', values: ['A', 'D'], missing: false },
      }),
    ).not.toBe(before)
  })
})
