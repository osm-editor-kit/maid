import { describe, expect, it } from 'bun:test'
import { bicycleProfile, footProfile, profiles } from './profile.ts'

describe('bicycle profile: which ways', () => {
  it('a cycleway is routable both ways and preferred', () => {
    expect(bicycleProfile.wayRule({ highway: 'cycleway' })).toMatchObject({
      forward: true,
      backward: true,
      factor: 0.7,
    })
  })

  it('a motorway is not routable', () => {
    expect(bicycleProfile.wayRule({ highway: 'motorway' })).toBeUndefined()
    expect(bicycleProfile.wayRule({ highway: 'motorway', bicycle: 'yes' })).toBeUndefined()
  })

  it('a way without highway is not routable', () => {
    expect(bicycleProfile.wayRule({ route: 'ferry' })).toBeUndefined()
  })

  it('a footway needs a bicycle tag', () => {
    expect(bicycleProfile.wayRule({ highway: 'footway' })).toBeUndefined()
    expect(bicycleProfile.wayRule({ highway: 'footway', bicycle: 'designated' })?.factor).toBe(1.5)
  })

  it('access=no and bicycle=no block; bicycle=yes overrides access=no', () => {
    expect(bicycleProfile.wayRule({ highway: 'residential', access: 'no' })).toBeUndefined()
    expect(bicycleProfile.wayRule({ highway: 'residential', bicycle: 'no' })).toBeUndefined()
    expect(
      bicycleProfile.wayRule({ highway: 'residential', access: 'no', bicycle: 'yes' }),
    ).toBeDefined()
  })

  it('private blocks', () => {
    expect(bicycleProfile.wayRule({ highway: 'service', access: 'private' })).toBeUndefined()
  })

  it('dismount is routable at ten times the cost', () => {
    expect(bicycleProfile.wayRule({ highway: 'path', bicycle: 'dismount' })?.factor).toBeCloseTo(9)
  })

  it('use_sidepath is routable at twenty times the cost', () => {
    const rule = bicycleProfile.wayRule({ highway: 'residential', bicycle: 'use_sidepath' })
    expect(rule?.factor).toBeCloseTo(20)
    expect(rule?.covered).toContain('bicycle=use_sidepath')
  })

  it('steps cost twenty times as much for a bicycle', () => {
    expect(bicycleProfile.wayRule({ highway: 'steps' })?.factor).toBe(20)
  })

  it('a _link road costs 1.1 times its parent', () => {
    expect(bicycleProfile.wayRule({ highway: 'primary_link' })?.factor).toBeCloseTo(2.2)
  })

  it('the cheapest factor is the cycleway one', () => {
    expect(bicycleProfile.minFactor).toBe(0.7)
  })
})

describe('bicycle profile: one-way', () => {
  it('oneway=yes is forward only, oneway=-1 backward only', () => {
    expect(bicycleProfile.wayRule({ highway: 'residential', oneway: 'yes' })).toMatchObject({
      forward: true,
      backward: false,
    })
    expect(bicycleProfile.wayRule({ highway: 'residential', oneway: '-1' })).toMatchObject({
      forward: false,
      backward: true,
    })
  })

  it('reversible reads as forward', () => {
    expect(bicycleProfile.wayRule({ highway: 'residential', oneway: 'reversible' })).toMatchObject({
      forward: true,
      backward: false,
    })
  })

  it('oneway:bicycle=no lifts oneway=yes', () => {
    expect(
      bicycleProfile.wayRule({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' }),
    ).toMatchObject({ forward: true, backward: true })
  })

  it('oneway:bicycle=-1 wins over oneway=yes', () => {
    expect(
      bicycleProfile.wayRule({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': '-1' }),
    ).toMatchObject({ forward: false, backward: true })
  })

  it('a contraflow lane lets a bicycle go both ways on a one-way road', () => {
    const rule = bicycleProfile.wayRule({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:left': 'opposite_lane',
    })
    expect(rule).toMatchObject({ forward: true, backward: true })
    expect(rule?.covered.some((c) => c.startsWith('contraflow'))).toBe(true)
  })

  it('a cycle lane with cycleway:left:oneway=-1 on a one-way road is contraflow', () => {
    expect(
      bicycleProfile.wayRule({
        highway: 'residential',
        oneway: 'yes',
        'cycleway:left': 'lane',
        'cycleway:left:oneway': '-1',
      }),
    ).toMatchObject({ forward: true, backward: true })
  })

  it('a roundabout is forward for a bicycle', () => {
    expect(bicycleProfile.wayRule({ highway: 'primary', junction: 'roundabout' })).toMatchObject({
      forward: true,
      backward: false,
    })
  })

  it('area=yes highways are not cyclable', () => {
    expect(bicycleProfile.wayRule({ highway: 'pedestrian', area: 'yes' })).toBeUndefined()
  })
})

describe('foot profile', () => {
  it('a footway is routable both ways', () => {
    expect(footProfile.wayRule({ highway: 'footway' })).toMatchObject({
      forward: true,
      backward: true,
      factor: 1,
    })
  })

  it('a cycleway needs a foot tag', () => {
    expect(footProfile.wayRule({ highway: 'cycleway' })).toBeUndefined()
    expect(footProfile.wayRule({ highway: 'cycleway', foot: 'yes' })).toBeDefined()
  })

  it('ignores oneway, except oneway:foot', () => {
    expect(footProfile.wayRule({ highway: 'residential', oneway: 'yes' })).toMatchObject({
      forward: true,
      backward: true,
    })
    expect(footProfile.wayRule({ highway: 'footway', 'oneway:foot': 'yes' })).toMatchObject({
      forward: true,
      backward: false,
    })
  })

  it('area=yes pedestrian areas are walkable', () => {
    expect(footProfile.wayRule({ highway: 'pedestrian', area: 'yes' })).toMatchObject({ factor: 1 })
  })

  it('steps are routable at a little more than a footway', () => {
    expect(footProfile.wayRule({ highway: 'steps' })?.factor).toBeCloseTo(1.3)
  })

  it('motorways are not routable', () => {
    expect(footProfile.wayRule({ highway: 'motorway_link' })).toBeUndefined()
  })

  it('ignores turn restrictions; bicycle obeys them except with except=bicycle', () => {
    expect(footProfile.restrictions).toBe(false)
    expect(bicycleProfile.restrictions).toBe(true)
    expect(bicycleProfile.exceptValue).toBe('bicycle')
  })

  it('is listed under its name', () => {
    expect(profiles.foot).toBe(footProfile)
    expect(profiles.bicycle).toBe(bicycleProfile)
  })
})
