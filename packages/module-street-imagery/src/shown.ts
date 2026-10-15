/**
 * The photo settings the URL shows, and the photo open, in step with it (iD's `photo_type`, `photo_overlay`,
 * `photo_dates` and `photo`, `.reference/id/modules/renderer/photos.js`).
 *
 * The URL is the live state. The stored choices (store) are remembered for the next visit only: a choice of the
 * person writes the URL and the store, a link writes the URL alone. `useShownPhotos` is how a component reads what is
 * shown: the hook's value, not the store's.
 *
 * One component is the writer, `PhotoUrlSync`, mounted in the map's content (index.ts) from the start, also under
 * automation: it requests nothing and writes only the URL. Every other reader passes `writer: false`, so each
 * parameter is written in one place.
 */
import { useUrlParam, useUrlSetting } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useEffect, useMemo, useRef } from 'react'
import { fetchPhotoById } from './image-actions.ts'
import { activeProviders, DEFAULT_STORED, type ImageryProviderId, type PhotoKind } from './state.ts'
import {
  AUTOMATED,
  getStreetImagery,
  useMapillaryToken,
  useOpenPhoto,
  useStoredDate,
  useStoredPhotoKind,
  useStoredProviders,
  useStreetImageryActions,
} from './street-imagery-store.ts'
import {
  isProviderId,
  PHOTO_HANDLES,
  photoLinkStep,
  type PhotoDates,
  type PhotoRef,
} from './url.ts'

/** What is shown for the photo settings, and the choices of the person */
export type ShownPhotos = {
  kind: PhotoKind
  providers: readonly ImageryProviderId[]
  date: PhotoDates
  /** A choice of the person: shown, written to the URL and remembered for the next visit */
  chooseKind: (kind: PhotoKind) => void
  chooseProviders: (ids: ImageryProviderId[]) => void
  chooseDate: (date: PhotoDates) => void
}

const NO_PROVIDERS: ImageryProviderId[] = []

/**
 * The photo settings as shown. `writer` is true in PhotoUrlSync only (see the file comment). The URL's value wins; a
 * URL without the key shows the stored choice. `photo_overlay` and `photo_dates` leave their key out while the default
 * is shown and no link asked for it (iD does the same); `photo_type` is always written.
 */
export function useShownPhotos(writer: boolean): ShownPhotos {
  const { setPhotoKind, setProviders, setDate } = useStreetImageryActions()
  const storedKind = useStoredPhotoKind()
  const storedProviders = useStoredProviders()
  const storedDate = useStoredDate()

  const kind = useUrlSetting(PHOTO_HANDLES.type, {
    stored: storedKind,
    fallback: DEFAULT_STORED.photoKind,
    remember: setPhotoKind,
    ready: writer,
  })
  const providers = useUrlSetting(PHOTO_HANDLES.overlay, {
    stored: storedProviders,
    fallback: NO_PROVIDERS,
    remember: setProviders,
    ready: writer,
    omitFallback: true,
  })
  const dates = useUrlSetting(PHOTO_HANDLES.dates, {
    stored: storedDate,
    fallback: DEFAULT_STORED.date,
    remember: setDate,
    ready: writer,
    omitFallback: true,
  })

  return {
    kind: kind.value,
    providers: providers.value,
    date: dates.value,
    chooseKind: kind.choose,
    chooseProviders: providers.choose,
    chooseDate: dates.choose,
  }
}

/**
 * The open photo and the URL's `photo`, in both directions. A link or the history opens the URL's photo (once its
 * provider is on; by id only where that is possible, and never in an automated browser). A photo that is opened or
 * closed in the dock or on the map is written to the URL. A provider switched off closes its photo.
 */
function usePhotoUrl(providers: readonly ImageryProviderId[]) {
  const [url, setUrl] = useUrlParam(PHOTO_HANDLES.photo)
  const open = useOpenPhoto()
  const token = useMapillaryToken()
  const { showPhoto, closePhoto } = useStreetImageryActions()

  // the providers on, as a string: a stable dependency for the effects below
  const onKey = activeProviders(providers, token, AUTOMATED).join(',')
  const urlKey = url === null ? null : PHOTO_HANDLES.photo.parser.serialize(url)
  const openRef = useMemo<PhotoRef | null>(
    () =>
      open !== null && isProviderId(open.providerId)
        ? { providerId: open.providerId, photoId: open.photoId }
        : null,
    [open],
  )
  const openKey = openRef === null ? null : PHOTO_HANDLES.photo.parser.serialize(openRef)

  // a provider switched off closes its photo (the URL follows in the effect below)
  useEffect(() => {
    const current = getStreetImagery().openPhoto
    if (current !== null && !onKey.split(',').includes(current.providerId)) closePhoto()
  }, [onKey, closePhoto])

  // the URL to the open photo: a link opens its photo once the provider is on, and no URL photo closes the open one
  useEffect(() => {
    const on = onKey === '' ? [] : onKey.split(',').filter(isProviderId)
    const want = urlKey === null ? null : PHOTO_HANDLES.photo.parser.parse(urlKey)
    const current = getStreetImagery().openPhoto
    const currentRef =
      current !== null && isProviderId(current.providerId)
        ? { providerId: current.providerId, photoId: current.photoId }
        : null
    const step = photoLinkStep(want, currentRef, on)
    if (step.kind === 'close') closePhoto()
    if (step.kind !== 'open') return
    // a change of the URL, the providers or the token before the photo arrives drops it
    let cancelled = false
    fetchPhotoById(step.ref.providerId, step.ref.photoId, token, AUTOMATED).then(
      (photo) => {
        if (!cancelled && photo !== null) showPhoto(photo)
      },
      () => {
        // a failed request leaves the photo closed; the URL keeps the link's photo
      },
    )
    return () => {
      cancelled = true
    }
  }, [urlKey, onKey, token, closePhoto, showPhoto])

  // the URL to the open photo, after the person opened or closed one (a change of the open photo, not of the URL)
  const lastOpen = useRef(openKey)
  useEffect(() => {
    if (lastOpen.current === openKey) return
    lastOpen.current = openKey
    if (urlKey !== openKey) void setUrl(openRef)
  }, [openKey, openRef, urlKey, setUrl])
}

/**
 * The writer of the photo settings and of the URL's photo. Mounted once in the map's content (index.ts), from the
 * start. Renders nothing.
 */
export function PhotoUrlSync(_props: MapContentProps) {
  const shown = useShownPhotos(true)
  usePhotoUrl(shown.providers)
  return null
}
