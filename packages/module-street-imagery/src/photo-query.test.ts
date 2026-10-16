import { describe, expect, it } from 'bun:test'
import { HttpError } from '@osm-editor-kit/maid-core'
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { QueryClient } from '@tanstack/react-query'
import {
  PhotoNotFoundError,
  photoFailureMessage,
  photoKey,
  photoQueryOptions,
  seedPhoto,
} from './photo-query.ts'

const ref = { providerId: 'panoramax' as const, photoId: 'abc' }

const photo: NormalizedPhoto = {
  providerId: 'panoramax',
  photoId: 'abc',
  sequenceId: 'seq',
  capturedAt: null,
  isPano: null,
  heading: null,
  lngLat: [13.4, 52.5],
}

describe('photoKey', () => {
  it('is per provider and id', () => {
    expect(photoKey(ref)).toEqual(['street-imagery', 'photo', 'panoramax', 'abc'])
    expect(photoKey({ providerId: 'mapillary', photoId: 'abc' })).not.toEqual(photoKey(ref))
  })
})

describe('seedPhoto', () => {
  it('puts the photo in its own query, where the query reads it', () => {
    const queries = new QueryClient()
    seedPhoto(queries, ref, photo)
    expect(queries.getQueryData<NormalizedPhoto>(photoKey(ref))).toBe(photo)
    const other = { providerId: 'panoramax' as const, photoId: 'other' }
    expect(queries.getQueryData<NormalizedPhoto>(photoKey(other))).toBeUndefined()
  })

  it('a seeded photo is returned without the query function running (no request)', async () => {
    const queries = new QueryClient()
    seedPhoto(queries, ref, photo)
    // token '' makes the query function refuse without a request; the seed must answer first
    const options = { ...photoQueryOptions(ref, ''), retry: false }
    expect(await queries.fetchQuery(options)).toBe(photo)
  })

  it('an unseeded photo with no token is not found, and the error is not retried', async () => {
    const queries = new QueryClient()
    const options = { ...photoQueryOptions(ref, ''), retry: false }
    const error = await queries.fetchQuery(options).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(PhotoNotFoundError)
  })
})

describe('photoFailureMessage', () => {
  it('names the provider for a missing photo, an HTTP failure and any other', () => {
    expect(photoFailureMessage(new PhotoNotFoundError('mapillary'), 'mapillary')).toBe(
      'Mapillary has no photo with this id.',
    )
    expect(
      photoFailureMessage(new HttpError(503, 'https://api.panoramax.xyz/x'), 'panoramax'),
    ).toBe('The photo could not be loaded from Panoramax (HTTP 503).')
    expect(photoFailureMessage(new Error('offline'), 'panoramax')).toBe(
      'The photo could not be loaded from Panoramax.',
    )
  })
})
