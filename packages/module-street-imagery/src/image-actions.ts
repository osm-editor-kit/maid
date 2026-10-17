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
import { m } from './messages.ts'
import { streetImageryActions } from './street-imagery-store.ts'

/** The reason "show" is off for a key, or null when it works. Pure apart from the arguments. */
export function showBlockedReason(
  key: string,
  mapillaryToken: string,
  automated: boolean,
): string | null {
  if (automated) return m.action_automated_off()
  const provider = providerOfKey(key)
  if (provider === 'panoramax') return m.action_panoramax_by_id()
  if (provider === 'mapillary' && mapillaryToken === '') {
    return m.action_mapillary_token()
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
export async function openImageById(id: string): Promise<string | null> {
  const [details] = await fetchMapillaryImages([id])
  if (details === undefined) return m.action_mapillary_no_image()
  const photo = mapillaryPhoto(details)
  if (photo === null) return m.action_mapillary_no_position()
  streetImageryActions.showPhoto({ providerId: 'mapillary', photoId: photo.photoId }, photo)
  return null
}

/**
 * Whether a photo can be opened by its id now: Mapillary with a token, and never in an automated browser. Panoramax
 * cannot be opened by id yet (see `showBlockedReason`). Pure.
 */
export function canOpenPhotoById(providerId: string, mapillaryToken: string, automated: boolean) {
  if (automated) return false
  return providerId === 'mapillary' && mapillaryToken !== ''
}

/**
 * The photo of a URL's `provider/id`, loaded for the viewer, or null when it cannot be opened by id. The request is
 * made only when `canOpenPhotoById` says so: nothing is requested in an automated browser (AGENTS.md, core rule 1).
 */
export async function fetchPhotoById(
  providerId: string,
  photoId: string,
  mapillaryToken: string,
  automated: boolean,
): Promise<NormalizedPhoto | null> {
  if (!canOpenPhotoById(providerId, mapillaryToken, automated)) return null
  const [details] = await fetchMapillaryImages([photoId])
  return details === undefined ? null : mapillaryPhoto(details)
}
