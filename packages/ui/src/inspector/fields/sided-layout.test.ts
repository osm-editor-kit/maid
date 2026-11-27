import { describe, expect, test } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { groupDirectionalFields, openedSubFields, sidedRowsOf } from './directional-group-logic.ts'

function field(id: string, key: string | undefined, type = 'directionalCombo'): Field {
  return { id, type, key, label: id, options: [] } as unknown as Field
}

const cycleway = field('cycleway', 'cycleway')
const sidewalk = field('sidewalk', 'sidewalk:both')
const parking = field('parking/side/parking', 'parking:both')
const orientation = field('parking/side/orientation', 'parking:both:orientation')
const laneMarkings = field('lane_markings', 'lane_markings', 'check')
const lit = field('lit', 'lit', 'check')
const name = field('name', 'name', 'text')

describe('sidedRowsOf', () => {
  test('the sided fields keep their place in the preset order; the fields between them stay between them', () => {
    const blocks = groupDirectionalFields([name, cycleway, sidewalk, laneMarkings, lit, parking])
    expect(blocks.map((block) => (sidedRowsOf(block) ? 'sided' : 'own'))).toEqual([
      'own',
      'sided',
      'sided',
      'own',
      'own',
      'sided',
    ])
  })

  test('a parent with its sub field: the sub row knows its parent', () => {
    const [block] = groupDirectionalFields([parking, orientation])
    const rows = sidedRowsOf(block!)!
    expect(rows.map((row) => row.field.id)).toEqual([parking.id, orientation.id])
    expect(rows[0]?.parent).toBeUndefined()
    expect(rows[1]?.parent).toBe(parking)
  })

  test('a directional combo without a key, or any other field, has its own row', () => {
    expect(sidedRowsOf({ kind: 'field', field: field('odd', undefined) })).toBeUndefined()
    expect(sidedRowsOf({ kind: 'field', field: lit })).toBeUndefined()
  })
})

describe('openedSubFields', () => {
  const offered = [cycleway, orientation, lit]

  test('parking on a side opens its orientation', () => {
    expect(openedSubFields([parking], offered, { 'parking:left': 'lane' })).toEqual([orientation])
    expect(openedSubFields([parking], offered, { 'parking:both': 'street_side' })).toEqual([
      orientation,
    ])
  })

  test('no parking on either side, or none set: nothing opens', () => {
    expect(openedSubFields([parking], offered, { 'parking:both': 'no' })).toEqual([])
    expect(openedSubFields([parking], offered, { 'parking:both': 'separate' })).toEqual([])
    expect(openedSubFields([parking], offered, {})).toEqual([])
  })

  test('one side with parking is enough', () => {
    const tags = { 'parking:left': 'no', 'parking:right': 'half_on_kerb' }
    expect(openedSubFields([parking], offered, tags)).toEqual([orientation])
  })

  test('a sub field that is a row already is not opened again', () => {
    expect(openedSubFields([parking, orientation], offered, { 'parking:both': 'lane' })).toEqual([])
  })

  test('without its parent among the rows nothing opens', () => {
    expect(openedSubFields([cycleway], offered, { 'parking:both': 'lane' })).toEqual([])
  })

  test('several features: a side that differs between them is used', () => {
    const features = [{ 'parking:both': 'lane' }, { 'parking:both': 'no' }]
    expect(openedSubFields([parking], offered, {}, undefined, features)).toEqual([orientation])
  })
})
