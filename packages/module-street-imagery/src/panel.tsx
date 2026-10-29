import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { SegmentedControl } from '@osm-editor-kit/maid-ui'
import { PhotoDateRangeFilter } from '@osm-editor-kit/street-imagery-react'
import './street-imagery.css'
import { m } from './messages.ts'
import { useShownPhotos } from './shown.ts'
import {
  IMAGERY_PROVIDER_IDS,
  PHOTO_KINDS,
  PROVIDER_LABELS,
  providerAvailable,
  toggleProvider,
  type ImageryProviderId,
  type PhotoKind,
} from './state.ts'
import { AUTOMATED, useMapillaryToken } from './street-imagery-store.ts'

/** The photo kinds' labels, read when shown. "360°" is the same in every language. */
function kindOptions() {
  return PHOTO_KINDS.map((kind) => ({
    value: kind,
    label: kind === 'all' ? m.kind_all() : kind === 'flat' ? m.kind_flat() : '360°',
  }))
}

/**
 * A line under the provider's name only when it cannot be switched on (Mapillary without a token). Where a provider
 * reads from added nothing to the choice (Tobias, 2026-10-29).
 */
function providerNote(available: boolean) {
  return available ? undefined : m.panel_mapillary_no_token()
}

/**
 * One provider: a checkbox switch and what it reads from. The row layout and the native switch
 * are the ones of the notes panel (module-notes), so a switch looks the same in every panel.
 */
function ProviderRow({
  id,
  on,
  onSwitch,
}: {
  id: ImageryProviderId
  /** Whether the URL shows this provider (the shown value, not the stored one) */
  on: boolean
  onSwitch: (id: ImageryProviderId, on: boolean) => void
}) {
  const token = useMapillaryToken()
  const available = providerAvailable(id, token)
  const note = providerNote(available)
  return (
    <li className="py-2">
      <label
        className={`flex items-start justify-between gap-3 ${available ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
      >
        <span className="min-w-0">
          <span className="block font-medium text-zinc-950 dark:text-white">
            {PROVIDER_LABELS[id]}
          </span>
          {note && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
        </span>
        <input
          {...PLAIN_INPUT}
          type="checkbox"
          role="switch"
          aria-label={m.panel_provider_switch({ provider: PROVIDER_LABELS[id] })}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-default dark:accent-blue-500"
          checked={on}
          disabled={!available}
          onChange={(event) => onSwitch(id, event.currentTarget.checked)}
        />
      </label>
    </li>
  )
}

/**
 * The photo kinds (all, flat, 360°) as one group of buttons, from the shared SegmentedControl. The
 * arrow keys move between them and choose.
 */
function KindChoice({ kind, onSelect }: { kind: PhotoKind; onSelect: (kind: PhotoKind) => void }) {
  return (
    <SegmentedControl
      label={m.panel_kind_choice()}
      options={kindOptions()}
      value={kind}
      onSelect={onSelect}
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
  const shown = useShownPhotos(false)

  if (AUTOMATED)
    return (
      <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">{m.photos_automated_off()}</p>
    )

  const switchProvider = (id: ImageryProviderId, on: boolean) =>
    shown.chooseProviders(toggleProvider(shown.providers, id, on))

  return (
    <div className="maid-street-imagery flex flex-col gap-5 p-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {m.panel_providers_heading()}
        </h3>
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/5">
          {IMAGERY_PROVIDER_IDS.map((id) => (
            <ProviderRow
              key={id}
              id={id}
              on={shown.providers.includes(id)}
              onSwitch={switchProvider}
            />
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {m.panel_kinds_heading()}
        </h3>
        <KindChoice kind={shown.kind} onSelect={shown.chooseKind} />
      </section>
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {m.panel_dates_heading()}
        </h3>
        <div className="mt-1">
          <PhotoDateRangeFilter
            value={shown.date}
            onChange={shown.chooseDate}
            yearLines={[1, 2, 3, 4]}
          />
        </div>
      </section>
    </div>
  )
}
