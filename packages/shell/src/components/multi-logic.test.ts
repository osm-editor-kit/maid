import { describe, expect, it } from 'bun:test'
import { combinedTags } from '@osm-editor-kit/maid-model'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  changeFromTags,
  distinctPresets,
  listedIds,
  readOnlyRefusal,
  sharedFields,
  sharedTags,
  typeLabel,
  withoutId,
} from './multi-logic.ts'

const field = (id: string) => ({ id, type: 'text' }) as Field

describe('listedIds', () => {
  it('lists all when under the limit', () => {
    expect(listedIds(['w1', 'w2'], 100)).toEqual({ shown: ['w1', 'w2'], more: 0 })
  })
  it('caps the list and counts the rest', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `w${i}`)
    const { shown, more } = listedIds(ids)
    expect(shown.length).toBe(100)
    expect(shown[0]).toBe('w0')
    expect(more).toBe(150)
  })
})

describe('withoutId', () => {
  it('takes one id out and keeps the order', () => {
    expect(withoutId(['w1', 'w2', 'w3'], 'w2')).toEqual(['w1', 'w3'])
  })
  it('leaves the list as it is when the id is not in it', () => {
    expect(withoutId(['w1'], 'w9')).toEqual(['w1'])
  })
})

describe('sharedTags', () => {
  it('keeps the keys that have one value and drops mixed keys', () => {
    const combined = combinedTags([
      { building: 'yes', name: 'A' },
      { building: 'yes', name: 'B' },
    ])
    expect(sharedTags(combined)).toEqual({ building: 'yes' })
  })
})

describe('changeFromTags', () => {
  const before = { building: 'yes', height: '10' }

  it('sets a changed or new key, and removes a key the sheet dropped', () => {
    expect(changeFromTags(before, { building: 'house', height: '10' })).toEqual({
      set: { building: 'house' },
      remove: [],
    })
    expect(changeFromTags(before, { building: 'yes' })).toEqual({ set: {}, remove: ['height'] })
  })

  it('treats a blank value as a removal of a shared key', () => {
    expect(changeFromTags(before, { building: '', height: '10' })).toEqual({
      set: {},
      remove: ['building'],
    })
  })

  it('sets a key the features do not share, and ignores an unchanged state', () => {
    expect(changeFromTags(before, { ...before, name: 'New' })).toEqual({
      set: { name: 'New' },
      remove: [],
    })
    expect(changeFromTags(before, { ...before })).toEqual({ set: {}, remove: [] })
  })
})

describe('distinctPresets', () => {
  it('counts presets, most features first, ties in first-seen order', () => {
    const a = { id: 'a', name: 'A' }
    const b = { id: 'b', name: 'B' }
    const result = distinctPresets([b, a, undefined, b, a, b])
    expect(result.map((entry) => [entry.preset.id, entry.count])).toEqual([
      ['b', 3],
      ['a', 2],
    ])
  })
})

describe('typeLabel', () => {
  const house = { preset: { name: 'House' } }
  it('names the one shared type, "Multiple types" when they differ', () => {
    expect(typeLabel([house])).toBe('House')
    expect(typeLabel([house, { preset: { name: 'Shop' } }])).toBe('Multiple types')
    expect(typeLabel([])).toBe('No type')
  })
})

describe('sharedFields', () => {
  it('keeps the fields every feature has, in the first feature order', () => {
    const result = sharedFields([
      [field('name'), field('height'), field('levels')],
      [field('levels'), field('name')],
    ])
    expect(result.map((f) => f.id)).toEqual(['name', 'levels'])
  })
  it('is empty when one feature has no fields (no preset)', () => {
    expect(sharedFields([[field('name')], []])).toEqual([])
  })
  it('is empty without features', () => {
    expect(sharedFields([])).toEqual([])
  })
})

describe('readOnlyRefusal', () => {
  it('says how many of how many are read-only and that nothing changed', () => {
    expect(readOnlyRefusal(1, 3)).toBe(
      '1 of 3 selected features are read-only. Nothing was changed.',
    )
  })
})

describe('timing for several features', () => {
  // A synthetic selection: most features share a few keys, each has its own name and ref.
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      building: i % 3 === 0 ? 'house' : 'yes',
      'addr:street': 'Main Street',
      name: `Feature ${i}`,
      ref: `R${i % 40}`,
      levels: String(1 + (i % 4)),
    }))

  for (const n of [500, 5000]) {
    it(`combines ${n} features well under a second, and lists them capped`, () => {
      const tags = make(n)
      const start = performance.now()
      const combined = combinedTags(tags)
      const shared = sharedTags(combined)
      const listed = listedIds(tags.map((_, i) => `w${i}`))
      const elapsed = performance.now() - start
      expect(Object.keys(shared)).toEqual(['addr:street'])
      expect(listed.shown.length).toBe(Math.min(n, 100))
      expect(elapsed).toBeLessThan(1000)
    })
  }
})
