import { CameraIcon } from '@heroicons/react/20/solid'
import { PhotoDateRangeFilter } from '@osm-editor-kit/street-imagery-react'
import {
  IMAGERY_PROVIDER_IDS,
  PHOTO_KINDS,
  PROVIDER_LABELS,
  providerAvailable,
  type ImageryProviderId,
  type PhotoKind,
} from './state.ts'
import { AUTOMATED, useStreetImageryStore } from './store.ts'

/** The icon of the photos button in the top bar */
export const PHOTOS_ICON = <CameraIcon aria-hidden="true" />

const KIND_LABELS: Record<PhotoKind, string> = { all: 'All', flat: 'Flat', pano: '360°' }

const NOTES: Record<ImageryProviderId, string> = {
  panoramax: 'From api.panoramax.xyz. No account needed.',
  mapillary: 'From graph.mapillary.com, with the token of this build.',
}

const MAPILLARY_WITHOUT_TOKEN =
  'No Mapillary token is set in this build, so Mapillary is not offered.'

/** One provider: a switch and what it reads from */
function ProviderRow({ id }: { id: ImageryProviderId }) {
  const on = useStreetImageryStore((state) => state.providers.includes(id))
  const token = useStreetImageryStore((state) => state.mapillaryToken)
  const setProvider = useStreetImageryStore((state) => state.setProvider)
  const available = providerAvailable(id, token)
  const note = available ? NOTES[id] : MAPILLARY_WITHOUT_TOKEN
  return (
    <li className="flex items-start gap-3 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Show photos from ${PROVIDER_LABELS[id]}`}
        disabled={!available}
        onClick={() => setProvider(id, !on)}
        className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-zinc-200 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 aria-checked:bg-blue-600 dark:bg-zinc-700 dark:aria-checked:bg-blue-500"
      >
        <span
          aria-hidden="true"
          className={`size-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
      <div className="min-w-0">
        <p className="font-medium text-zinc-950 dark:text-white">{PROVIDER_LABELS[id]}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
      </div>
    </li>
  )
}

/**
 * The photos button's flyout: which providers show photos on the map, which photos (all, flat or
 * 360°) and from when. Nothing is requested before a provider is switched on.
 */
export function PhotosPanel() {
  const photoKind = useStreetImageryStore((state) => state.photoKind)
  const setPhotoKind = useStreetImageryStore((state) => state.setPhotoKind)
  const date = useStreetImageryStore((state) => state.date)
  const setDate = useStreetImageryStore((state) => state.setDate)

  if (AUTOMATED)
    return (
      <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">
        Photos are off in automated browsers.
      </p>
    )

  return (
    <div className="flex flex-col gap-5 p-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Show photos from</h3>
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/5">
          {IMAGERY_PROVIDER_IDS.map((id) => (
            <ProviderRow key={id} id={id} />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Photos</h3>
        <div className="mt-1 inline-flex rounded-md shadow-xs">
          {PHOTO_KINDS.map((kind, index) => {
            const chosen = kind === photoKind
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={chosen}
                onClick={() => setPhotoKind(kind)}
                className={`h-8 cursor-pointer px-3 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 ${index === 0 ? 'rounded-l-md' : ''} ${index === PHOTO_KINDS.length - 1 ? 'rounded-r-md' : ''} ${chosen ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'bg-white text-zinc-950 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700'}`}
              >
                {KIND_LABELS[kind]}
              </button>
            )
          })}
        </div>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Taken between</h3>
        <div className="mt-1">
          <PhotoDateRangeFilter value={date} onChange={setDate} yearLines={[1, 2, 3, 4]} />
        </div>
      </section>
    </div>
  )
}
