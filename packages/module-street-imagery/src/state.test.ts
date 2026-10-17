import { describe, expect, it } from 'bun:test'
import {
  activeProviders,
  DAY,
  DEFAULT_STORED,
  openableProviders,
  parseStored,
  photoTypesOf,
  providerAvailable,
  toggleProvider,
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

describe('DAY', () => {
  it('accepts real calendar days only', () => {
    expect(DAY.safeParse('2024-02-29').success).toBe(true)
    expect(DAY.safeParse('2023-02-29').success).toBe(false)
    expect(DAY.safeParse('2024-2-9').success).toBe(false)
    expect(DAY.safeParse('2024-02-29T10:00').success).toBe(false)
    expect(DAY.safeParse(20240229).success).toBe(false)
  })
})

describe('providers', () => {
  it('offers Mapillary only with a token', () => {
    expect(providerAvailable('mapillary', undefined)).toBe(false)
    // the token is trimmed once, when the module is set up (index.ts): the helper takes it as stored
    expect(providerAvailable('mapillary', '')).toBe(false)
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

describe('openableProviders', () => {
  it('opens Mapillary by id with a token, whether or not it is switched on', () => {
    expect(openableProviders('MLY|x', false)).toEqual(['mapillary'])
    expect(openableProviders('', false)).toEqual([])
    expect(openableProviders(undefined, false)).toEqual([])
  })

  it('opens nothing in an automated browser, and never Panoramax (it cannot be opened by id yet)', () => {
    expect(openableProviders('MLY|x', true)).toEqual([])
    expect(openableProviders('MLY|x', false)).not.toContain('panoramax')
  })
})

describe('photoTypesOf', () => {
  it('maps the kind to the layers filter', () => {
    expect(photoTypesOf('all')).toBeUndefined()
    expect(photoTypesOf('flat')).toEqual(['flat'])
    expect(photoTypesOf('pano')).toEqual(['pano'])
  })
})

describe('toggleProvider', () => {
  it('switches a provider on last, and off without touching the others', () => {
    expect(toggleProvider(['panoramax'], 'mapillary', true)).toEqual(['panoramax', 'mapillary'])
    expect(toggleProvider(['panoramax', 'mapillary'], 'panoramax', false)).toEqual(['mapillary'])
  })

  it('keeps one entry when the provider is already on, and does not change its input', () => {
    const list = ['mapillary' as const]
    expect(toggleProvider(list, 'mapillary', true)).toEqual(['mapillary'])
    expect(toggleProvider(list, 'panoramax', false)).toEqual(['mapillary'])
    expect(list).toEqual(['mapillary'])
  })
})
