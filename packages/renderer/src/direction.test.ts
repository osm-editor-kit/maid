import { describe, expect, test } from 'bun:test'
import { arrowColour, onewayOf, sidedOf, SIDE_KINDS } from './direction'

describe('onewayOf (iD isOneWay, isOneWayBackwards, isBiDirectional)', () => {
  test('oneway=yes goes along the way', () => {
    expect(onewayOf({ highway: 'residential', oneway: 'yes' })).toBe(1)
  })

  test('oneway=-1 goes against the way', () => {
    expect(onewayOf({ highway: 'residential', oneway: '-1' })).toBe(-1)
  })

  test('reversible and alternating go both ways', () => {
    expect(onewayOf({ oneway: 'reversible' })).toBe(2)
    expect(onewayOf({ oneway: 'alternating' })).toBe(2)
    expect(onewayOf({ conveying: 'reversible' })).toBe(2)
  })

  test('a roundabout is one-way without a oneway tag, as in iD', () => {
    expect(onewayOf({ junction: 'roundabout' })).toBe(1)
    expect(onewayOf({ junction: 'circular' })).toBe(1)
  })

  test('motorways and waterways imply one-way in iD', () => {
    expect(onewayOf({ highway: 'motorway' })).toBe(1)
    expect(onewayOf({ waterway: 'stream' })).toBe(1)
  })

  test('conveying=forward and backward', () => {
    expect(onewayOf({ man_made: 'goods_conveyor', conveying: 'forward' })).toBe(1)
    expect(onewayOf({ conveying: 'backward' })).toBe(-1)
  })

  test('oneway=no overrides the implied one-way', () => {
    expect(onewayOf({ junction: 'roundabout', oneway: 'no' })).toBeUndefined()
    expect(onewayOf({ highway: 'motorway', oneway: 'no' })).toBeUndefined()
  })

  test('no direction for an ordinary line', () => {
    expect(onewayOf({ highway: 'residential' })).toBeUndefined()
    expect(onewayOf({})).toBeUndefined()
  })

  test('a value that is only a prototype property is not a direction', () => {
    expect(onewayOf({ oneway: 'constructor' })).toBeUndefined()
    expect(onewayOf({ highway: 'toString' })).toBeUndefined()
  })
})

describe('arrowColour (iD onewayArrowColour)', () => {
  test('white on construction bridges and runways', () => {
    expect(arrowColour({ highway: 'construction', bridge: 'yes' })).toBe('#fff')
    expect(arrowColour({ aeroway: 'runway' })).toBe('#fff')
  })

  test('grey on pedestrian and rail lines', () => {
    expect(arrowColour({ highway: 'pedestrian', oneway: 'yes' })).toBe('#eee')
    expect(arrowColour({ railway: 'rail', oneway: 'yes' })).toBe('#eee')
  })

  test('rail with a highway tag keeps the default colour', () => {
    expect(arrowColour({ railway: 'rail', highway: 'road' })).toBeUndefined()
  })

  test('default colour otherwise', () => {
    expect(arrowColour({ highway: 'residential', oneway: 'yes' })).toBeUndefined()
  })
})

describe('sidedOf (iD isSided, sidednessIdentifier)', () => {
  test('cliffs, walls and kerbs are sided', () => {
    expect(sidedOf({ natural: 'cliff' })).toBe('natural')
    expect(sidedOf({ barrier: 'retaining_wall' })).toBe('barrier')
    expect(sidedOf({ barrier: 'kerb' })).toBe('barrier')
  })

  test('coastline and guard rail have their own kinds', () => {
    expect(sidedOf({ natural: 'coastline' })).toBe('coastline')
    expect(sidedOf({ barrier: 'guard_rail' })).toBe('guard_rail')
  })

  test('embankment and cutting sides', () => {
    expect(sidedOf({ embankment: 'left' })).toBe('embankment-left')
    expect(sidedOf({ embankment: 'yes' })).toBe('embankment')
    expect(sidedOf({ cutting: 'right' })).toBe('cutting-right')
    expect(sidedOf({ man_made: 'embankment' })).toBe('embankment-man_made')
  })

  test('two_sided=yes is not sided', () => {
    expect(sidedOf({ barrier: 'kerb', two_sided: 'yes' })).toBeUndefined()
  })

  test('ordinary lines are not sided', () => {
    expect(sidedOf({ highway: 'residential' })).toBeUndefined()
    expect(sidedOf({ natural: 'water' })).toBeUndefined()
  })

  test('every kind it can return has an image', () => {
    const tags: Record<string, string>[] = [
      { natural: 'cliff' },
      { natural: 'coastline' },
      { barrier: 'guard_rail' },
      { man_made: 'embankment' },
      { man_made: 'quay' },
      { waterway: 'weir' },
      { cutting: 'yes' },
      { cutting: 'left' },
      { cutting: 'right' },
      { embankment: 'yes' },
      { embankment: 'left' },
      { embankment: 'right' },
    ]
    for (const t of tags) {
      const kind = sidedOf(t)
      expect(kind).toBeDefined()
      expect(SIDE_KINDS[kind!]).toBeDefined()
    }
  })
})
