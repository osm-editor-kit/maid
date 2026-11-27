import { describe, expect, it } from 'bun:test'
import {
  compareSideKeys,
  mergeSides,
  otherSideKey,
  sameTags,
  sidePlaceOf,
  splitBoth,
} from './tag-sides.ts'

describe('sidePlaceOf: which keys belong to a side group', () => {
  it('the group as the first part, or the second after a meta prefix', () => {
    expect(sidePlaceOf('cycleway')?.group).toBe('cycleway')
    expect(sidePlaceOf('cycleway:both:width')?.group).toBe('cycleway')
    expect(sidePlaceOf('sidewalk:left')?.group).toBe('sidewalk')
    expect(sidePlaceOf('parking:both:orientation')?.group).toBe('parking')
    expect(sidePlaceOf('source:cycleway:both:width')).toEqual({
      group: 'cycleway',
      meta: 'source',
      path: 'cycleway:both:width',
    })
    expect(sidePlaceOf('fixme:sidewalk')?.group).toBe('sidewalk')
    expect(sidePlaceOf('mapillary:cycleway:right')?.group).toBe('cycleway')
  })

  it('other keys are in none', () => {
    expect(sidePlaceOf('highway')).toBeUndefined()
    expect(sidePlaceOf('name:etymology:wikidata')).toBeUndefined()
    expect(sidePlaceOf('cycleway_lane')).toBeUndefined()
    expect(sidePlaceOf('a:b:cycleway')).toBeUndefined()
  })
})

describe('compareSideKeys: the order of the sides view', () => {
  it('a group sorts where its name would, meta keys right under their key', () => {
    const keys = [
      'source:cycleway:both:width',
      'surface',
      'cycleway:both:width',
      'foot',
      'cycleway:both',
      'fixme:cycleway',
      'cycleway',
      'bicycle',
      'sidewalk:both',
      'name',
    ]
    expect([...keys].sort(compareSideKeys)).toEqual([
      'bicycle',
      'cycleway',
      'fixme:cycleway',
      'cycleway:both',
      'cycleway:both:width',
      'source:cycleway:both:width',
      'foot',
      'name',
      'sidewalk:both',
      'surface',
    ])
  })
})

describe('splitBoth: :both shown as its two sides', () => {
  it('every both key of a group, meta prefixed ones too; others stay', () => {
    expect(
      splitBoth({
        highway: 'residential',
        'cycleway:both': 'lane',
        'cycleway:both:surface': 'asphalt',
        'source:cycleway:both:width': 'Luftbild 2025',
        'parking:both': 'no',
        'name:both': 'x',
      }),
    ).toEqual({
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:right': 'lane',
      'cycleway:left:surface': 'asphalt',
      'cycleway:right:surface': 'asphalt',
      'source:cycleway:left:width': 'Luftbild 2025',
      'source:cycleway:right:width': 'Luftbild 2025',
      'parking:left': 'no',
      'parking:right': 'no',
      'name:both': 'x',
    })
  })

  it('a both key whose side says something else stays as it is', () => {
    const tags = { 'cycleway:both:width': '1.5', 'cycleway:left:width': '2' }
    expect(splitBoth(tags)).toEqual(tags)
    expect(splitBoth({ 'cycleway:both': 'lane', 'cycleway:left': 'lane' })).toEqual({
      'cycleway:left': 'lane',
      'cycleway:right': 'lane',
    })
  })
})

describe('mergeSides: what is stored after a change in the sides view', () => {
  const stored = { highway: 'residential', 'cycleway:both': 'lane', 'cycleway:both:width': '1.5' }
  const shown = splitBoth(stored)

  it('unchanged sides that were both are both again', () => {
    expect(mergeSides({ ...shown, lit: 'yes' }, shown, stored)).toEqual({ ...stored, lit: 'yes' })
  })

  it('a side changed: the two are stored apart, the both key goes', () => {
    expect(mergeSides({ ...shown, 'cycleway:left:width': '2' }, shown, stored)).toEqual({
      highway: 'residential',
      'cycleway:both': 'lane',
      'cycleway:left:width': '2',
      'cycleway:right:width': '1.5',
    })
  })

  it('a side set to the value of the other: both', () => {
    const apart = { 'sidewalk:left': 'separate', 'sidewalk:right': 'no' }
    expect(mergeSides({ ...apart, 'sidewalk:right': 'separate' }, apart, apart)).toEqual({
      'sidewalk:both': 'separate',
    })
  })

  it('equal sides stored apart and not touched stay apart', () => {
    const apart = { 'sidewalk:left': 'separate', 'sidewalk:right': 'separate' }
    expect(mergeSides({ ...apart, lit: 'yes' }, apart, apart)).toEqual({ ...apart, lit: 'yes' })
  })

  it('meta keys merge the same way', () => {
    const metaStored = { 'source:cycleway:both:width': 'Luftbild 2025' }
    const metaShown = splitBoth(metaStored)
    expect(mergeSides(metaShown, metaShown, metaStored)).toEqual(metaStored)
  })
})

describe('otherSideKey and sameTags', () => {
  it('left and right swap, other keys have none', () => {
    expect(otherSideKey('cycleway:left:surface')).toBe('cycleway:right:surface')
    expect(otherSideKey('source:cycleway:right:width')).toBe('source:cycleway:left:width')
    expect(otherSideKey('cycleway:both')).toBeUndefined()
    expect(otherSideKey('highway')).toBeUndefined()
  })
  it('sameTags compares keys and values', () => {
    expect(sameTags({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(sameTags({ a: '1' }, { a: '1', b: '2' })).toBe(false)
  })
})
