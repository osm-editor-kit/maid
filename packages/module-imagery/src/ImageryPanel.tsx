import { isAutomated } from '@osm-editor-kit/maid-core'
import { toolButtonTone } from '@osm-editor-kit/maid-ui'
import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { listView } from './eli.ts'
import {
  BRIGHTNESS_MIN,
  categoryLabel,
  matchesQuery,
  sortListing,
  visibleAtZoom,
  type Listing,
  type View,
} from './helpers.ts'
import type { ImageryStore } from './store.ts'

/** From this many layers in view on, a search field is shown above the list */
const SEARCH_FROM = 8

const MUTED = 'text-xs text-zinc-500 dark:text-zinc-400'

/** The classes that are set, joined with spaces */
function classes(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * The top bar's background panel: the imagery that covers the map's view, the overlays, and the
 * brightness of the background. Mounted only while the flyout is open, so the list is loaded when
 * a person opens it.
 */
export function ImageryPanel(props: { store: ImageryStore }) {
  const { store } = props
  return (
    <div>
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-base font-semibold">Background</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          Imagery under the OSM data. Tiles come from the provider&apos;s server once you choose a
          layer.
        </p>
      </div>
      {isAutomated() ? (
        <p className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
          Backgrounds are off in automated browsers.
        </p>
      ) : (
        <PanelBody store={store} />
      )}
    </div>
  )
}

function PanelBody(props: { store: ImageryStore }) {
  const { store } = props
  const view = useStore(store, (s) => s.view)
  const backgroundId = useStore(store, (s) => s.backgroundId)
  const overlayIds = useStore(store, (s) => s.overlayIds)
  const brightness = useStore(store, (s) => s.brightness)
  const setBackground = useStore(store, (s) => s.setBackground)
  const setOverlay = useStore(store, (s) => s.setOverlay)
  const setBrightness = useStore(store, (s) => s.setBrightness)
  const [query, setQuery] = useState('')
  const [listed, setListed] = useState<{
    view: View
    items: Listing[]
    failed: boolean
  } | null>(null)

  useEffect(() => {
    if (!view) return
    let cancelled = false
    listView(view.bounds).then(
      (items) => {
        if (!cancelled) setListed({ view, items, failed: false })
      },
      () => {
        if (!cancelled) setListed({ view, items: [], failed: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [view])

  // the last list stays until the new one arrives, so the panel does not flicker while the map moves
  const all = sortListing(listed?.items ?? [])
  const zoom = view?.zoom
  const inView = zoom === undefined ? all : all.filter((item) => visibleAtZoom(item, zoom))
  const backgrounds = inView.filter((item) => !item.overlay && matchesQuery(item, query))
  const overlays = inView.filter((item) => item.overlay && matchesQuery(item, query))
  const percent = Math.round(brightness * 100)
  const chosenOutOfView =
    backgroundId !== null && listed !== null && !inView.some((item) => item.id === backgroundId)

  return (
    <>
      {all.length > SEARCH_FROM ? (
        <div className="px-4 pb-2">
          <input
            type="search"
            aria-label="Search backgrounds"
            placeholder="Search backgrounds"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full rounded-md bg-white px-2.5 text-sm inset-ring-1 inset-ring-zinc-950/10 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10"
          />
        </div>
      ) : null}

      {listed === null ? (
        <p className="px-4 pb-3 text-sm text-zinc-500 dark:text-zinc-400">Loading backgrounds…</p>
      ) : listed.failed ? (
        <p className="px-4 pb-3 text-sm text-red-700 dark:text-red-400">
          The list of backgrounds could not be loaded.
        </p>
      ) : null}

      {listed !== null && !listed.failed && inView.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-zinc-500 dark:text-zinc-400">
          No background covers this view at this zoom.
        </p>
      ) : null}

      <div role="group" aria-label="Background" className="flex flex-col gap-1 px-2 pb-2">
        <Choice
          name="None"
          detail="No imagery under the map"
          selected={backgroundId === null}
          onSelect={() => setBackground(null)}
        />
        {backgrounds.map((item) => (
          <Choice
            key={item.id}
            name={item.name}
            detail={categoryLabel(item.category)}
            attribution={item.attributionText}
            best={item.best}
            selected={backgroundId === item.id}
            onSelect={() => setBackground(item.id)}
          />
        ))}
      </div>

      {chosenOutOfView ? (
        <p className="px-4 pb-3 text-xs text-zinc-500 dark:text-zinc-400">
          The chosen background does not cover this view at this zoom. It stays on the map.
        </p>
      ) : null}

      {overlays.length > 0 ? (
        <div className="border-t border-zinc-950/5 px-4 py-3 dark:border-white/5">
          <h3 className="pb-1 text-sm font-medium">Overlays</h3>
          <ul>
            {overlays.map((item) => (
              <li key={item.id} className="py-1">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-blue-600"
                    checked={overlayIds.includes(item.id)}
                    onChange={(event) => setOverlay(item.id, event.target.checked)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span>{item.name}</span>
                    {item.attributionText ? (
                      <span className={MUTED}>{item.attributionText}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {backgroundId !== null ? (
        <label className="flex items-center gap-3 border-t border-zinc-950/5 px-4 py-3 text-sm dark:border-white/5">
          <span className="w-20 shrink-0">Brightness</span>
          <input
            type="range"
            className="min-w-0 flex-1 accent-blue-600"
            min={Math.round(BRIGHTNESS_MIN * 100)}
            max={100}
            step={5}
            value={percent}
            aria-valuetext={`${percent}%`}
            onChange={(event) => setBrightness(Number(event.target.value) / 100)}
          />
          <span className="w-10 shrink-0 text-right text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {percent}%
          </span>
        </label>
      ) : null}
    </>
  )
}

/** One choice of the background: a button that looks chosen when it is, with the layer's attribution */
function Choice(props: {
  name: string
  detail?: string
  attribution?: string
  best?: boolean
  selected: boolean
  onSelect: () => void
}): ReactNode {
  const { name, detail, attribution, best, selected, onSelect } = props
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={classes(
        'flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500',
        toolButtonTone(selected ? 'selected' : 'idle'),
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium">{name}</span>
        {best ? (
          <span className="shrink-0 rounded-sm bg-blue-100 px-1 text-[10px] leading-4 font-medium text-blue-800 dark:bg-blue-400/15 dark:text-blue-300">
            Best
          </span>
        ) : null}
        {detail ? (
          <span className={classes('ml-auto shrink-0 truncate', MUTED)}>{detail}</span>
        ) : null}
      </span>
      {attribution ? (
        <span className={classes('line-clamp-2 w-full', MUTED)}>{attribution}</span>
      ) : null}
    </button>
  )
}
