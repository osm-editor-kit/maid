// Adopted from iD test/spec/ui/fields/directional_combo.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD reads and writes the two side inputs through the DOM. Maid's directional-logic.ts holds the
// same read (directionalValues) and write (directionalWrite). Each write is applied to the tags, as
// the entity editor does, and the resulting tags are compared with iD's expected onChange tags.
// iD's empty input value is undefined here.
import { describe, expect, it } from 'bun:test'
import type { Tags } from '@osm-editor-kit/maid-presets'
import type { TagEdit } from '../logic.ts'
import {
  directionalKeys,
  directionalValues,
  directionalWrite,
  sideStates,
} from './directional-logic.ts'

/** Applies edits to tags as the entity editor does: an undefined value removes the key. */
function apply(tags: Tags, edits: TagEdit[]): Tags {
  const next: Tags = { ...tags }
  for (const edit of edits) {
    if (edit.value === undefined) delete next[edit.key]
    else next[edit.key] = edit.value
  }
  return next
}

for (const commonKey of ['cycleway', 'cycleway:both']) {
  describe(`preset uses ${commonKey}`, () => {
    const keys = directionalKeys(commonKey)
    /** if commonKey ends with :both, this is the key without :both. and vice-verca */
    const otherCommonKey = commonKey.endsWith(':both')
      ? commonKey.replace(/:both$/, '')
      : `${commonKey}:both`

    it('populates the left/right fields using :left & :right', () => {
      const values = directionalValues(keys, { 'cycleway:left': 'lane' })
      expect(values.left).toBe('lane')
      expect(values.right).toBeUndefined()
    })

    it('populates the left/right fields using :both', () => {
      const values = directionalValues(keys, { 'cycleway:both': 'lane' })
      expect(values.left).toBe('lane')
      expect(values.right).toBe('lane')
    })

    it('populates the left/right fields using the unprefixed tag', () => {
      const values = directionalValues(keys, { cycleway: 'lane' })
      expect(values.left).toBe('lane')
      expect(values.right).toBe('lane')
    })

    it(`setting left & right to the same value will use the ${commonKey}`, () => {
      const tags = { 'cycleway:left': 'lane', 'cycleway:right': 'shoulder' }
      const values = directionalValues(keys, tags)
      expect(values.left).toBe('lane')
      expect(values.right).toBe('shoulder')

      // left.value = 'shoulder', then change
      const after = apply(tags, directionalWrite(keys, tags, 'left', 'shoulder'))
      expect(after).toEqual({ [commonKey]: 'shoulder' })
    })

    it(`can read the value from ${otherCommonKey}, but writes to ${commonKey}`, () => {
      let tags: Tags = { [otherCommonKey]: 'lane' }
      const values = directionalValues(keys, tags)
      expect(values.left).toBe('lane')
      expect(values.right).toBe('lane')

      // left.value = 'shoulder', then change
      tags = apply(tags, directionalWrite(keys, tags, 'left', 'shoulder'))
      expect(tags).toEqual({
        'cycleway:left': 'shoulder', // left was updated
        'cycleway:right': 'lane',
      })

      // right.value = 'shoulder', then change
      tags = apply(tags, directionalWrite(keys, tags, 'right', 'shoulder'))
      expect(tags).toEqual({
        [commonKey]: 'shoulder', // now left & right have been updated
      })
    })
  })
}

describe('handle multiselection', () => {
  const keys = directionalKeys('cycleway:both')

  it('populates the left/right fields using :left/:right and :both', () => {
    const features: Tags[] = [
      { 'cycleway:left': 'lane', 'cycleway:right': 'lane' },
      { 'cycleway:both': 'lane' },
    ]
    const sides = sideStates(keys, {}, undefined, features)
    expect(sides.left.value).toBe('lane')
    expect(sides.right.value).toBe('lane')
    expect(sides.left.mixed).toBeUndefined()
    expect(sides.right.mixed).toBeUndefined()
  })

  it('missing explicit direction tag should be reported like a conflicting value', () => {
    const features: Tags[] = [{ 'cycleway:left': 'lane' }, { 'cycleway:both': 'lane' }]
    const sides = sideStates(keys, {}, undefined, features)
    expect(sides.left.value).toBe('lane')
    // the right side is empty on one feature and lane on the other: mixed, with a feature that lacks it
    expect(sides.right.value).toBeUndefined()
    expect(sides.right.mixed).toEqual({ kind: 'mixed', values: ['lane'], missing: true })
  })
})

describe('handle `[key]=left|right|both` schema', () => {
  const keys = directionalKeys('cycleway:both')

  it('transforms `both` to yes/yes', () => {
    const values = directionalValues(keys, { cycleway: 'both' })
    expect(values.left).toBe('yes')
    expect(values.right).toBe('yes')
  })

  it('transforms `left` to yes/no', () => {
    const values = directionalValues(keys, { cycleway: 'left' })
    expect(values.left).toBe('yes')
    expect(values.right).toBe('no')
  })

  it('preserves other values', () => {
    const values = directionalValues(keys, { cycleway: 'other' })
    expect(values.left).toBe('other')
    expect(values.right).toBe('other')
  })

  it('can read the value from key=left, but writes to key:left', () => {
    let tags: Tags = { cycleway: 'left' }
    const values = directionalValues(keys, tags)
    expect(values.left).toBe('yes')
    expect(values.right).toBe('no')

    // left.value = 'separate', then change
    tags = apply(tags, directionalWrite(keys, tags, 'left', 'separate'))
    expect(tags).toEqual({
      'cycleway:left': 'separate', // left was updated
      'cycleway:right': 'no',
    })

    // right.value = 'separate', then change
    tags = apply(tags, directionalWrite(keys, tags, 'right', 'separate'))
    expect(tags).toEqual({
      'cycleway:both': 'separate', // now left & right have been updated
    })
  })
})
