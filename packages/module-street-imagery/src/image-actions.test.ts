import { describe, expect, it } from 'bun:test'
import {
  canOpenPhotoById,
  fetchPhotoById,
  mapillaryPhoto,
  showBlockedReason,
} from './image-actions.ts'

describe('showBlockedReason', () => {
  it('blocks every show in an automated browser', () => {
    expect(showBlockedReason('mapillary', 'token', true)).toBe(
      'Photos are off in automated browsers',
    )
  })

  it('blocks Panoramax, and Mapillary without a token', () => {
    expect(showBlockedReason('panoramax', 'token', false)).toBe(
      'Panoramax photos cannot be opened by id yet',
    )
    expect(showBlockedReason('mapillary:forward', '', false)).toBe(
      'Mapillary needs a token in this build',
    )
  })

  it('allows Mapillary with a token', () => {
    expect(showBlockedReason('cycleway:left:mapillary', 'token', false)).toBeNull()
  })
})

describe('mapillaryPhoto', () => {
  const details = {
    id: '42',
    capturedAt: 1_700_000_000_000,
    isPano: false,
    lngLat: [13.4, 52.5] as [number, number],
    originalLngLat: null,
    heading: 90,
    username: 'mapper',
    creatorId: '7',
    sequenceId: 'seq',
  }

  it('takes the position Mapillary computed, and the creator', () => {
    expect(mapillaryPhoto(details)).toEqual({
      providerId: 'mapillary',
      photoId: '42',
      sequenceId: 'seq',
      capturedAt: 1_700_000_000_000,
      isPano: false,
      heading: 90,
      lngLat: [13.4, 52.5],
      originalLngLat: undefined,
      creatorId: '7',
      creatorName: 'mapper',
    })
  })

  it('gives no photo without a position', () => {
    expect(mapillaryPhoto({ ...details, lngLat: null })).toBeNull()
  })
})

describe('canOpenPhotoById', () => {
  it('never opens by id in an automated browser, whatever the provider', () => {
    expect(canOpenPhotoById('mapillary', 'token', true)).toBe(false)
    expect(canOpenPhotoById('panoramax', 'token', true)).toBe(false)
  })

  it('opens Mapillary by id with a token, and no other provider yet', () => {
    expect(canOpenPhotoById('mapillary', 'token', false)).toBe(true)
    expect(canOpenPhotoById('mapillary', '', false)).toBe(false)
    expect(canOpenPhotoById('panoramax', 'token', false)).toBe(false)
  })
})

describe('fetchPhotoById', () => {
  it('resolves to null without a request when the photo cannot be opened by id', async () => {
    // an automated browser and Panoramax both return before any request is made
    expect(await fetchPhotoById('mapillary', '42', 'token', true)).toBeNull()
    expect(await fetchPhotoById('panoramax', 'abc', 'token', false)).toBeNull()
    expect(await fetchPhotoById('mapillary', '42', '', false)).toBeNull()
  })
})
