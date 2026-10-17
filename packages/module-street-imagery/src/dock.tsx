import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { StreetLevelImageryViewer } from '@osm-editor-kit/street-imagery-react'
import { PhotoDetailsDialog } from '@osm-editor-kit/street-imagery-react/photo-details'
import { useState } from 'react'
import { planUse } from './image-keys.ts'
import { photoPageLink } from './links.ts'
import { m } from './messages.ts'
import { photoFailureMessage } from './photo-query.ts'
import { useOpenPhoto, useShownPhotos } from './shown.ts'
import { activeProviders } from './state.ts'
import {
  AUTOMATED,
  getStreetImagery,
  useActiveImage,
  useEaseTo,
  useImageWriter,
  useMapillaryToken,
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
      className="cursor-pointer rounded-sm text-xs font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-400 disabled:no-underline dark:text-white dark:disabled:text-zinc-500"
    >
      {m.dock_use_photo()}
    </button>
  )
}

/** The photo open in the dock, from the package's viewer, with its link and details. */
function OpenPhoto({ photo }: { photo: NormalizedPhoto }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { showPhoto, closePhoto } = useStreetImageryActions()
  const easeTo = useEaseTo()
  const link = photoPageLink(photo)

  // the wrapper that the dark-mode rules of street-imagery.css are scoped to. The editor's query client is the
  // shell's (mount.tsx), above every dock view, so the view needs no provider of its own.
  return (
    <div className="maid-street-imagery flex h-full min-h-48 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-end gap-3 px-3">
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mr-auto rounded-sm text-xs font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
        >
          {link.label}
        </a>
        <UsePhotoButton photo={photo} />
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="cursor-pointer rounded-sm text-xs font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
        >
          {m.dock_details()}
        </button>
        <button
          type="button"
          onClick={closePhoto}
          className="cursor-pointer rounded-sm text-xs font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
        >
          {m.dock_close_photo()}
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <StreetLevelImageryViewer
          photo={photo}
          groupPhotos={[]}
          onPhotoSelected={() => {}}
          onEaseMapToPoint={(lng, lat) => easeTo?.(lng, lat)}
          onViewerPhoto={(viewed) => {
            // the viewer reports the photo it loaded (its position and date): it is the photo the URL shows now
            const ref = refOf(viewed)
            if (ref !== null) showPhoto(ref, viewed)
          }}
        />
      </div>
      <PhotoDetailsDialog
        photo={photo}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        externalUrl={link.href}
      />
    </div>
  )
}

/**
 * The photo open in the dock, from the package's viewer. Quiet text while none is chosen, while it loads, and when it
 * did not load (with a line that says why, and a way to close it).
 */
export function PhotosView() {
  const shown = useShownPhotos(false)
  const token = useMapillaryToken()
  const { closePhoto } = useStreetImageryActions()
  const open = useOpenPhoto(shown.providers)

  if (AUTOMATED)
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">{m.photos_automated_off()}</p>
    )

  if (open.ref === null) {
    const anyOn = activeProviders(shown.providers, token, AUTOMATED).length > 0
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
        {anyOn ? m.dock_hint_click() : m.dock_hint_switch()}
      </p>
    )
  }

  if (open.error !== null) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-xs text-zinc-500 dark:text-zinc-400">
        <p>{photoFailureMessage(open.error, open.ref.providerId)}</p>
        <button
          type="button"
          onClick={closePhoto}
          className="cursor-pointer rounded-sm font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
        >
          {m.dock_close_photo()}
        </button>
      </div>
    )
  }

  if (open.photo === null) {
    return <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">{m.dock_loading()}</p>
  }

  return <OpenPhoto photo={open.photo} />
}
