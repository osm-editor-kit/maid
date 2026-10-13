/**
 * "Show in the viewer" for an id of an image key. The one request is the Mapillary Graph API for that id, and it
 * is made only when the person clicks: nothing is requested in an automated browser or without a token. Panoramax
 * is not opened by id yet (the package reads a photo from its sequence, which an id does not give).
 */
import {
  fetchMapillaryImages,
  type MapillaryImageDetails,
  type NormalizedPhoto,
} from '@osm-editor-kit/street-imagery'
import { providerOfKey } from './image-keys.ts'
import { useStreetImageryStore } from './store.ts'

/** The reason "show" is off for a key, or null when it works. Pure apart from the arguments. */
export function showBlockedReason(key: string, mapillaryToken: string, automated: boolean) {
  if (automated) return 'Photos are off in automated browsers'
  const provider = providerOfKey(key)
  if (provider === 'panoramax') return 'Panoramax photos cannot be opened by id yet'
  if (provider === 'mapillary' && mapillaryToken.trim() === '') {
    return 'Mapillary needs a token in this build'
  }
  return null
}

/** A photo as the viewer takes it, from the Graph API's details. Null when Mapillary gave no position. */
export function mapillaryPhoto(details: MapillaryImageDetails): NormalizedPhoto | null {
  if (details.lngLat === null) return null
  return {
    providerId: 'mapillary',
    photoId: details.id,
    sequenceId: details.sequenceId,
    capturedAt: details.capturedAt,
    isPano: details.isPano,
    heading: details.heading,
    lngLat: details.lngLat,
    originalLngLat: details.originalLngLat ?? undefined,
    creatorId: details.creatorId ?? undefined,
    creatorName: details.username ?? undefined,
  }
}

/**
 * Loads the photo of one id and opens it in the dock's viewer. Returns the message to show, or null when the photo
 * is open. The dock's Photos tab is not opened from here (the dock keeps its tab to itself).
 */
export async function openImageById(id: string) {
  const [details] = await fetchMapillaryImages([id])
  if (details === undefined) return 'Mapillary has no image with this id'
  const photo = mapillaryPhoto(details)
  if (photo === null) return 'Mapillary gave no position for this image'
  useStreetImageryStore.getState().showPhoto(photo)
  return null
}
