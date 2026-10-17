/**
 * The photo settings the URL shows, and the photo open, in step with it (iD's `photo_type`, `photo_overlay`,
 * `photo_dates` and `photo`, `.reference/id/modules/renderer/photos.js`).
 *
 * The URL is the live state. The stored choices (store) are remembered for the next visit only: a choice of the
 * person writes the URL and the store, a link writes the URL alone. `useShownPhotos` is how a component reads what is
 * shown: the hook's value, not the store's. The open photo is the URL's `photo` too (`useOpenPhoto`); its data is a
 * query (photo-query.ts).
 *
 * One component is the writer, `PhotoUrlSync`, mounted in the map's content (index.ts) from the start, also under
 * automation: it requests nothing and writes only the URL. Every other reader passes `writer: false`, so each
 * parameter is written in one place. Actions that change the open photo (showPhoto, closePhoto) and the provider
 * switch write the URL through the writer in the same event, so the URL and the photo never disagree.
 */

import { useUrlParam, useUrlSetting } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { seedPhoto, useOpenPhotoQuery } from './photo-query.ts'
import {
  activeProviders,
  DEFAULT_STORED,
  openableProviders,
  type ImageryProviderId,
  type PhotoKind,
} from './state.ts'
import {
  AUTOMATED,
  useMapillaryToken,
  useStoredDate,
  useStoredPhotoKind,
  useStoredProviders,
  useStreetImageryActions,
  type PhotoWriter,
} from './street-imagery-store.ts'
import {
  PHOTO_HANDLES,
  shownPhotoRef,
  switchOffCloses,
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
  /**
   * A choice of the person. A provider switched off closes the photo of the URL in the same event; a photo whose
   * provider was never on keeps waiting in the URL.
   */
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
  const { setPhotoKind, setProviders, setDate, closePhoto } = useStreetImageryActions()
  const storedKind = useStoredPhotoKind()
  const storedProviders = useStoredProviders()
  const storedDate = useStoredDate()
  const [urlPhoto] = useUrlParam(PHOTO_HANDLES.photo)

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
    chooseProviders: (ids) => {
      const closes = switchOffCloses(urlPhoto, providers.value, ids)
      providers.choose(ids)
      if (closes) closePhoto()
    },
    chooseDate: dates.choose,
  }
}

/**
 * The photo the URL shows, with its data, for the map and the dock. The URL's `photo` shows while its provider is on
 * (`providers`: the shown ones), or while it can be opened by its id (Mapillary with a token: the eye of a field, see
 * `openableProviders`); `error` is the failure of its query, for the dock to say.
 */
export function useOpenPhoto(providers: readonly ImageryProviderId[]) {
  const [urlPhoto] = useUrlParam(PHOTO_HANDLES.photo)
  const token = useMapillaryToken()
  const ref = shownPhotoRef(
    urlPhoto,
    activeProviders(providers, token, AUTOMATED),
    openableProviders(token, AUTOMATED),
  )
  const { photo, error } = useOpenPhotoQuery(ref, token)
  return { ref, photo, error }
}

/**
 * Registers the writer of the URL's photo (store `photoWriter`) while the map is mounted. Opening puts the photo the
 * caller has in its query, then writes the URL; closing removes the URL's photo. Both are the actions' work: the
 * component only holds the query client and the URL setter.
 */
function usePhotoWriter() {
  const queries = useQueryClient()
  const [, setUrlPhoto] = useUrlParam(PHOTO_HANDLES.photo)
  const { setPhotoWriter } = useStreetImageryActions()
  useEffect(
    function registerPhotoWriter() {
      const writer: PhotoWriter = {
        open(ref: PhotoRef, photo) {
          if (photo) seedPhoto(queries, ref, photo)
          void setUrlPhoto(ref)
        },
        close() {
          void setUrlPhoto(null)
        },
      }
      setPhotoWriter(writer)
      return function unregisterPhotoWriter() {
        setPhotoWriter(null)
      }
    },
    [queries, setUrlPhoto, setPhotoWriter],
  )
}

/**
 * The writer of the photo settings and of the URL's photo. Mounted once in the map's content (index.ts), from the
 * start. Renders nothing.
 */
export function PhotoUrlSync(_props: MapContentProps) {
  useShownPhotos(true)
  usePhotoWriter()
  return null
}
