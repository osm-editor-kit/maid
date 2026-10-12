import { describe, expect, test } from 'bun:test'
import type { Tags } from '@osm-editor-kit/maid-presets'
import type { TagEdit } from '../logic.ts'
import {
  directionalKeys,
  directionalValues,
  directionalWrite,
  type DirectionalSide,
} from './directional-logic.ts'

/** The keys of the four directionalCombo fields of id-tagging-schema, by their key. */
const cycleway = directionalKeys('cycleway')
const sidewalk = directionalKeys('sidewalk:both')
const parkingBoth = directionalKeys('parking:both')
const parkingOrientation = directionalKeys('parking:both:orientation')

/** Edits in key order, so that the tests do not depend on the order they are made in. */
function sorted(edits: TagEdit[]): TagEdit[] {
  return [...edits].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

function write(
  keys: ReturnType<typeof directionalKeys>,
  tags: Tags,
  side: DirectionalSide,
  value: string | undefined,
): TagEdit[] {
  return sorted(directionalWrite(keys, tags, side, value))
}

describe('directionalKeys', () => {
  test('cycleway: the side keys have the side before the value', () => {
    expect(cycleway).toEqual({
      common: 'cycleway',
      other: 'cycleway:both',
      both: 'cycleway:both',
      fallback: 'cycleway',
      left: 'cycleway:left',
      right: 'cycleway:right',
    })
  })

  test('sidewalk:both: the common key has :both, the fallback does not', () => {
    expect(sidewalk).toEqual({
      common: 'sidewalk:both',
      other: 'sidewalk',
      both: 'sidewalk:both',
      fallback: 'sidewalk',
      left: 'sidewalk:left',
      right: 'sidewalk:right',
    })
  })

  test('parking:both: the side keys replace :both', () => {
    expect(parkingBoth).toEqual({
      common: 'parking:both',
      other: 'parking',
      both: 'parking:both',
      fallback: 'parking',
      left: 'parking:left',
      right: 'parking:right',
    })
  })

  test('parking:both:orientation: the side is in the middle of the key', () => {
    expect(parkingOrientation).toEqual({
      common: 'parking:both:orientation',
      other: 'parking:orientation',
      both: 'parking:both:orientation',
      fallback: 'parking:orientation',
      left: 'parking:left:orientation',
      right: 'parking:right:orientation',
    })
  })
})

describe('directionalValues (read)', () => {
  test('no tags: both sides are unset', () => {
    expect(directionalValues(cycleway, {})).toEqual({ left: undefined, right: undefined })
  })

  test(':both fills both sides', () => {
    expect(directionalValues(sidewalk, { 'sidewalk:both': 'yes' })).toEqual({
      left: 'yes',
      right: 'yes',
    })
    expect(
      directionalValues(parkingOrientation, { 'parking:both:orientation': 'parallel' }),
    ).toEqual({ left: 'parallel', right: 'parallel' })
  })

  test('a common value without a direction is the value of both sides', () => {
    expect(directionalValues(cycleway, { cycleway: 'lane' })).toEqual({
      left: 'lane',
      right: 'lane',
    })
  })

  test('a side key wins over the common key, the other side keeps the common value', () => {
    expect(directionalValues(cycleway, { cycleway: 'lane', 'cycleway:left': 'track' })).toEqual({
      left: 'track',
      right: 'lane',
    })
  })

  test('a direction as the value: yes on its side, no on the other', () => {
    expect(directionalValues(cycleway, { cycleway: 'left' })).toEqual({ left: 'yes', right: 'no' })
    expect(directionalValues(cycleway, { cycleway: 'right' })).toEqual({ left: 'no', right: 'yes' })
    expect(directionalValues(sidewalk, { sidewalk: 'left' })).toEqual({ left: 'yes', right: 'no' })
  })

  test('both as the value is yes on both sides', () => {
    expect(directionalValues(cycleway, { cycleway: 'both' })).toEqual({ left: 'yes', right: 'yes' })
  })

  test('the :both key with a value that is no is no on both sides', () => {
    expect(directionalValues(cycleway, { 'cycleway:both': 'no' })).toEqual({
      left: 'no',
      right: 'no',
    })
  })

  test('one side key alone leaves the other side unset', () => {
    expect(directionalValues(cycleway, { 'cycleway:left': 'track' })).toEqual({
      left: 'track',
      right: undefined,
    })
  })

  test('an empty side key does not count as a value', () => {
    expect(directionalValues(cycleway, { 'cycleway:left': '', cycleway: 'lane' })).toEqual({
      left: 'lane',
      right: 'lane',
    })
  })

  test('the orientation key of parking reads per side', () => {
    expect(
      directionalValues(parkingOrientation, { 'parking:left:orientation': 'diagonal' }),
    ).toEqual({ left: 'diagonal', right: undefined })
  })
})

describe('directionalWrite (write)', () => {
  test('a side set to the value it already has changes nothing', () => {
    expect(write(sidewalk, { 'sidewalk:both': 'yes' }, 'left', 'yes')).toEqual([])
  })

  test('a side that differs from the :both value splits it', () => {
    expect(write(sidewalk, { 'sidewalk:both': 'yes' }, 'left', 'no')).toEqual(
      sorted([
        { key: 'sidewalk:left', value: 'no' },
        { key: 'sidewalk:both', value: undefined },
        { key: 'sidewalk:right', value: 'yes' },
      ]),
    )
  })

  test('equal values on both sides write the :both key and remove the side keys', () => {
    expect(
      write(sidewalk, { 'sidewalk:left': 'no', 'sidewalk:right': 'yes' }, 'right', 'no'),
    ).toEqual(
      sorted([
        { key: 'sidewalk:both', value: 'no' },
        { key: 'sidewalk:right', value: undefined },
        { key: 'sidewalk:left', value: undefined },
      ]),
    )
  })

  test('equal values on cycleway write the common key', () => {
    expect(
      write(cycleway, { 'cycleway:left': 'track', 'cycleway:right': 'lane' }, 'right', 'track'),
    ).toEqual(
      sorted([
        { key: 'cycleway', value: 'track' },
        { key: 'cycleway:right', value: undefined },
        { key: 'cycleway:left', value: undefined },
      ]),
    )
  })

  test('different values write the two side keys and remove the common keys', () => {
    expect(
      write(cycleway, { 'cycleway:left': 'track', 'cycleway:right': 'track' }, 'right', 'lane'),
    ).toEqual([{ key: 'cycleway:right', value: 'lane' }])
  })

  test('a common value on one side: the chosen side is written, the other keeps the common value', () => {
    expect(write(cycleway, { cycleway: 'lane' }, 'left', 'track')).toEqual(
      sorted([
        { key: 'cycleway:left', value: 'track' },
        { key: 'cycleway', value: undefined },
        { key: 'cycleway:right', value: 'lane' },
      ]),
    )
  })

  test('clearing one side when :both was set splits it', () => {
    expect(write(sidewalk, { 'sidewalk:both': 'yes' }, 'left', undefined)).toEqual(
      sorted([
        { key: 'sidewalk:both', value: undefined },
        { key: 'sidewalk:right', value: 'yes' },
      ]),
    )
  })

  test('setting left to no when the common tag is left writes cycleway=no for both', () => {
    expect(write(cycleway, { cycleway: 'left' }, 'left', 'no')).toEqual([
      { key: 'cycleway', value: 'no' },
    ])
  })

  test('choosing a value on one side when the common tag is both', () => {
    expect(write(cycleway, { cycleway: 'both' }, 'left', 'track')).toEqual(
      sorted([
        { key: 'cycleway:left', value: 'track' },
        { key: 'cycleway', value: undefined },
        { key: 'cycleway:right', value: 'yes' },
      ]),
    )
  })

  test('the orientation key of parking: the sides are the keys in the middle', () => {
    expect(
      write(parkingOrientation, { 'parking:both:orientation': 'parallel' }, 'left', 'diagonal'),
    ).toEqual(
      sorted([
        { key: 'parking:left:orientation', value: 'diagonal' },
        { key: 'parking:both:orientation', value: undefined },
        { key: 'parking:right:orientation', value: 'parallel' },
      ]),
    )
  })

  test('the plain parking key uses the side keys parking:left and parking:right', () => {
    expect(write(parkingBoth, { 'parking:both': 'lane' }, 'right', 'street_side')).toEqual(
      sorted([
        { key: 'parking:right', value: 'street_side' },
        { key: 'parking:both', value: undefined },
        { key: 'parking:left', value: 'lane' },
      ]),
    )
  })

  test('clearing a side when nothing is set changes nothing', () => {
    expect(write(cycleway, {}, 'left', undefined)).toEqual([])
  })
})
