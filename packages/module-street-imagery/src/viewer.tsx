import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import {
  parseIsoDateStartMs,
  targetImageToPhoto,
  type NormalizedPhoto,
} from '@osm-editor-kit/street-imagery'
import {
  FloatingPhotoViewer,
  FloatingViewerInfoButton,
  MAPILLARY_FEATURE_BAR_LABELS,
  MapillaryFeatureBar,
  PhotoDate,
  useSelectedMapillaryFeature,
  useStreetImageryI18n,
} from '@osm-editor-kit/street-imagery-react'
import {
  PHOTO_DETAILS_LABELS,
  PhotoDetailsDialog,
} from '@osm-editor-kit/street-imagery-react/photo-details'
import { StreetLevelImageryViewer } from '@osm-editor-kit/street-imagery-react/viewer'
import { useEffect, useRef, useState } from 'react'
import './street-imagery.css'
import { planUse } from './image-keys.ts'
import { photoPageLink } from './links.ts'
import { m } from './messages.ts'
import { photoFailureMessage } from './photo-query.ts'
import { useOpenPhoto, useShownPhotos } from './shown.ts'
import { PROVIDER_LABELS, type ImageryProviderId } from './state.ts'
import {
  AUTOMATED,
  getStreetImagery,
  useActiveImage,
  useEaseTo,
  useImageWriter,
  useSelectedSign,
  useStreetImageryActions,
} from './street-imagery-store.ts'
import { refOf } from './url.ts'

/**
 * Writes the open photo to the target key of the selected feature: the row last focused in its "Street-level
 * images" field, or the provider's default key. Disabled, with the reason as its tooltip, when that is not possible.
 */
function UsePhotoButton({ photo }: { photo: NormalizedPhoto }) {
  const writer = useImageWriter()
  const active = useActiveImage()
  const provider =
    photo.providerId === 'mapillary' || photo.providerId === 'panoramax' ? photo.providerId : null
  const plan =
    provider === null
      ? {
          ok: false as const,
          reason: m.dock_use_not_photo(),
        }
      : planUse({ photoId: photo.photoId, provider, active, writer })

  return (
    <button
      type="button"
      disabled={!plan.ok}
      title={plan.ok ? m.dock_use_title({ key: plan.key }) : plan.reason}
      onClick={() => {
        // read again at the click: the selection may have changed since the render
        const state = getStreetImagery()
        if (provider === null || state.imageWriter === null) return
        const next = planUse({
          photoId: photo.photoId,
          provider,
          active: state.activeImage,
          writer: state.imageWriter,
        })
        if (next.ok) state.imageWriter.onChange(next.key, next.value)
      }}
      className="shrink-0 cursor-pointer rounded-sm font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-400 disabled:no-underline dark:text-white dark:disabled:text-zinc-500"
    >
      {m.dock_use_photo()}
    </button>
  )
}

/** The classes of the viewer's text buttons and links */
const TEXT_BUTTON =
  'cursor-pointer rounded-sm font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white'

/** A newly selected sign opens the best photo of its newest day (within the date filter), once per sign */
function useOpenBestPhotoOfSign(
  signId: string | null,
  sign: ReturnType<typeof useSelectedMapillaryFeature>,
) {
  const { showPhoto } = useStreetImageryActions()
  const opened = useRef<string | null>(null)
  const { firstImage, shownImage } = sign
  useEffect(
    function openBestPhotoOfSign() {
      if (signId === null) {
        opened.current = null
        return
      }
      if (firstImage === null || opened.current === signId) return
      opened.current = signId
      if (shownImage !== null) return
      const photo = targetImageToPhoto(firstImage)
      const ref = refOf(photo)
      if (ref !== null) showPhoto(ref, photo)
    },
    [signId, firstImage, shownImage, showPhoto],
  )
}

/** Date, type and author of the shown photo, and its page at the provider */
function PhotoFooter({ photo, shown }: { photo: NormalizedPhoto; shown: NormalizedPhoto | null }) {
  const link = photoPageLink(photo)
  const type =
    photo.isPano === true ? m.viewer_pano() : photo.isPano === false ? m.viewer_flat() : null
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <p className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">
        <PhotoDate localDateTime={shown?.details?.capturedAtLocal} timestamp={photo.capturedAt} />
        {type && <> · {type}</>}
        {shown?.creatorName && <> · {shown.creatorName}</>}
      </p>
      <UsePhotoButton photo={photo} />
      <a href={link.href} target="_blank" rel="noreferrer" className={`shrink-0 ${TEXT_BUTTON}`}>
        {link.label}
      </a>
    </div>
  )
}

/**
 * The photo viewer over the map: the package's floating box (moved by its header, sized at its left edge, kept in
 * the browser), with the open photo, the selected traffic sign and its photos by day, and the photo's details. It is
 * there while a photo is open (the URL's `photo`) or a sign is selected. A child of the map, so the box moves in it.
 */
export function PhotoViewerBox(_props: MapContentProps) {
  const shown = useShownPhotos(false)
  const open = useOpenPhoto(shown.providers)
  const signId = useSelectedSign()
  const { closePhoto, selectSign, showPhoto } = useStreetImageryActions()
  const easeTo = useEaseTo()
  const { locale } = useStreetImageryI18n()
  const [detailsOpen, setDetailsOpen] = useState(false)
  // the photo as the viewer loaded it (author, details), while it is the open one
  const [viewed, setViewed] = useState<NormalizedPhoto | null>(null)
  const sign = useSelectedMapillaryFeature({
    featureId: signId,
    shownPhotoId: open.ref?.providerId === 'mapillary' ? open.ref.photoId : null,
    minCapturedAt: shown.date.from ? parseIsoDateStartMs(shown.date.from) : null,
  })
  useOpenBestPhotoOfSign(signId, sign)

  if (AUTOMATED || (open.ref === null && signId === null)) return null

  const photo = open.photo
  const shownPhoto = photo !== null && viewed?.photoId === photo.photoId ? viewed : null
  const close = () => {
    selectSign(null)
    closePhoto()
  }
  const signName = sign.data
    ? MAPILLARY_FEATURE_BAR_LABELS[locale].name(sign.data.feature.value)
    : null
  // a photo of the selected sign turns to the sign and outlines it
  const lookAt =
    sign.data && sign.shownImage
      ? {
          lngLat: sign.data.feature.lngLat,
          outline: sign.shownImage.outline,
          value: sign.data.feature.value,
          label: signName ?? undefined,
        }
      : null
  const status =
    signId !== null && sign.isLoading
      ? m.viewer_sign_loading()
      : signId !== null && sign.isError
        ? m.viewer_sign_failed()
        : open.error !== null && open.ref !== null
          ? photoFailureMessage(open.error, open.ref.providerId)
          : open.ref !== null && photo === null
            ? m.dock_loading()
            : null
  const title = sign.data
    ? m.viewer_title_sign()
    : open.ref
      ? PROVIDER_LABELS[open.ref.providerId as ImageryProviderId]
      : m.photos_label()

  // the wrapper that the dark-mode rules of street-imagery.css are scoped to
  return (
    <div className="maid-street-imagery contents">
      {shownPhoto && (
        <PhotoDetailsDialog
          photo={shownPhoto}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          externalUrl={photoPageLink(shownPhoto).href}
        />
      )}
      <FloatingPhotoViewer
        storageKey="maid:photo-viewer"
        title={title}
        titleActions={
          shownPhoto ? (
            <FloatingViewerInfoButton
              label={PHOTO_DETAILS_LABELS[locale].open}
              onClick={() => setDetailsOpen(true)}
            />
          ) : undefined
        }
        onClose={close}
        status={status}
        toolbar={
          sign.data ? (
            <MapillaryFeatureBar
              data={sign.data}
              shownImage={sign.shownImage}
              onShow={(image) => {
                const next = targetImageToPhoto(image)
                const ref = refOf(next)
                if (ref !== null) showPhoto(ref, next)
              }}
            />
          ) : undefined
        }
        footer={photo ? <PhotoFooter photo={photo} shown={shownPhoto} /> : undefined}
      >
        {photo && (
          <div className="px-2">
            <StreetLevelImageryViewer
              photo={photo}
              groupPhotos={[photo]}
              onPhotoSelected={() => {}}
              onEaseMapToPoint={(lng, lat) => easeTo?.(lng, lat)}
              lookAt={lookAt}
              onViewerPhoto={(loaded) => {
                // the viewer reports the photo it loaded (its position, date and author): the photo the URL shows now
                setViewed(loaded)
                const ref = refOf(loaded)
                if (ref !== null) showPhoto(ref, loaded)
              }}
            />
          </div>
        )}
      </FloatingPhotoViewer>
    </div>
  )
}
