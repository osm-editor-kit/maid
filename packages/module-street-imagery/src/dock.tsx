import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import type { NormalizedPhoto } from '@osm-editor-kit/street-imagery'
import { StreetLevelImageryViewer } from '@osm-editor-kit/street-imagery-react'
import { PhotoDetailsDialog } from '@osm-editor-kit/street-imagery-react/photo-details'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { planUse } from './image-keys.ts'
import { photoPageLink } from './links.ts'
import { activeProviders } from './state.ts'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

/**
 * Writes the open photo to the target key of the selected feature: the row last focused in its "Street-level
 * images" field, or the provider's default key. Disabled, with the reason as its tooltip, when that is not possible.
 */
function UsePhotoButton({ photo }: { photo: NormalizedPhoto }) {
  const writer = useStreetImageryStore((state) => state.imageWriter)
  const active = useStreetImageryStore((state) => state.activeImage)
  const provider =
    photo.providerId === 'mapillary' || photo.providerId === 'panoramax' ? photo.providerId : null
  const plan =
    provider === null
      ? {
          ok: false as const,
          reason: 'Only Mapillary and Panoramax photos can be used as image keys',
        }
      : planUse({ photoId: photo.photoId, provider, active, writer })

  return (
    <button
      type="button"
      disabled={!plan.ok}
      title={plan.ok ? `Adds this photo to ${plan.key}` : plan.reason}
      onClick={() => {
        // read again at the click: the selection may have changed since the render
        const state = useStreetImageryStore.getState()
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
      Use this photo
    </button>
  )
}

/** The photo open in the dock, from the package's viewer, with its link and details. */
function OpenPhoto({ photo, queries }: { photo: NormalizedPhoto; queries: QueryClient }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const showPhoto = useStreetImageryStore((state) => state.showPhoto)
  const closePhoto = useStreetImageryStore((state) => state.closePhoto)
  const easeTo = useStreetImageryStore((state) => state.easeTo)
  const link = photoPageLink(photo)

  return (
    <QueryClientProvider client={queries}>
      {/* the wrapper that the dark-mode rules of street-imagery.css are scoped to */}
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
            Details
          </button>
          <button
            type="button"
            onClick={closePhoto}
            className="cursor-pointer rounded-sm text-xs font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
          >
            Close photo
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <StreetLevelImageryViewer
            photo={photo}
            groupPhotos={[]}
            onPhotoSelected={() => {}}
            onEaseMapToPoint={(lng, lat) => easeTo?.(lng, lat)}
            onViewerPhoto={showPhoto}
          />
        </div>
        <PhotoDetailsDialog
          photo={photo}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          externalUrl={link.href}
        />
      </div>
    </QueryClientProvider>
  )
}

/** The photo open in the dock, from the package's viewer. Quiet text while none is chosen. */
export function PhotosView({ editor }: DockViewProps) {
  const openPhoto = useStreetImageryStore((state) => state.openPhoto)
  const stored = useStreetImageryStore((state) => state.providers)
  const token = useStreetImageryStore((state) => state.mapillaryToken)

  if (AUTOMATED)
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
        Photos are off in automated browsers.
      </p>
    )

  if (!openPhoto) {
    const anyOn = activeProviders(stored, token, AUTOMATED).length > 0
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
        {anyOn
          ? 'Click a photo on the map to see it here.'
          : 'Switch on a provider under Photos in the top bar to see photos on the map.'}
      </p>
    )
  }

  return <OpenPhoto photo={openPhoto} queries={editor.queries} />
}
