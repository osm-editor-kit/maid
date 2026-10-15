import { describe, expect, test } from 'bun:test'
import { reverseKey, reverseValue } from '@osm-editor-kit/maid-model'
import {
  isDirectionDependent,
  isDirectionalKey,
  laneCountOf,
  mirrorKey,
  mirrorTags,
  mirrorValue,
} from './mirror.ts'

describe('mirrorKey', () => {
  test('swaps left and right, forward and backward, start and end', () => {
    expect(mirrorKey('cycleway:left')).toBe('cycleway:right')
    expect(mirrorKey('parking:right:fee')).toBe('parking:left:fee')
    expect(mirrorKey('cycleway:left:surface')).toBe('cycleway:right:surface')
    expect(mirrorKey('lanes:forward')).toBe('lanes:backward')
    expect(mirrorKey('turn:lanes:backward')).toBe('turn:lanes:forward')
    expect(mirrorKey('placement:start')).toBe('placement:end')
  })

  test('keys without a direction stay as they are', () => {
    for (const key of [
      'highway',
      'name',
      'lanes',
      'oneway',
      'cycleway',
      'sidewalk',
      'left_side',
      'addr:street',
    ]) {
      expect(mirrorKey(key)).toBe(key)
      expect(isDirectionalKey(key)).toBe(false)
    }
    expect(isDirectionalKey('cycleway:left')).toBe(true)
  })

  test('is an involution for every key, including two directions in one key', () => {
    const keys = [
      'cycleway:left',
      'cycleway:right',
      'a:left:right',
      'a:right:right',
      'a:left:left:left',
      'parking:both:fee',
      'lanes:forward',
      'turn:lanes:forward:left',
      'x:start:end',
      'x:forward:left',
      'highway',
      'name:left_bank',
    ]
    for (const key of keys) {
      expect(mirrorKey(mirrorKey(key))).toBe(key)
    }
  })
})

describe('mirrorValue', () => {
  test('oneway: yes and -1 swap, other values stay', () => {
    expect(mirrorValue('oneway', 'yes')).toBe('-1')
    expect(mirrorValue('oneway', '-1')).toBe('yes')
    expect(mirrorValue('oneway', 'no')).toBe('no')
    expect(mirrorValue('oneway', 'alternating')).toBe('alternating')
    expect(mirrorValue('oneway:bicycle', 'yes')).toBe('-1')
  })

  test('the synonyms of yes and -1 come back as the canonical value', () => {
    expect(mirrorValue('oneway', 'true')).toBe('-1')
    expect(mirrorValue('oneway', '1')).toBe('-1')
    expect(mirrorValue('oneway', 'reverse')).toBe('yes')
    expect(mirrorValue('oneway', mirrorValue('oneway', 'true'))).toBe('yes')
  })

  test('bare side values swap for sidewalk, cycleway and busway', () => {
    expect(mirrorValue('cycleway', 'left')).toBe('right')
    expect(mirrorValue('sidewalk', 'right')).toBe('left')
    expect(mirrorValue('busway', 'both')).toBe('both')
  })

  test('a left or right value of any other key swaps too, as Reverse does (bus_bay)', () => {
    expect(mirrorValue('bus_bay', 'left')).toBe('right')
    expect(mirrorValue('bus_bay', 'toString')).toBe('toString')
  })

  test('incline: up and down swap, a number changes its sign, a zero stays zero', () => {
    expect(mirrorValue('incline', 'up')).toBe('down')
    expect(mirrorValue('incline', 'down')).toBe('up')
    expect(mirrorValue('incline', '10%')).toBe('-10%')
    expect(mirrorValue('incline', '-5')).toBe('5')
    expect(mirrorValue('incline', '.8°')).toBe('-.8°')
    expect(mirrorValue('incline', '0')).toBe('0')
    expect(mirrorValue('incline', '-0%')).toBe('0%')
    expect(mirrorValue('incline', 'steep')).toBe('steep')
  })

  test('direction: forward and backward swap; compass bearings stay, as in Reverse on a way', () => {
    expect(mirrorValue('direction', 'forward')).toBe('backward')
    expect(mirrorValue('direction', 'backwards')).toBe('forward')
    expect(mirrorValue('direction', 'N')).toBe('N')
    expect(mirrorValue('direction', '90')).toBe('90')
  })

  test('lane pipes are reversed in order; turn tokens and change tokens are mirrored too', () => {
    expect(mirrorValue('lanes:both_ways', 'yes|no|yes')).toBe('yes|no|yes')
    expect(mirrorValue('psv:lanes', 'designated|no|lane')).toBe('lane|no|designated')
    expect(mirrorValue('turn:lanes', 'left|through|slight_right')).toBe('slight_left|through|right')
    expect(mirrorValue('turn:lanes:forward', 'left;through|through')).toBe('through|right;through')
    expect(mirrorValue('change:lanes', 'not_left|')).toBe('|not_right')
  })

  test('placement follows the lane count, from the tags', () => {
    expect(mirrorValue('placement', 'left_of:1', { lanes: '3' })).toBe('right_of:3')
    expect(mirrorValue('placement', 'right_of:3', { lanes: '3' })).toBe('left_of:1')
    expect(mirrorValue('placement', 'middle_of:2', { lanes: '3' })).toBe('middle_of:2')
    expect(
      mirrorValue('placement', 'left_of:1', { 'lanes:forward': '2', 'lanes:backward': '1' }),
    ).toBe('right_of:3')
    expect(mirrorValue('placement', 'transition', { lanes: '3' })).toBe('transition')
  })

  test('placement without a lane count, or a lane outside the count, does not change', () => {
    expect(mirrorValue('placement', 'left_of:1')).toBe('left_of:1')
    expect(mirrorValue('placement', 'left_of:4', { lanes: '3' })).toBe('left_of:4')
    expect(mirrorValue('placement', 'left_of:0', { lanes: '3' })).toBe('left_of:0')
  })

  test('the value of a plain key does not change', () => {
    expect(mirrorValue('surface', 'asphalt')).toBe('asphalt')
    expect(mirrorValue('lanes', '2')).toBe('2')
  })

  test('placement and lane pipes are involutions for canonical values', () => {
    const tags = { lanes: '4' }
    for (const value of ['left_of:1', 'right_of:2', 'middle_of:3', 'left_of:4', 'transition']) {
      expect(mirrorValue('placement', mirrorValue('placement', value, tags), tags)).toBe(value)
    }
    for (const value of ['left|through|right', 'through|left;right|', 'yes||no']) {
      expect(mirrorValue('turn:lanes', mirrorValue('turn:lanes', value))).toBe(value)
    }
  })
})

describe('isDirectionDependent', () => {
  test('a directional key is dependent, whatever the value', () => {
    expect(isDirectionDependent('cycleway:left', 'lane')).toBe(true)
    expect(isDirectionDependent('parking:right', 'parallel')).toBe(true)
    expect(isDirectionDependent('lanes:forward', '2')).toBe(true)
  })

  test('a value the mirror changes is dependent', () => {
    expect(isDirectionDependent('oneway', 'yes')).toBe(true)
    expect(isDirectionDependent('cycleway', 'left')).toBe(true)
    expect(isDirectionDependent('turn:lanes', 'left|through')).toBe(true)
    expect(isDirectionDependent('placement', 'left_of:1', { lanes: '2' })).toBe(true)
  })

  test('incline and direction values are dependent when the mirror changes them', () => {
    expect(isDirectionDependent('incline', 'up')).toBe(true)
    expect(isDirectionDependent('incline', '5%')).toBe(true)
    expect(isDirectionDependent('direction', 'forward')).toBe(true)
    expect(isDirectionDependent('incline', '0')).toBe(false)
    expect(isDirectionDependent('direction', 'N')).toBe(false)
  })

  test('a value that stays the same, and a plain key, are not dependent', () => {
    expect(isDirectionDependent('oneway', 'no')).toBe(false)
    expect(isDirectionDependent('highway', 'residential')).toBe(false)
    expect(isDirectionDependent('lanes', '2')).toBe(false)
    expect(isDirectionDependent('lanes:both_ways', 'yes|yes')).toBe(false)
    expect(isDirectionDependent('placement', 'left_of:1')).toBe(false)
  })
})

describe('laneCountOf', () => {
  test('the lanes tag, else the sum of the directional lane tags', () => {
    expect(laneCountOf({ lanes: '3', 'lanes:forward': '1' })).toBe(3)
    expect(
      laneCountOf({ 'lanes:forward': '2', 'lanes:backward': '1', 'lanes:both_ways': '1' }),
    ).toBe(4)
    expect(laneCountOf({ highway: 'primary' })).toBe(0)
  })
})

describe('mirrorTags', () => {
  const tags = {
    highway: 'primary',
    name: 'Mill Road',
    oneway: 'yes',
    lanes: '3',
    'lanes:forward': '2',
    'lanes:backward': '1',
    'turn:lanes:forward': 'left|through;right',
    'cycleway:left': 'lane',
    'cycleway:right': 'track',
    'parking:right:orientation': 'parallel',
    placement: 'left_of:2',
    sidewalk: 'left',
    'sidewalk:both:surface': 'paving_stones',
  }

  test('keys and direction-dependent values change; the rest stays', () => {
    const mirrored = mirrorTags(tags)
    expect(mirrored.highway).toBe('primary')
    expect(mirrored.name).toBe('Mill Road')
    expect(mirrored.oneway).toBe('-1')
    expect(mirrored['cycleway:right']).toBe('lane')
    expect(mirrored['cycleway:left']).toBe('track')
    expect(mirrored['parking:left:orientation']).toBe('parallel')
    expect(mirrored['lanes:backward']).toBe('2')
    expect(mirrored['turn:lanes:backward']).toBe('through;left|right')
    expect(mirrored.placement).toBe('right_of:2')
    expect(mirrored.sidewalk).toBe('right')
    expect(mirrored['sidewalk:both:surface']).toBe('paving_stones')
  })

  test('mirroring twice gives the tags back (canonical values)', () => {
    expect(mirrorTags(mirrorTags(tags))).toEqual(tags)
  })

  test('incline and direction on a reversed way are mirrored with the rest', () => {
    const mirrored = mirrorTags({ incline: 'up', direction: 'forward' })
    expect(mirrored).toEqual({ incline: 'down', direction: 'backward' })
    expect(
      mirrorTags(mirrorTags({ incline: '10%', direction: 'backward', highway: 'path' })),
    ).toEqual({ incline: '10%', direction: 'backward', highway: 'path' })
  })
})

describe('agreement with the Reverse operation (packages/model reverse.ts)', () => {
  // The keys and values Reverse changes on a way, and the value of each: the table must show the same
  const cases: [string, string][] = [
    ['cycleway:left', 'lane'],
    ['parking:right:fee', 'yes'],
    ['lanes:forward', '2'],
    ['incline', 'up'],
    ['incline', '-7%'],
    ['incline', '0'],
    ['direction', 'forward'],
    ['direction', 'N'],
    ['bus_bay', 'right'],
    ['sidewalk', 'left'],
    ['sidewalk:both:surface', 'paving_stones'],
    ['name', 'left'],
    ['note:left', 'up'],
    ['red_turn:right', 'yes'],
    ['role', 'forward'],
  ]

  test('mirrorKey is reverseKey, except for start and end', () => {
    for (const [key] of cases) expect(mirrorKey(key)).toBe(reverseKey(key))
    expect(mirrorKey('placement:start')).toBe('placement:end')
  })

  test('mirrorValue is reverseValue for every key Reverse changes (and for those it keeps)', () => {
    for (const [key, value] of cases) {
      expect(mirrorValue(key, value)).toBe(reverseValue(key, value, {}, { reverseOneway: true }))
    }
  })

  test('the table shows the reversed incline that Reverse writes', () => {
    expect(mirrorValue('incline', '3%')).toBe('-3%')
  })
})
