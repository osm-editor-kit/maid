import { CameraIcon } from '@heroicons/react/20/solid'
import { toolButtonTone } from '@osm-editor-kit/maid-ui'
import { PhotoDateRangeFilter } from '@osm-editor-kit/street-imagery-react'
import type { KeyboardEvent } from 'react'
import './street-imagery.css'
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

/**
 * One provider: a checkbox switch and what it reads from. The row layout and the native switch
 * are the ones of the notes panel (module-notes), so a switch looks the same in every panel.
 */
function ProviderRow({ id }: { id: ImageryProviderId }) {
  const on = useStreetImageryStore((state) => state.providers.includes(id))
  const token = useStreetImageryStore((state) => state.mapillaryToken)
  const setProvider = useStreetImageryStore((state) => state.setProvider)
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
 * The photo kinds (all, flat, 360°) as one group of buttons: the chosen one is `selected` (no
 * hover), and the buttons overlap by a pixel so that they share one hairline. The arrow keys move
 * between them and choose, as in the filter switch of packages/ui (FilterPanel).
 */
function KindChoice() {
  const photoKind = useStreetImageryStore((state) => state.photoKind)
  const setPhotoKind = useStreetImageryStore((state) => state.setPhotoKind)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const index = (PHOTO_KINDS.indexOf(photoKind) + step + PHOTO_KINDS.length) % PHOTO_KINDS.length
    const next = PHOTO_KINDS[index]
    if (next === undefined) return
    setPhotoKind(next)
    const target = event.currentTarget.parentElement?.children[index]
    if (target instanceof HTMLElement) target.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Which photos"
      className="isolate mt-1 inline-flex rounded-md shadow-xs dark:shadow-none [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md"
    >
      {PHOTO_KINDS.map((kind) => {
        const checked = kind === photoKind
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setPhotoKind(kind)}
            onKeyDown={onKeyDown}
            className={`relative inline-flex h-8 items-center px-3 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 ${toolButtonTone(checked ? 'selected' : 'idle')}`}
          >
            {KIND_LABELS[kind]}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The photos button's flyout: which providers show photos on the map, which photos (all, flat or
 * 360°) and from when. Nothing is requested before a provider is switched on.
 */
export function PhotosPanel() {
  const date = useStreetImageryStore((state) => state.date)
  const setDate = useStreetImageryStore((state) => state.setDate)

  if (AUTOMATED)
    return (
      <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">
        Photos are off in automated browsers.
      </p>
    )

  return (
    <div className="maid-street-imagery flex flex-col gap-5 p-4 text-sm">
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
