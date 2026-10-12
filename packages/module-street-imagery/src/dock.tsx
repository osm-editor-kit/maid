import { StreetLevelImageryViewer } from '@osm-editor-kit/street-imagery-react'
import { QueryClientProvider } from '@tanstack/react-query'
import { photoQueries } from './query.ts'
import { activeProviders } from './state.ts'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

/** The photo open in the dock, from the package's viewer. Quiet text while none is chosen. */
export function PhotosView() {
  const openPhoto = useStreetImageryStore((state) => state.openPhoto)
  const stored = useStreetImageryStore((state) => state.providers)
  const token = useStreetImageryStore((state) => state.mapillaryToken)
  const showPhoto = useStreetImageryStore((state) => state.showPhoto)
  const closePhoto = useStreetImageryStore((state) => state.closePhoto)
  const easeTo = useStreetImageryStore((state) => state.easeTo)

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

  return (
    <QueryClientProvider client={photoQueries}>
      <div className="flex h-full min-h-48 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-end px-3">
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
            photo={openPhoto}
            groupPhotos={[]}
            onPhotoSelected={() => {}}
            onEaseMapToPoint={(lng, lat) => easeTo?.(lng, lat)}
            onViewerPhoto={showPhoto}
          />
        </div>
      </div>
    </QueryClientProvider>
  )
}
