import { describe, expect, it } from 'bun:test'
import {
  activeProviders,
  DEFAULT_STORED,
  isDay,
  parseStored,
  photoTypesOf,
  providerAvailable,
} from './state.ts'

describe('parseStored', () => {
  it('returns the defaults for anything that is not an object', () => {
    expect(parseStored(null)).toEqual(DEFAULT_STORED)
    expect(parseStored('mapillary')).toEqual(DEFAULT_STORED)
    expect(parseStored([1, 2])).toEqual(DEFAULT_STORED)
    expect(parseStored(undefined)).toEqual(DEFAULT_STORED)
  })

  it('keeps valid values and drops the rest', () => {
    const stored = parseStored({
      providers: ['panoramax', 'kartaview', 'panoramax', 3, 'mapillary'],
      photoKind: 'pano',
      date: { from: '2024-04-01', to: '2024-02-30' },
    })
    expect(stored).toEqual({
      providers: ['panoramax', 'mapillary'],
      photoKind: 'pano',
      date: { from: '2024-04-01' },
    })
  })

  it('falls back to all photos for an unknown kind', () => {
    expect(parseStored({ photoKind: 'sphere' }).photoKind).toBe('all')
  })

  it('reads a stored object that has only some fields', () => {
    expect(parseStored({ providers: ['mapillary'] })).toEqual({
      providers: ['mapillary'],
      photoKind: 'all',
      date: {},
    })
  })
})

describe('isDay', () => {
  it('accepts real calendar days only', () => {
    expect(isDay('2024-02-29')).toBe(true)
    expect(isDay('2023-02-29')).toBe(false)
    expect(isDay('2024-2-9')).toBe(false)
    expect(isDay('2024-02-29T10:00')).toBe(false)
    expect(isDay(20240229)).toBe(false)
  })
})

describe('providers', () => {
  it('offers Mapillary only with a token', () => {
    expect(providerAvailable('mapillary', undefined)).toBe(false)
    expect(providerAvailable('mapillary', '   ')).toBe(false)
    expect(providerAvailable('mapillary', 'MLY|x')).toBe(true)
    expect(providerAvailable('panoramax', undefined)).toBe(true)
  })

  it('lists only the switched-on providers that are available', () => {
    expect(activeProviders(['mapillary', 'panoramax'], undefined, false)).toEqual(['panoramax'])
    expect(activeProviders(['mapillary', 'panoramax'], 'MLY|x', false)).toEqual([
      'panoramax',
      'mapillary',
    ])
    expect(activeProviders([], 'MLY|x', false)).toEqual([])
  })

  it('requests nothing in an automated browser', () => {
    expect(activeProviders(['mapillary', 'panoramax'], 'MLY|x', true)).toEqual([])
  })
})

describe('photoTypesOf', () => {
  it('maps the kind to the layers filter', () => {
    expect(photoTypesOf('all')).toBeUndefined()
    expect(photoTypesOf('flat')).toEqual(['flat'])
    expect(photoTypesOf('pano')).toEqual(['pano'])
  })
})
