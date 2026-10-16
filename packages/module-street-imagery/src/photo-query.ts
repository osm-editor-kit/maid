/**
 * The open photo's data: one TanStack query per photo (provider and id) in the editor's query client. The URL says which
 * photo is open (shown.ts); the photo itself is server data, so it lives here and not in the store. A photo the map or
 * a click already has is put in its query (`seedPhoto`), so opening it makes no request.
 *
 * Nothing here requests under automation: the query is disabled (`useOpenPhotoQuery`), and `fetchPhotoById` refuses.
 */
import { HttpError, retryDelayFor, SESSION_DATA, shouldRetry } from '@osm-editor-kit/maid-core'
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { fetchPhotoById } from './image-actions.ts'
import { PROVIDER_LABELS, type ImageryProviderId } from './state.ts'
import { AUTOMATED } from './street-imagery-store.ts'
import type { PhotoRef } from './url.ts'

/** The key of a photo's query. Its own prefix: the package's defaults (`provider-photos` ...) do not apply to it. */
export function photoKey(ref: PhotoRef) {
  return ['street-imagery', 'photo', ref.providerId, ref.photoId] as const
}

/** The provider gives no photo for this id (or cannot be asked for one by id yet). Not retried. */
export class PhotoNotFoundError extends Error {
  readonly providerId: string

  constructor(providerId: string) {
    super(`no photo from ${providerId} for this id`)
    this.name = 'PhotoNotFoundError'
    this.providerId = providerId
  }
}

/**
 * The photo's query. Session data (`SESSION_DATA`): a loaded photo stays for the visit, and a seeded one is never asked
 * again. Retries are the editor's rule, except that a missing photo is not asked again.
 */
export function photoQueryOptions(ref: PhotoRef, mapillaryToken: string) {
  return queryOptions({
    queryKey: photoKey(ref),
    queryFn: async () => {
      const photo = await fetchPhotoById(ref.providerId, ref.photoId, mapillaryToken, AUTOMATED)
      if (photo === null) throw new PhotoNotFoundError(ref.providerId)
      return photo
    },
    ...SESSION_DATA,
    retry: (failureCount: number, error: unknown) =>
      !(error instanceof PhotoNotFoundError) && shouldRetry(failureCount, error),
    retryDelay: retryDelayFor,
  })
}

/** Puts a photo the caller already has in its query, so that the photo is shown without a request */
export function seedPhoto(queries: QueryClient, ref: PhotoRef, photo: NormalizedPhoto) {
  queries.setQueryData<NormalizedPhoto>(photoKey(ref), photo)
}

/** The line the dock shows for a photo that did not load */
export function photoFailureMessage(error: unknown, providerId: string): string {
  const label = PROVIDER_LABELS[providerId as ImageryProviderId] ?? providerId
  if (error instanceof PhotoNotFoundError) return `${label} has no photo with this id.`
  if (error instanceof HttpError) {
    return `The photo could not be loaded from ${label} (HTTP ${error.status}).`
  }
  return `The photo could not be loaded from ${label}.`
}

/** A key that is never asked: the query of "no photo" is disabled, so it sends nothing */
const NO_PHOTO: PhotoRef = { providerId: 'mapillary', photoId: '' }

/**
 * The query of the photo the URL shows (`ref`, null for none). It is enabled only for a photo, and never under
 * automation. The photo is null while there is none, or while it loads.
 */
export function useOpenPhotoQuery(ref: PhotoRef | null, mapillaryToken: string) {
  const query = useQuery({
    ...photoQueryOptions(ref ?? NO_PHOTO, mapillaryToken),
    enabled: ref !== null && !AUTOMATED,
  })
  if (ref === null) return { photo: null, error: null }
  return { photo: query.data ?? null, error: query.error }
}
