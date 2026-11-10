import { describe, expect, test } from 'bun:test'
import { canMoveSide, roadTagsWithout, sideAttributes, sideValue, tagsForWay } from './side-tags.ts'

const road = {
  highway: 'residential',
  'sidewalk:both': 'separate',
  'sidewalk:both:surface': 'paving_stones',
  'sidewalk:left:width': '2',
  'sidewalk:right:surface': 'asphalt',
  'sidewalk:kerb': 'raised',
}

describe('sideAttributes', () => {
  test('the side key wins over both, and kerb stays on the road', () => {
    expect(sideAttributes(road, 'sidewalk', 'left')).toEqual([
      { key: 'surface', value: 'paving_stones', from: 'sidewalk:both:surface' },
      { key: 'width', value: '2', from: 'sidewalk:left:width' },
    ])
    expect(sideAttributes(road, 'sidewalk', 'right')).toEqual([
      { key: 'surface', value: 'asphalt', from: 'sidewalk:right:surface' },
    ])
  })

  test('lane keys stay on the road', () => {
    const tags = {
      'cycleway:right': 'separate',
      'cycleway:right:lane': 'advisory',
      'cycleway:right:lanes': '1',
    }
    expect(sideAttributes(tags, 'cycleway', 'right')).toEqual([])
  })

  test('a plain sub-key counts for both sides', () => {
    expect(
      sideAttributes({ sidewalk: 'separate', 'sidewalk:lit': 'yes' }, 'sidewalk', 'right'),
    ).toEqual([{ key: 'lit', value: 'yes', from: 'sidewalk:lit' }])
  })
})

describe('sideValue and canMoveSide', () => {
  test('old values and the both key', () => {
    expect(sideValue({ sidewalk: 'left' }, 'sidewalk', 'right')).toBe('no')
    expect(sideValue({ sidewalk: 'both' }, 'sidewalk', 'right')).toBe('yes')
    expect(sideValue(road, 'sidewalk', 'left')).toBe('separate')
  })

  test('only a road with a separate side that has attributes', () => {
    expect(canMoveSide(road, 'sidewalk', 'left')).toBe(true)
    expect(canMoveSide({ ...road, highway: 'footway' }, 'sidewalk', 'left')).toBe(false)
    expect(
      canMoveSide({ highway: 'residential', 'sidewalk:both': 'separate' }, 'sidewalk', 'left'),
    ).toBe(false)
    expect(
      canMoveSide(
        { highway: 'residential', 'sidewalk:both': 'yes', 'sidewalk:both:surface': 'x' },
        'sidewalk',
        'left',
      ),
    ).toBe(false)
  })
})

describe('roadTagsWithout', () => {
  test('one side: a shared key stays for the other side as its own key', () => {
    expect(roadTagsWithout(road, 'sidewalk', ['left'])).toEqual({
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:right:surface': 'asphalt',
      'sidewalk:kerb': 'raised',
    })
    const shared = {
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:both:surface': 'sett',
    }
    expect(roadTagsWithout(shared, 'sidewalk', ['left'])).toEqual({
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:right:surface': 'sett',
    })
  })

  test('a moved side key does not leave a shared key that would describe it again', () => {
    const tags = {
      highway: 'residential',
      'sidewalk:left': 'separate',
      'sidewalk:right': 'no',
      'sidewalk:left:surface': 'asphalt',
      'sidewalk:both:surface': 'sett',
    }
    expect(roadTagsWithout(tags, 'sidewalk', ['left'])).toEqual({
      highway: 'residential',
      'sidewalk:left': 'separate',
      'sidewalk:right': 'no',
    })
  })

  test('a kept key of a moving side stays as its own key when the other side moves the shared key', () => {
    const shared = {
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:both:surface': 'sett',
    }
    const kept = new Map([['left' as const, new Set(['surface'])]])
    expect(roadTagsWithout(shared, 'sidewalk', ['left', 'right'], kept)).toEqual({
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:left:surface': 'sett',
    })
  })

  test('both sides: every attribute goes', () => {
    expect(roadTagsWithout(road, 'sidewalk', ['left', 'right'])).toEqual({
      highway: 'residential',
      'sidewalk:both': 'separate',
      'sidewalk:kerb': 'raised',
    })
  })
})

test('tagsForWay turns directions for a way against the road', () => {
  const attributes = [
    { key: 'traffic_sign:forward', value: 'DE:240', from: '' },
    { key: 'oneway', value: 'yes', from: '' },
    { key: 'surface', value: 'asphalt', from: '' },
  ]
  expect(tagsForWay(attributes, true)).toEqual({
    'traffic_sign:backward': 'DE:240',
    oneway: '-1',
    surface: 'asphalt',
  })
  expect(tagsForWay(attributes, false).oneway).toBe('yes')
})
