import { describe, expect, it } from 'bun:test'
import {
  IMAGE_KEYS,
  OFFERED_KEYS,
  appendId,
  defaultKey,
  idFromText,
  imageKeysWithValue,
  isImageKey,
  joinIds,
  keyLabel,
  planUse,
  providerOfKey,
  removeId,
  splitIds,
  targetKey,
} from './image-keys.ts'

const PANORAMAX_UUID = '8f2e0c1a-1b2c-4d3e-8f90-123456789abc'

describe('OFFERED_KEYS', () => {
  it('lists each key once, as valid image keys of IMAGE_KEYS', () => {
    expect(new Set(OFFERED_KEYS).size).toBe(OFFERED_KEYS.length)
    for (const key of OFFERED_KEYS) {
      expect(isImageKey(key)).toBe(true)
      expect(IMAGE_KEYS).toContain(key)
    }
  })

  it('offers the keys the viewers read, and the Panoramax keys', () => {
    expect(OFFERED_KEYS).toContain('mapillary')
    expect(OFFERED_KEYS).toContain('source:cycleway:right:traffic_sign:mapillary')
    expect(OFFERED_KEYS).toContain('panoramax:2')
    expect(OFFERED_KEYS.length).toBe(14)
  })
})

describe('IMAGE_KEYS and isImageKey', () => {
  it('lists each key once: the 216 Mapillary keys of the grammar and four Panoramax keys', () => {
    expect(new Set(IMAGE_KEYS).size).toBe(IMAGE_KEYS.length)
    expect(IMAGE_KEYS.length).toBe(220)
    expect(IMAGE_KEYS).toContain('mapillary:forward')
    expect(IMAGE_KEYS).toContain('source:cycleway:right:traffic_sign:mapillary')
    expect(IMAGE_KEYS).toContain('cycleway:both:traffic_sign:backward:mapillary')
    expect(IMAGE_KEYS).toContain('source:traffic_sign:forward:mapillary')
  })

  it('accepts the keys of the fork and numbered keys', () => {
    for (const key of [
      'mapillary',
      'source:mapillary:backward',
      'cycleway:left:traffic_sign:mapillary',
      'source:sidewalk:right:traffic_sign:mapillary',
      'mapillary:1',
      'panoramax',
      'panoramax:2',
    ]) {
      expect(isImageKey(key)).toBe(true)
    }
  })

  it('rejects keys that are not image keys: years, other meanings, other keys', () => {
    for (const key of [
      'mapillary:2019',
      'mapillary:image',
      'mapillary:map_feature',
      'mapillary:addr',
      'was:mapillary',
      'mapillary_url',
      'panoramax:12345',
      'name',
    ]) {
      expect(isImageKey(key)).toBe(false)
    }
  })

  it('names the provider of a key', () => {
    expect(providerOfKey('cycleway:right:mapillary')).toBe('mapillary')
    expect(providerOfKey('panoramax:1')).toBe('panoramax')
    expect(defaultKey('mapillary')).toBe('mapillary')
    expect(defaultKey('panoramax')).toBe('panoramax')
  })
})

describe('keyLabel', () => {
  it('builds the label from the parts of the key', () => {
    expect(keyLabel('mapillary')).toBe('Photo of the way')
    expect(keyLabel('cycleway:right:mapillary')).toBe('Right bike lane')
    expect(keyLabel('cycleway:both:mapillary:backward')).toBe('Both sides bike lane · backward')
    expect(keyLabel('source:traffic_sign:mapillary')).toBe('traffic sign (source)')
    expect(keyLabel('sidewalk:left:traffic_sign:forward:mapillary')).toBe(
      'Left sidewalk · traffic sign forward',
    )
    expect(keyLabel('mapillary:2')).toBe('Photo of the way · no. 2')
    expect(keyLabel('panoramax:1')).toBe('Panoramax 1')
  })
})

describe('ids in a value', () => {
  it('splits at ; and drops empty parts', () => {
    expect(splitIds('a; b ;;c')).toEqual(['a', 'b', 'c'])
    expect(splitIds(undefined)).toEqual([])
    expect(joinIds(['a', 'b'])).toBe('a;b')
  })

  it('appends an id unless it is there already', () => {
    expect(appendId(undefined, 'x')).toBe('x')
    expect(appendId('a', 'b')).toBe('a;b')
    expect(appendId('a;b', 'a')).toBe('a;b')
  })

  it('removes an id, and reports no value when none is left', () => {
    expect(removeId('a;b', 'a')).toBe('b')
    expect(removeId('a', 'a')).toBeUndefined()
  })

  it('lists the keys with a value: the offered ones first, in their order', () => {
    expect(
      imageKeysWithValue({
        panoramax: PANORAMAX_UUID,
        'source:mapillary': '5',
        mapillary: '1;2',
        'mapillary:image': 'not an image key',
        'cycleway:right:mapillary': '',
      }),
    ).toEqual(['mapillary', 'source:mapillary', 'panoramax'])
  })
})

describe('idFromText', () => {
  it('takes a Mapillary id, with spaces around it', () => {
    expect(idFromText('mapillary', '  123456789  ')).toEqual({ id: '123456789' })
  })

  it('takes the id from the Mapillary links', () => {
    expect(
      idFromText('mapillary', 'https://www.mapillary.com/app/?pKey=987654321&focus=photo'),
    ).toEqual({
      id: '987654321',
    })
    expect(idFromText('mapillary', 'https://www.mapillary.com/map/im/55')).toEqual({ id: '55' })
  })

  it('rejects other hosts, other text and an empty text', () => {
    expect(idFromText('mapillary', 'https://example.com/?pKey=1')).toEqual({
      error: 'Not a Mapillary link',
    })
    expect(idFromText('mapillary', 'abc')).toEqual({ error: 'Not a Mapillary id' })
    expect(idFromText('mapillary', '   ')).toEqual({ error: 'Type an id or paste a link' })
  })

  it('takes a Panoramax id from a plain id or a link, in lower case', () => {
    expect(idFromText('panoramax', PANORAMAX_UUID.toUpperCase())).toEqual({ id: PANORAMAX_UUID })
    expect(
      idFromText('panoramax', `https://panoramax.example/#pic=${PANORAMAX_UUID}&focus=pic`),
    ).toEqual({ id: PANORAMAX_UUID })
    expect(idFromText('panoramax', 'https://panoramax.example/?pic=nope')).toEqual({
      error: 'No Panoramax photo in this link',
    })
  })
})

describe('targetKey and planUse', () => {
  const tags = { mapillary: '1', 'mapillary:forward': '2' }

  it('writes to the active row when it is a key of the photo provider in the same feature', () => {
    expect(targetKey('mapillary', { rowId: 'r1', key: 'mapillary:forward' }, 'r1')).toBe(
      'mapillary:forward',
    )
  })

  it('falls back to the default key for another feature, another provider or no active row', () => {
    expect(targetKey('mapillary', { rowId: 'r1', key: 'mapillary:forward' }, 'r2')).toBe(
      'mapillary',
    )
    expect(targetKey('mapillary', { rowId: 'r1', key: 'panoramax' }, 'r1')).toBe('mapillary')
    expect(targetKey('panoramax', null, 'r1')).toBe('panoramax')
  })

  it('appends the photo to the key, or says why it cannot', () => {
    expect(
      planUse({ photoId: '9', provider: 'mapillary', active: null, writer: { rowId: 'r', tags } }),
    ).toEqual({ ok: true, key: 'mapillary', value: '1;9' })
    expect(
      planUse({ photoId: '1', provider: 'mapillary', active: null, writer: { rowId: 'r', tags } }),
    ).toEqual({ ok: false, key: 'mapillary', reason: 'mapillary already has this photo' })
    expect(planUse({ photoId: '9', provider: 'mapillary', active: null, writer: null })).toEqual({
      ok: false,
      reason: 'Select a feature that shows the Street-level images field',
    })
  })

  it('uses the active row as the target when it is set', () => {
    expect(
      planUse({
        photoId: '9',
        provider: 'mapillary',
        active: { rowId: 'r', key: 'mapillary:forward' },
        writer: { rowId: 'r', tags },
      }),
    ).toEqual({ ok: true, key: 'mapillary:forward', value: '2;9' })
  })
})
