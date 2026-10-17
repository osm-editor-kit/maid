import { describe, expect, test } from 'bun:test'
import {
  handleOf,
  ID_PHOTO,
  ID_PHOTO_DATES,
  ID_PHOTO_OVERLAY,
  ID_PHOTO_TYPE,
  PHOTO_HANDLES,
  PHOTO_PARAM_DECLARATIONS,
  parseAsPhoto,
  parseAsPhotoDates,
  parseAsPhotoOverlay,
  parseAsPhotoType,
  refOf,
  shownPhotoRef,
  switchOffCloses,
} from './url.ts'

describe('iD names', () => {
  test('the four parameters carry iD names, which Maid writes too', () => {
    expect(
      [ID_PHOTO_TYPE, ID_PHOTO_OVERLAY, ID_PHOTO_DATES, ID_PHOTO].map((item) => item.name),
    ).toEqual(['photo_type', 'photo_overlay', 'photo_dates', 'photo'])
  })
})

describe('photo_type', () => {
  test('iD values map to Maid kinds, and back', () => {
    expect(parseAsPhotoType.parse('flat')).toBe('flat')
    expect(parseAsPhotoType.parse('panoramic')).toBe('pano')
    expect(parseAsPhotoType.parse('flat,panoramic')).toBe('all')
    expect(parseAsPhotoType.parse('panoramic,flat')).toBe('all')
    expect(parseAsPhotoType.parse('flat;panoramic')).toBe('all')
    for (const kind of ['all', 'flat', 'pano'] as const) {
      expect(parseAsPhotoType.parse(parseAsPhotoType.serialize(kind))).toBe(kind)
    }
    expect(parseAsPhotoType.serialize('all')).toBe('flat,panoramic')
  })

  test('an unknown value is no opinion', () => {
    expect(parseAsPhotoType.parse('sphere')).toBeNull()
    expect(parseAsPhotoType.parse('')).toBeNull()
  })
})

describe('photo_overlay', () => {
  test('the providers on, in the order chosen; iD layers Maid does not have are left out', () => {
    expect(parseAsPhotoOverlay.parse('mapillary,panoramax')).toEqual(['mapillary', 'panoramax'])
    expect(parseAsPhotoOverlay.parse('panoramax,kartaview,mapillary-signs,panoramax')).toEqual([
      'panoramax',
    ])
  })

  test('none is the explicit empty list, and a list with no provider of Maid is no opinion', () => {
    expect(parseAsPhotoOverlay.parse('none')).toEqual([])
    expect(parseAsPhotoOverlay.parse('kartaview')).toBeNull()
    expect(parseAsPhotoOverlay.parse('')).toBeNull()
  })

  test('the round trip keeps the order, and an empty list stays empty', () => {
    expect(parseAsPhotoOverlay.serialize(['panoramax', 'mapillary'])).toBe('panoramax,mapillary')
    expect(parseAsPhotoOverlay.parse(parseAsPhotoOverlay.serialize([]))).toEqual([])
    expect(parseAsPhotoOverlay.parse(parseAsPhotoOverlay.serialize(['mapillary']))).toEqual([
      'mapillary',
    ])
  })
})

describe('photo_dates', () => {
  test('from_to, each side a day; an invalid side is left out', () => {
    expect(parseAsPhotoDates.parse('2019-01-01_2020-12-31')).toEqual({
      from: '2019-01-01',
      to: '2020-12-31',
    })
    expect(parseAsPhotoDates.parse('2019-01-01_')).toEqual({ from: '2019-01-01' })
    expect(parseAsPhotoDates.parse('_2020-12-31')).toEqual({ to: '2020-12-31' })
    expect(parseAsPhotoDates.parse('2024-04-01_2023-02-30')).toEqual({ from: '2024-04-01' })
  })

  test('the en dash divides too, as iD allows', () => {
    expect(parseAsPhotoDates.parse('2019-01-01–2020-12-31')).toEqual({
      from: '2019-01-01',
      to: '2020-12-31',
    })
  })

  test('_ is no limit (explicit); garbage is no opinion', () => {
    expect(parseAsPhotoDates.parse('_')).toEqual({})
    expect(parseAsPhotoDates.parse('yesterday_today')).toBeNull()
    expect(parseAsPhotoDates.parse('2019-01-01')).toBeNull()
    expect(parseAsPhotoDates.parse('')).toBeNull()
  })

  test('the round trip: a limit, one side, and no limit', () => {
    for (const dates of [
      { from: '2019-01-01', to: '2020-12-31' },
      { from: '2019-01-01' },
      { to: '2020-12-31' },
      {},
    ]) {
      expect(parseAsPhotoDates.parse(parseAsPhotoDates.serialize(dates))).toEqual(dates)
    }
    expect(parseAsPhotoDates.serialize({})).toBe('_')
  })
})

describe('photo', () => {
  test('provider/id, the first of a list; only Maid providers', () => {
    expect(parseAsPhoto.parse('mapillary/1234567890')).toEqual({
      providerId: 'mapillary',
      photoId: '1234567890',
    })
    expect(parseAsPhoto.parse('panoramax/abc-def;mapillary/1')).toEqual({
      providerId: 'panoramax',
      photoId: 'abc-def',
    })
    expect(parseAsPhoto.parse('streetside/1')).toBeNull()
    expect(parseAsPhoto.parse('mapillary/')).toBeNull()
    expect(parseAsPhoto.parse('mapillary')).toBeNull()
  })

  test('the round trip', () => {
    const ref = { providerId: 'panoramax' as const, photoId: 'x-1' }
    expect(parseAsPhoto.serialize(ref)).toBe('panoramax/x-1')
    expect(parseAsPhoto.parse(parseAsPhoto.serialize(ref))).toEqual(ref)
  })
})

describe('declarations and handles', () => {
  test('the module declares the four parameters under their iD names, replaced in history', () => {
    const declared = Object.values(PHOTO_PARAM_DECLARATIONS)
    expect(declared.map((item) => item.name)).toEqual([
      'photo_type',
      'photo_overlay',
      'photo_dates',
      'photo',
    ])
    expect(declared.map((item) => item.iD?.name)).toEqual(declared.map((item) => item.name))
    expect(declared.every((item) => item.options?.history === 'replace')).toBe(true)
    expect(PHOTO_PARAM_DECLARATIONS.type.options).toEqual({
      history: 'replace',
      clearOnDefault: false,
    })
    expect(PHOTO_PARAM_DECLARATIONS.overlay.options).toEqual({ history: 'replace' })
  })

  test('a handle takes the core default (replace) when the declaration names no history', () => {
    const handle = handleOf({ name: 'x', parser: parseAsPhotoType })
    expect(handle.options).toEqual({ history: 'replace' })
    expect(
      handleOf({ name: 'x', parser: parseAsPhotoType, options: { history: 'push' } }).options,
    ).toEqual({
      history: 'push',
    })
  })

  test('the handles are the declarations, built once', () => {
    expect(PHOTO_HANDLES.photo.name).toBe('photo')
    expect(PHOTO_HANDLES.dates.options.history).toBe('replace')
    expect(PHOTO_HANDLES.type.options.clearOnDefault).toBe(false)
  })
})

describe('shownPhotoRef', () => {
  const mapillary = { providerId: 'mapillary' as const, photoId: '1' }

  test('no URL photo shows nothing', () => {
    expect(shownPhotoRef(null, ['mapillary'])).toBeNull()
  })

  test('the URL photo shows while its provider is on', () => {
    expect(shownPhotoRef(mapillary, ['panoramax', 'mapillary'])).toEqual(mapillary)
  })

  test('a URL photo whose provider is off waits: it shows once the provider comes on', () => {
    expect(shownPhotoRef(mapillary, [])).toBeNull()
    expect(shownPhotoRef(mapillary, ['panoramax'])).toBeNull()
  })

  test('a URL photo that can be opened by its id shows while its provider is off', () => {
    expect(shownPhotoRef(mapillary, [], ['mapillary'])).toEqual(mapillary)
    expect(shownPhotoRef(mapillary, ['panoramax'], ['mapillary'])).toEqual(mapillary)
  })

  test('a photo of another provider does not show because the Mapillary one can be opened', () => {
    const panoramax = { providerId: 'panoramax' as const, photoId: 'abc' }
    expect(shownPhotoRef(panoramax, [], ['mapillary'])).toBeNull()
  })
})

describe('switchOffCloses', () => {
  const mapillary = { providerId: 'mapillary' as const, photoId: '1' }

  test('switching the photo provider off closes its photo', () => {
    expect(switchOffCloses(mapillary, ['mapillary', 'panoramax'], ['panoramax'])).toBe(true)
  })

  test('switching another provider does not close it, nor switching the provider on', () => {
    expect(switchOffCloses(mapillary, ['mapillary'], ['mapillary', 'panoramax'])).toBe(false)
    expect(switchOffCloses(mapillary, ['panoramax'], ['panoramax', 'mapillary'])).toBe(false)
    expect(switchOffCloses(mapillary, ['mapillary'], ['panoramax'])).toBe(true)
  })

  test('a waiting photo (its provider was never on) is not closed; no photo closes nothing', () => {
    expect(switchOffCloses(mapillary, [], ['panoramax'])).toBe(false)
    expect(switchOffCloses(null, ['mapillary'], [])).toBe(false)
  })
})

describe('refOf', () => {
  test('a Maid provider gives its reference', () => {
    const photo = { providerId: 'panoramax', photoId: 'a', sequenceId: null }
    expect(refOf(photo)).toEqual({
      providerId: 'panoramax',
      photoId: 'a',
    })
  })

  test('another provider gives none', () => {
    expect(refOf({ providerId: 'kartaview', photoId: '9' })).toBeNull()
  })
})
