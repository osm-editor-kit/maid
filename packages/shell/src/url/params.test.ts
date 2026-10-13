import { describe, expect, test } from 'bun:test'
import { parseAsCamera } from './params.ts'

describe('map=: zoom/lat/lng, then the turn and the tilt when they are not zero', () => {
  test('three parts, as before: north-up and flat', () => {
    const camera = parseAsCamera.parse('17.25/52.5228/13.4023')
    expect(camera).toEqual({ zoom: 17.25, lat: 52.5228, lng: 13.4023 })
    expect(parseAsCamera.serialize({ zoom: 17.25, lat: 52.5228, lng: 13.4023 })).toBe(
      '17.25/52.52280/13.40230',
    )
  })

  test('a fourth part is the turn, and a turn is written as the fourth part', () => {
    const camera = parseAsCamera.parse('18/52.389/13.4/-37.5')
    expect(camera).toEqual({ zoom: 18, lat: 52.389, lng: 13.4, bearing: -37.5 })
    expect(parseAsCamera.serialize({ zoom: 18, lat: 52.389, lng: 13.4, bearing: -37.5 })).toBe(
      '18.00/52.38900/13.40000/-37.5',
    )
  })

  test('a fifth part is the tilt, and a tilt is written with the turn, even a zero turn', () => {
    const camera = parseAsCamera.parse('18/52.389/13.4/0/30')
    expect(camera).toEqual({ zoom: 18, lat: 52.389, lng: 13.4, bearing: 0, pitch: 30 })
    expect(
      parseAsCamera.serialize({ zoom: 18, lat: 52.389, lng: 13.4, bearing: 0, pitch: 30 }),
    ).toBe('18.00/52.38900/13.40000/0/30')
  })

  test('a zero turn and a zero tilt are left out', () => {
    expect(
      parseAsCamera.serialize({ zoom: 18, lat: 52.389, lng: 13.4, bearing: 0, pitch: 0 }),
    ).toBe('18.00/52.38900/13.40000')
    expect(parseAsCamera.serialize({ zoom: 18, lat: 52.389, lng: 13.4, bearing: 0.001 })).toBe(
      '18.00/52.38900/13.40000',
    )
  })

  test('a written turn reads back', () => {
    const camera = { zoom: 18, lat: 52.389, lng: 13.4, bearing: 37.5 }
    expect(parseAsCamera.parse(parseAsCamera.serialize(camera))).toEqual({
      ...camera,
      lat: 52.389,
      lng: 13.4,
    })
  })

  test('a turn out of range is brought into -180 to 180', () => {
    expect(parseAsCamera.parse('18/52.389/13.4/370')?.bearing).toBe(10)
  })

  test('a part that is not a number, or a tilt out of range, refuses the parameter', () => {
    expect(parseAsCamera.parse('18/52.389/13.4/north')).toBeNull()
    expect(parseAsCamera.parse('18/52.389/13.4/10/90')).toBeNull()
    expect(parseAsCamera.parse('18/52.389/13.4/10/-5')).toBeNull()
    expect(parseAsCamera.parse('18/95/13.4')).toBeNull()
  })

  test('the parameters are equal when the turn and the tilt are the same, zero or not given', () => {
    const plain = { zoom: 18, lat: 52.389, lng: 13.4 }
    expect(parseAsCamera.eq(plain, { ...plain, bearing: 0, pitch: 0 })).toBe(true)
    expect(parseAsCamera.eq(plain, { ...plain, bearing: 5 })).toBe(false)
  })
})
