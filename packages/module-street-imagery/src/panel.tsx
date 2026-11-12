import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { SegmentedControl } from '@osm-editor-kit/maid-ui'
import {
  formatDate,
  OTHER_SIGNS_GROUP_ID,
  parseIsoDateStartMs,
  SIGN_GROUP_IDS,
  SIGN_GROUPS,
  type NormalizedMapFeature,
} from '@osm-editor-kit/street-imagery'
import {
  PhotoDateRangeFilter,
  useProviderMapFeatures,
  useStreetImageryI18n,
} from '@osm-editor-kit/street-imagery-react'
import type { ReactNode } from 'react'
import './street-imagery.css'
import { legendEntries } from './colors.ts'
import { m } from './messages.ts'
import { useShownPhotos } from './shown.ts'
import {
  COLOR_MODES,
  IMAGERY_PROVIDER_IDS,
  PHOTO_KINDS,
  PROVIDER_LABELS,
  providerAvailable,
  SIGNS_ID,
  signsActive,
  toggleProvider,
  type ColorMode,
  type ImageryProviderId,
  type OverlayId,
  type PhotoKind,
} from './state.ts'
import {
  AUTOMATED,
  useColorBy,
  useMapillaryToken,
  useSignGroups,
  useStreetImageryActions,
} from './street-imagery-store.ts'
import type { PhotoDates } from './url.ts'
import { MIN_ZOOM, useMapView, usePhotosInView } from './view.ts'

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
  children,
}: {
  id: ImageryProviderId
  /** Whether the URL shows this provider (the shown value, not the stored one) */
  on: boolean
  onSwitch: (id: OverlayId, on: boolean) => void
  /** Layers of the provider below its switch (Mapillary's traffic signs) */
  children?: ReactNode
}) {
  const token = useMapillaryToken()
  const available = providerAvailable(id, token)
  const note = providerNote(available)
  return (
    <li className="py-2">
      <Switch
        label={PROVIDER_LABELS[id]}
        ariaLabel={m.panel_provider_switch({ provider: PROVIDER_LABELS[id] })}
        note={note}
        on={on}
        available={available}
        onSwitch={(next) => onSwitch(id, next)}
      />
      {available && children}
    </li>
  )
}

/** A label with a checkbox switch at its end; `small` for a layer under a provider */
function Switch({
  label,
  ariaLabel,
  note,
  on,
  available,
  onSwitch,
  small = false,
}: {
  label: string
  ariaLabel: string
  note?: string
  on: boolean
  available: boolean
  onSwitch: (on: boolean) => void
  small?: boolean
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 ${available ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
    >
      <span className="min-w-0">
        <span
          className={`block text-zinc-950 dark:text-white ${small ? 'text-sm' : 'font-medium'}`}
        >
          {label}
        </span>
        {note && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </span>
      <input
        {...PLAIN_INPUT}
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-blue-600 disabled:cursor-default dark:accent-blue-500"
        checked={on}
        disabled={!available}
        onChange={(event) => onSwitch(event.currentTarget.checked)}
      />
    </label>
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

/** The sign groups' labels, read when shown */
function signGroupLabel(id: string) {
  if (id === 'parking') return m.sign_group_parking()
  if (id === 'bike') return m.sign_group_bike()
  if (id === 'speed') return m.sign_group_speed()
  if (id === 'access') return m.sign_group_access()
  return m.sign_group_other()
}

const NO_FEATURES: NormalizedMapFeature[] = []

/** The signs in view per group (a sign can be in several), and in none of them as `other` */
function countSignGroups(signs: readonly NormalizedMapFeature[]) {
  const counts = new Map<string, number>()
  for (const sign of signs) {
    const groups = SIGN_GROUPS.filter((group) => group.pattern.test(sign.value)).map(
      (group) => group.id,
    )
    for (const id of groups.length > 0 ? groups : [OTHER_SIGNS_GROUP_ID]) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Mapillary's traffic signs, under Mapillary: their switch and, while they are on, a chip per sign group with the
 * number of signs in view (the Radnetz fork's chips). No chip chosen shows every sign. The signs follow the date
 * filter below (seen in the range).
 */
function SignsLayer({
  on,
  onSwitch,
}: {
  on: boolean
  onSwitch: (id: OverlayId, on: boolean) => void
}) {
  const groups = useSignGroups()
  const { setSignGroups } = useStreetImageryActions()
  const { zoom, bbox } = useMapView()
  // the layer's own query (same box and zoom): no request of its own
  const { data: signs = NO_FEATURES } = useProviderMapFeatures(SIGNS_ID, on ? bbox : null, zoom, {
    minZoom: MIN_ZOOM,
  })
  const counts = countSignGroups(signs)
  const toggle = (id: string) =>
    setSignGroups(groups.includes(id) ? groups.filter((item) => item !== id) : [...groups, id])
  return (
    <div className="mt-2 ml-4 border-l border-zinc-950/10 pl-3 dark:border-white/10">
      <Switch
        small
        label={m.panel_signs_label()}
        ariaLabel={m.panel_signs_switch()}
        on={on}
        available
        onSwitch={(next) => onSwitch(SIGNS_ID, next)}
      />
      {on && (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="group"
          aria-label={m.panel_sign_groups()}
        >
          {SIGN_GROUP_IDS.map((id) => {
            const chosen = groups.length === 0 || groups.includes(id)
            return (
              <button
                key={id}
                type="button"
                aria-pressed={groups.includes(id)}
                onClick={() => toggle(id)}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium ring-1 focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  chosen
                    ? 'bg-blue-600 text-white ring-blue-600 dark:bg-blue-500 dark:ring-blue-500'
                    : 'bg-transparent text-zinc-700 ring-zinc-950/15 hover:bg-zinc-950/5 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-white/5'
                }`}
              >
                {signGroupLabel(id)}
                <span className={`ml-1 tabular-nums ${chosen ? 'text-white/80' : 'text-zinc-500'}`}>
                  {counts.get(id) ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The legend's labels, read when shown */
function legendLabel(id: string) {
  if (id === 'current') return m.legend_age_current()
  if (id === 'mid') return m.legend_age_mid()
  if (id === 'old') return m.legend_age_old()
  if (id === 'pano') return '360°'
  if (id === 'flat') return m.kind_flat()
  return m.legend_unknown()
}

/** The colour of the photos on the map (age or type) and its legend, with the number of photos in view per entry */
function ColorChoice({ providers }: { providers: readonly ImageryProviderId[] }) {
  const colorBy = useColorBy()
  const { setColorBy } = useStreetImageryActions()
  const photos = usePhotosInView(providers)
  const entries = legendEntries(colorBy, photos)
  return (
    <>
      <SegmentedControl
        label={m.panel_color_choice()}
        options={COLOR_MODES.map((mode: ColorMode) => ({
          value: mode,
          label: mode === 'age' ? m.color_age() : m.color_type(),
        }))}
        value={colorBy}
        onSelect={setColorBy}
        textSize="xs"
        className="mt-1"
      />
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {legendLabel(entry.id)}
            {photos.length > 0 && <span className="text-zinc-500 tabular-nums">{entry.count}</span>}
          </li>
        ))}
      </ul>
    </>
  )
}

/** The chosen range as one line: "since 5 June 2021", "5 June 2021 to 3 May 2024", or "all dates" */
function useRangeLabel(date: PhotoDates) {
  const { locale } = useStreetImageryI18n()
  const day = (iso: string) => formatDate(parseIsoDateStartMs(iso), locale)
  if (date.from && date.to) return m.panel_dates_between({ from: day(date.from), to: day(date.to) })
  if (date.from) return m.panel_dates_since({ from: day(date.from) })
  if (date.to) return m.panel_dates_until({ to: day(date.to) })
  return m.panel_dates_all()
}

/**
 * The capture dates: the range in the heading line with "All dates" to clear it, and the package's slider with the
 * photos in view as a chart above it (before the date filter, so the chart shows what a wider range would add). The
 * package's own range line under the slider is hidden (street-imagery.css): the heading says it.
 */
function DateChoice({
  providers,
  date,
  onChange,
}: {
  providers: readonly ImageryProviderId[]
  date: PhotoDates
  onChange: (date: PhotoDates) => void
}) {
  const photos = usePhotosInView(providers)
  const label = useRangeLabel(date)
  const limited = date.from !== undefined || date.to !== undefined
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">{m.panel_dates_heading()}</span>{' '}
          <span className="font-medium text-zinc-950 dark:text-white">{label}</span>
        </h3>
        {limited && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="shrink-0 cursor-pointer rounded-sm text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-white"
          >
            {m.panel_dates_reset()}
          </button>
        )}
      </div>
      <div className="maid-date-filter mt-1">
        <PhotoDateRangeFilter
          value={date}
          onChange={onChange}
          capturedAt={photos.map((photo) => photo.capturedAt)}
          yearLines={[1, 2, 3, 4]}
          allDatesAction={false}
        />
      </div>
    </>
  )
}

/**
 * The photos button's flyout: which providers show photos on the map (and Mapillary's traffic signs), which photos
 * (all, flat or 360°), their colour, and from when. Nothing is requested before a provider is switched on.
 */
export function PhotosPanel() {
  const shown = useShownPhotos(false)
  const token = useMapillaryToken()

  if (AUTOMATED)
    return (
      <p className="p-4 text-xs text-zinc-500 dark:text-zinc-400">{m.photos_automated_off()}</p>
    )

  const switchLayer = (id: OverlayId, on: boolean) =>
    shown.chooseProviders(toggleProvider(shown.providers, id, on))
  const photoProviders = IMAGERY_PROVIDER_IDS.filter((id) => shown.providers.includes(id))

  return (
    <div className="maid-street-imagery flex flex-col gap-5 p-4 text-sm">
      <section>
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {m.panel_providers_heading()}
        </h3>
        <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/5">
          {IMAGERY_PROVIDER_IDS.map((id) => (
            <ProviderRow key={id} id={id} on={shown.providers.includes(id)} onSwitch={switchLayer}>
              {id === 'mapillary' && (
                <SignsLayer
                  on={signsActive(shown.providers, token, AUTOMATED)}
                  onSwitch={switchLayer}
                />
              )}
            </ProviderRow>
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
          {m.panel_color_heading()}
        </h3>
        <ColorChoice providers={photoProviders} />
      </section>
      <section>
        <DateChoice providers={photoProviders} date={shown.date} onChange={shown.chooseDate} />
      </section>
    </div>
  )
}
