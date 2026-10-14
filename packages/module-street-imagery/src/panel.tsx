import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { SegmentedControl } from '@osm-editor-kit/maid-ui'
import { PhotoDateRangeFilter } from '@osm-editor-kit/street-imagery-react'
import './street-imagery.css'
import {
  activeProviders,
  IMAGERY_PROVIDER_IDS,
  PHOTO_KINDS,
  PROVIDER_LABELS,
  providerAvailable,
  type ImageryProviderId,
  type PhotoKind,
} from './state.ts'
import {
  AUTOMATED,
  useDate,
  useMapillaryToken,
  usePhotoKind,
  useProviders,
  useStreetImageryActions,
} from './street-imagery-store.ts'

const KIND_LABELS: Record<PhotoKind, string> = { all: 'All', flat: 'Flat', pano: '360°' }
const KIND_OPTIONS = PHOTO_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))

const NOTES: Record<ImageryProviderId, string> = {
  panoramax: 'From api.panoramax.xyz. No account needed.',
  mapillary: 'From graph.mapillary.com, with the token of this build.',
}

const MAPILLARY_WITHOUT_TOKEN =
  'No Mapillary token is set in this build, so Mapillary is not offered.'

/**
 * One provider: a checkbox switch and what it reads from. The row layout and the native switch
 * are the ones of the notes panel (module-notes), so a switch looks the same in every panel.
 */
function ProviderRow({ id }: { id: ImageryProviderId }) {
  const on = useProviders().includes(id)
  const token = useMapillaryToken()
  const { setProvider } = useStreetImageryActions()
  const available = providerAvailable(id, token)
  const note = available ? NOTES[id] : MAPILLARY_WITHOUT_TOKEN
  return (
    <li className="py-2">
      <label
        className={`flex items-start justify-between gap-3 ${available ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
      >
        <span className="min-w-0">
          <span className="block font-medium text-zinc-950 dark:text-white">
            {PROVIDER_LABELS[id]}
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{note}</span>
        </span>
        <input
          {...PLAIN_INPUT}
          type="checkbox"
          role="switch"
          aria-label={`Show photos from ${PROVIDER_LABELS[id]}`}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-default dark:accent-blue-500"
          checked={on}
          disabled={!available}
          onChange={(event) => setProvider(id, event.currentTarget.checked)}
        />
      </label>
    </li>
  )
}

/**
 * The photo kinds (all, flat, 360°) as one group of buttons, from the shared SegmentedControl. The
 * arrow keys move between them and choose.
 */
function KindChoice() {
  const photoKind = usePhotoKind()
  const { setPhotoKind } = useStreetImageryActions()
  return (
    <SegmentedControl
      label="Which photos"
      options={KIND_OPTIONS}
      value={photoKind}
      onSelect={setPhotoKind}
      textSize="xs"
      className="mt-1"
    />
  )
}

/**
 * The photos button's flyout: which providers show photos on the map, which photos (all, flat or
 * 360°) and from when. Nothing is requested before a provider is switched on.
 */
export function PhotosPanel() {
  const date = useDate()
  const { setDate } = useStreetImageryActions()
  const stored = useProviders()
  const token = useMapillaryToken()

  if (AUTOMATED)
    return (
      <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">
        Photos are off in automated browsers.
      </p>
    )

  const anyOn = activeProviders(stored, token, AUTOMATED).length > 0

  return (
    <div className="maid-street-imagery flex flex-col gap-5 p-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Show photos from</h3>
        {!anyOn && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Photos are off. Choose a source to load them.
          </p>
        )}
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/5">
          {IMAGERY_PROVIDER_IDS.map((id) => (
            <ProviderRow key={id} id={id} />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Photos</h3>
        <KindChoice />
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
