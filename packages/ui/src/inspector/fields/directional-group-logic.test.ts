import { describe, expect, test } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  groupDirectionalFields,
  subFieldSuffix,
  UNUSED_SIDE_VALUES,
  unusedSides,
} from './directional-group-logic.ts'
import { directionalKeys, sideStates, type SideState } from './directional-logic.ts'

/** A field with the id and key given; the other properties do not matter here. */
function field(id: string, key: string | undefined, type = 'directionalCombo'): Field {
  return { id, type, key, label: id, options: [] } as unknown as Field
}

/** The block list as ids: a field is its id, a group is the parent's id and its subs' ids in brackets. */
function ids(blocks: ReturnType<typeof groupDirectionalFields>): string[] {
  return blocks.map((block) =>
    block.kind === 'field'
      ? block.field.id
      : `${block.parent.id}[${block.subs.map((sub) => sub.id).join(',')}]`,
  )
}

describe('subFieldSuffix', () => {
  test('the orientation of parking on both sides is a sub field of the parking key', () => {
    expect(subFieldSuffix('parking:both', 'parking:both:orientation')).toBe(':orientation')
  })

  test('markings and orientation are both sub fields of the parking key', () => {
    expect(subFieldSuffix('parking:both', 'parking:both:markings')).toBe(':markings')
  })

  test('a parent with an explicit side key is not the parent of its own sub field', () => {
    // parking:left has no sides of its own to extend: parking:left:orientation is not one of its sub fields
    expect(subFieldSuffix('parking:left', 'parking:left:orientation')).toBeUndefined()
  })

  test('cycleway and its :both spelling: no suffix, so not a sub field', () => {
    expect(subFieldSuffix('cycleway', 'cycleway:both')).toBeUndefined()
    expect(subFieldSuffix('cycleway:both', 'cycleway')).toBeUndefined()
  })

  test('a key that is not related: no suffix', () => {
    expect(subFieldSuffix('parking:both', 'sidewalk:both')).toBeUndefined()
    expect(subFieldSuffix('parking:both', 'parking:both')).toBeUndefined()
  })

  test('a sub field of cycleway is one with the same suffix on both sides (cycleway:left:width)', () => {
    expect(subFieldSuffix('cycleway', 'cycleway:both:width')).toBe(':width')
    expect(subFieldSuffix('cycleway', 'cycleway:left:width')).toBeUndefined()
  })
})

describe('groupDirectionalFields', () => {
  test('no directional field: every field stays on its own, in order', () => {
    const fields = [field('name', 'name', 'text'), field('access', 'access', 'access')]
    expect(ids(groupDirectionalFields(fields))).toEqual(['name', 'access'])
  })

  test('a parent and its sub field become one group at the parent place', () => {
    const fields = [
      field('parking', 'parking:both'),
      field('parking_orientation', 'parking:both:orientation'),
    ]
    expect(ids(groupDirectionalFields(fields))).toEqual(['parking[parking_orientation]'])
  })

  test('several sub fields are grouped in list order, and other fields keep their place', () => {
    const fields = [
      field('name', 'name', 'text'),
      field('parking', 'parking:both'),
      field('sidewalk', 'sidewalk:both'),
      field('parking_orientation', 'parking:both:orientation'),
      field('parking_markings', 'parking:both:markings'),
    ]
    expect(ids(groupDirectionalFields(fields))).toEqual([
      'name',
      'parking[parking_orientation,parking_markings]',
      'sidewalk',
    ])
  })

  test('a sub field before its parent: the group is at the parent place', () => {
    const fields = [
      field('parking_orientation', 'parking:both:orientation'),
      field('name', 'name', 'text'),
      field('parking', 'parking:both'),
    ]
    expect(ids(groupDirectionalFields(fields))).toEqual(['name', 'parking[parking_orientation]'])
  })

  test('a sub field without its parent stays on its own', () => {
    const fields = [field('parking_orientation', 'parking:both:orientation')]
    expect(ids(groupDirectionalFields(fields))).toEqual(['parking_orientation'])
  })

  test('an unrelated directional combo stays on its own', () => {
    const fields = [field('parking', 'parking:both'), field('cycleway', 'cycleway')]
    expect(ids(groupDirectionalFields(fields))).toEqual(['parking', 'cycleway'])
  })

  test('the same suffix on the cycleway: cycleway:both:width is grouped with cycleway', () => {
    const fields = [field('cycleway', 'cycleway:both'), field('width', 'cycleway:both:width')]
    expect(ids(groupDirectionalFields(fields))).toEqual(['cycleway[width]'])
  })

  test('a sub field of a sub field joins the field that is not a sub field (one level of groups)', () => {
    const fields = [
      field('parking', 'parking:both'),
      field('orientation', 'parking:both:orientation'),
      field('orientation_x', 'parking:both:orientation:x'),
    ]
    expect(ids(groupDirectionalFields(fields))).toEqual(['parking[orientation,orientation_x]'])
  })

  test('a sub field whose only parent is a sub field: that sub field is the group parent', () => {
    const fields = [
      field('orientation_x', 'parking:both:orientation:x'),
      field('orientation', 'parking:both:orientation'),
    ]
    expect(ids(groupDirectionalFields(fields))).toEqual(['orientation[orientation_x]'])
  })

  test('a field without a key is not a directional field', () => {
    const fields = [field('parking', 'parking:both'), field('bare', undefined)]
    expect(ids(groupDirectionalFields(fields))).toEqual(['parking', 'bare'])
  })
})

describe('unusedSides', () => {
  const keys = directionalKeys('parking:both')
  /** The parent's sides as the field reads them from the tags (one feature). */
  const sidesOf = (tags: Record<string, string>) => sideStates(keys, tags)

  test('the list of values is one constant with separate, no and none', () => {
    expect([...UNUSED_SIDE_VALUES]).toEqual(['separate', 'no', 'none'])
  })

  test('parking:both=no is not used on either side', () => {
    expect(unusedSides(sidesOf({ 'parking:both': 'no' }))).toEqual({ left: true, right: true })
  })

  test('parking:both=none, and parking=no as the common key: no on both sides', () => {
    expect(unusedSides(sidesOf({ 'parking:both': 'none' }))).toEqual({ left: true, right: true })
    expect(unusedSides(sidesOf({ parking: 'no' }))).toEqual({ left: true, right: true })
  })

  test('one side only: parking:left=separate leaves the right side used', () => {
    expect(unusedSides(sidesOf({ 'parking:left': 'separate' }))).toEqual({
      left: true,
      right: false,
    })
  })

  test('a side key wins: parking:both=no with parking:right=lane uses the right side', () => {
    expect(unusedSides(sidesOf({ 'parking:both': 'no', 'parking:right': 'lane' }))).toEqual({
      left: true,
      right: false,
    })
  })

  test('a used value, a direction and an unset side are used', () => {
    expect(unusedSides(sidesOf({ 'parking:both': 'lane' }))).toEqual({ left: false, right: false })
    expect(unusedSides(sidesOf({ parking: 'left' }))).toEqual({ left: false, right: true })
    expect(unusedSides(sidesOf({}))).toEqual({ left: false, right: false })
  })

  test('a mixed side over several features is used', () => {
    const mixed: SideState = {
      value: undefined,
      mixed: { kind: 'mixed', values: ['no', 'lane'], missing: false },
    }
    expect(unusedSides({ left: mixed, right: mixed })).toEqual({ left: false, right: false })
  })
})
