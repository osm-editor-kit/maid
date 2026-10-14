import { describe, expect, test } from 'bun:test'
import { fieldOverlayFor, parseWidthMetres, roadWidthMetres, widthKeyTarget } from './field-overlay'

const focus = (key: string, value: string | undefined, side?: 'left' | 'right' | 'both') => ({
  fieldId: 'f',
  key,
  value,
  side,
})

describe('parseWidthMetres', () => {
  test('accepts a dot or a comma, with or without the metre unit', () => {
    expect(parseWidthMetres('3.5')).toBe(3.5)
    expect(parseWidthMetres('3,5')).toBe(3.5)
    expect(parseWidthMetres('3.5 m')).toBe(3.5)
    expect(parseWidthMetres(' 2m ')).toBe(2)
    expect(parseWidthMetres('3.')).toBe(3)
  })

  test('ignores other units, text, zero and nothing', () => {
    expect(parseWidthMetres('350 cm')).toBeUndefined()
    expect(parseWidthMetres('3 ft')).toBeUndefined()
    expect(parseWidthMetres('wide')).toBeUndefined()
    expect(parseWidthMetres('0')).toBeUndefined()
    expect(parseWidthMetres('')).toBeUndefined()
    expect(parseWidthMetres(undefined)).toBeUndefined()
  })
})

describe('widthKeyTarget (the fork: width_tags.ts)', () => {
  test('the way and the sides of a lane or sidewalk', () => {
    expect(widthKeyTarget('width')).toEqual({ kind: 'way' })
    expect(widthKeyTarget('est_width')).toEqual({ kind: 'way' })
    expect(widthKeyTarget('cycleway:left:width')).toEqual({ kind: 'side', side: 'left' })
    expect(widthKeyTarget('sidewalk:both:width')).toEqual({ kind: 'side', side: 'both' })
  })

  test('other keys are not width keys', () => {
    expect(widthKeyTarget('surface')).toBeUndefined()
    expect(widthKeyTarget('cycleway:width')).toBeUndefined()
    expect(widthKeyTarget('width:effective')).toBeUndefined()
  })
})

describe('roadWidthMetres (the fork: default widths by highway)', () => {
  test('the width tag wins, in metres, centimetres or kilometres', () => {
    expect(roadWidthMetres({ highway: 'residential', width: '6.5' })).toBe(6.5)
    expect(roadWidthMetres({ highway: 'residential', width: '650 cm' })).toBe(6.5)
    expect(roadWidthMetres({ highway: 'residential', est_width: '7' })).toBe(7)
  })

  test('else the default by highway, and by oneway', () => {
    expect(roadWidthMetres({ highway: 'primary' })).toBe(18)
    expect(roadWidthMetres({ highway: 'primary', oneway: 'yes' })).toBe(12)
    // a motorway is oneway unless tagged oneway=no (the fork's isOneway)
    expect(roadWidthMetres({ highway: 'motorway' })).toBe(15)
    expect(roadWidthMetres({ highway: 'motorway', oneway: 'no' })).toBe(22)
    expect(roadWidthMetres({ highway: 'motorway_link' })).toBe(9)
    expect(roadWidthMetres({ highway: 'service' })).toBe(4)
  })

  test('an unknown highway, or none, is 10 m', () => {
    expect(roadWidthMetres({ highway: 'unknown_thing' })).toBe(10)
    expect(roadWidthMetres({})).toBe(10)
  })
})

describe('fieldOverlayFor', () => {
  const road = { highway: 'residential', width: '6' }

  test('a directional side is a side line', () => {
    expect(fieldOverlayFor(focus('cycleway:left', 'lane', 'left'), road)).toEqual({
      kind: 'side',
      side: 'left',
    })
  })

  test('a width key is a band around the way', () => {
    expect(fieldOverlayFor(focus('width', '3.5'), road)).toEqual({ kind: 'width', metres: 3.5 })
  })

  test('a side width is a band from the road edge: half the width tag out', () => {
    expect(fieldOverlayFor(focus('cycleway:right:width', '1,5'), road)).toEqual({
      kind: 'width',
      metres: 1.5,
      side: 'right',
      offsetMetres: 3,
    })
  })

  test('a side width without a width tag starts at half the default road width', () => {
    expect(fieldOverlayFor(focus('sidewalk:both:width', '2'), { highway: 'primary' })).toEqual({
      kind: 'width',
      metres: 2,
      side: 'both',
      offsetMetres: 9,
    })
  })

  test('no overlay for a width in another unit, an empty value or an unrelated key', () => {
    expect(fieldOverlayFor(focus('width', '350 cm'), road)).toBeNull()
    expect(fieldOverlayFor(focus('width', ''), road)).toBeNull()
    expect(fieldOverlayFor(focus('surface', 'asphalt'), road)).toBeNull()
    expect(fieldOverlayFor(null, road)).toBeNull()
  })
})

describe('fieldOverlayFor: parking keys', () => {
  test('shows the side of a parking key without a side on the focus', () => {
    expect(fieldOverlayFor(focus('parking:left:orientation', 'parallel'), undefined)).toEqual({
      kind: 'side',
      side: 'left',
    })
    expect(fieldOverlayFor(focus('parking:right', 'lane'), undefined)).toEqual({
      kind: 'side',
      side: 'right',
    })
    expect(fieldOverlayFor(focus('parking:both:fee:conditional', ''), undefined)).toEqual({
      kind: 'side',
      side: 'both',
    })
  })

  test('takes the focus side when the control has one, and ignores other parking keys', () => {
    expect(fieldOverlayFor(focus('parking:left', 'lane', 'both'), undefined)).toEqual({
      kind: 'side',
      side: 'both',
    })
    expect(fieldOverlayFor(focus('parking:condition', 'free'), undefined)).toBeNull()
    expect(fieldOverlayFor(focus('parking:lane:left', 'x'), undefined)).toBeNull()
    expect(fieldOverlayFor(focus('amenity', 'parking'), undefined)).toBeNull()
  })
})
