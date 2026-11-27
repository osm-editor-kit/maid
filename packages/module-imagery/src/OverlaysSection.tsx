/**
 * The overlays of the imagery index (cadastre, OSM Inspector, Waymarked Trails, ...), shown in the data layers panel
 * through its point `data-layers.section` (Tobias, 2026-11-27: they are data over the map, not a background). Folded
 * by default, open while one is on. Overlays whose names start the same are folded into a group of their own
 * (`overlayGroups`). Listed: those that cover the view, and every one that is on, wherever it is.
 */
import { isAutomated } from '@osm-editor-kit/maid-core'
import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { listLayers, listView, type Listed } from './eli.ts'
import { listingView, type Listing } from './helpers.ts'
import { useView } from './imagery-store.ts'
import { m } from './messages.ts'
import { layerAge, layerLinks, overlayGroups, overlayRows, repeatsName } from './panel-rows.ts'
import { useLiveImagery } from './shown.ts'

const MUTED = 'text-xs text-zinc-500 dark:text-zinc-400'
const SUMMARY =
  'cursor-pointer rounded-md py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-500'
const LINK =
  'text-xs font-medium text-blue-700 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:text-blue-300'

export function OverlaysSection() {
  // under automation no imagery list is read and no overlay is drawn (ImageryLayers), so none is offered
  if (isAutomated()) return null
  return <OverlaysList />
}

/**
 * A `<details>` that starts open when `openAtStart` and then stays as the person leaves it: React would remove the
 * `open` attribute when the prop turns `undefined`, folding the section under the pointer when the last overlay in
 * it is switched off.
 */
function Fold(props: {
  openAtStart: boolean
  className?: string
  summary: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  return (
    <details
      open={open ?? props.openAtStart}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={props.className}
    >
      {props.summary}
      {props.children}
    </details>
  )
}

function OverlaysList() {
  const view = useView()
  const { shown, chooseOverlays } = useLiveImagery()
  // the same query as the background panel's list: the rounded view, kept while a new one is computed
  const rounded = view === null ? null : listingView(view)
  const listing = useQuery({
    queryKey: ['imagery', 'listing', rounded?.bounds ?? null, rounded?.zoom ?? null],
    queryFn: rounded === null ? skipToken : (): Promise<Listed> => listView(rounded),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
  // the overlays that are on are listed whatever the view, as iD lists the sources in use
  const onNow = useQuery({
    queryKey: ['imagery', 'overlays-on', shown.overlays.join(',')],
    queryFn:
      shown.overlays.length === 0
        ? skipToken
        : (): Promise<Listing[]> => listLayers(shown.overlays),
    staleTime: Infinity,
  })
  // OpenAerialMap images are overlays too, but they are listed with the local photos of the background panel
  const chosen = (onNow.data ?? []).filter((item) => shown.overlays.includes(item.id))
  const overlays = overlayRows(listing.data?.items ?? [], chosen)
  if (overlays.length === 0) return null
  const isOn = (id: string) => shown.overlays.includes(id)
  const onCount = overlays.filter((item) => isOn(item.id)).length
  const toggle = (id: string, on: boolean) =>
    chooseOverlays(
      on
        ? [...shown.overlays.filter((other) => other !== id), id]
        : shown.overlays.filter((other) => other !== id),
    )

  return (
    <div data-overlays-section className="border-t border-zinc-950/5 px-4 py-2 dark:border-white/5">
      <Fold
        openAtStart={onCount > 0}
        summary={
          <summary className={SUMMARY}>
            {m.imagery_overlays()}{' '}
            <span className={MUTED}>
              {onCount > 0
                ? m.imagery_overlays_on({ on: onCount, count: overlays.length })
                : overlays.length}
            </span>
          </summary>
        }
      >
        <p className={`pb-1 ${MUTED}`}>{m.imagery_overlays_intro()}</p>
        <ul className="flex flex-col">
          {overlayGroups(overlays).map((entry) =>
            entry.kind === 'layer' ? (
              <OverlayRow
                key={entry.item.id}
                item={entry.item}
                label={entry.item.name}
                on={isOn(entry.item.id)}
                onToggle={(on) => toggle(entry.item.id, on)}
              />
            ) : (
              <li key={entry.label}>
                <Fold
                  openAtStart={entry.items.some(({ item }) => isOn(item.id))}
                  className="pl-1"
                  summary={
                    <summary className={SUMMARY}>
                      {entry.label} <span className={MUTED}>{entry.items.length}</span>
                    </summary>
                  }
                >
                  <ul className="flex flex-col pl-4">
                    {entry.items.map(({ item, short }) => (
                      <OverlayRow
                        key={item.id}
                        item={item}
                        label={short}
                        on={isOn(item.id)}
                        onToggle={(on) => toggle(item.id, on)}
                      />
                    ))}
                  </ul>
                </Fold>
              </li>
            ),
          )}
        </ul>
      </Fold>
    </div>
  )
}

/** One overlay: a checkbox with its name; on, its description, dates and links */
function OverlayRow(props: {
  item: Listing
  label: string
  on: boolean
  onToggle: (on: boolean) => void
}) {
  const { item, label, on, onToggle } = props
  const description =
    item.attributionText !== undefined && !repeatsName(item.attributionText, item.name)
      ? item.attributionText
      : undefined
  const age = layerAge(item, undefined)
  const links = layerLinks(item)
  return (
    <li className="py-1">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm" title={item.name}>
        <input
          {...PLAIN_INPUT}
          type="checkbox"
          className="size-4 shrink-0 accent-blue-600"
          checked={on}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="min-w-0">{label}</span>
      </label>
      {on && (description !== undefined || age !== undefined || links.length > 0) ? (
        <div className={`flex flex-col gap-0.5 pl-6.5 ${MUTED}`}>
          {description !== undefined ? <p className="line-clamp-2">{description}</p> : null}
          {age !== undefined ? <p className="tabular-nums">{age}</p> : null}
          {links.length > 0 ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  {link.label}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
