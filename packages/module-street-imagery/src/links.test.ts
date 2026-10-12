import { describe, expect, it } from 'bun:test'
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { photoPageLink } from './links.ts'

/** Only the fields the link reads; the rest of a photo is not needed here */
function photo(providerId: NormalizedPhoto['providerId'], photoId: string): NormalizedPhoto {
  return { providerId, photoId, lngLat: [13.4, 52.5] } as unknown as NormalizedPhoto
}

describe('photoPageLink', () => {
  it('links a Mapillary photo to its page on mapillary.com and names the site', () => {
    expect(photoPageLink(photo('mapillary', 'abc123'))).toEqual({
      href: 'https://www.mapillary.com/app/?pKey=abc123&focus=photo',
      label: 'Open on Mapillary',
    })
  })

  it('escapes the photo id in the link', () => {
    expect(photoPageLink(photo('mapillary', 'a b&c')).href).toBe(
      'https://www.mapillary.com/app/?pKey=a%20b%26c&focus=photo',
    )
  })

  it('names a Panoramax photo Panoramax', () => {
    expect(photoPageLink(photo('panoramax', 'p-1')).label).toBe('Open on Panoramax')
  })
})
