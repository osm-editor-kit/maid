import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { isAutomated } from '@osm-editor-kit/maid-core'
import { getLocale, m } from '@osm-editor-kit/maid-i18n'
import { Flyout, toolButtonClass } from '@osm-editor-kit/maid-ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSearchActions, useSearchFocus, useSearchOpen } from '../search/flyout'
import { findLoaded, type LoadedFeature, MIN_LOADED_QUERY } from '../search/loaded'
import { mapZoomOf, type OsmId, parseSearch, type Position } from '../search/parse'
import { createPlaceSearch, type Place } from '../search/places'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { useCameraParam } from '../url/state'

/**
 * The search, in the top bar: one input and a list of what it finds, in groups. Coordinates and OSM
 * ids are read locally; the loaded features are searched in the data on the map; places come from
 * Nominatim, and only when the person presses Enter or "Search places" (see search/places.ts).
 * Ctrl+F / Cmd+F opens it (useShortcuts), Escape closes it (the flyout).
 */
export function SearchButton() {
  const open = useSearchOpen()
  const { openAtStart: openSearchAtStart, setOpen: setSearchOpen } = useSearchActions()
  const [camera] = useCameraParam()
  const hasPosition = camera !== null
  // the first start without a position opens the search once (flyout.ts)
  useEffect(
    function openSearchOnFirstStart() {
      openSearchAtStart(hasPosition)
    },
    [hasPosition, openSearchAtStart],
  )
  return (
    <Flyout
      label={m.search_panel_label()}
      placement="bottom-end"
      className="w-96"
      open={open}
      onOpenChange={setSearchOpen}
      // the panel focuses its own input, so the flyout does not pick the first button
      focus={false}
      trigger={
        <button
          type="button"
          aria-label={m.search_button()}
          title={m.search_button_title()}
          className={toolButtonClass(false, open)}
        >
          <MagnifyingGlassIcon aria-hidden="true" className="size-5" />
        </button>
      }
    >
      <SearchPanel />
    </Flyout>
  )
}

type Group = 'position' | 'object' | 'loaded' | 'places'

/**
 * A row of the list. `choice` runs when pressed; `action` is a button that does something else
 * (search places); `info` is text that cannot be chosen, such as "not loaded".
 */
interface Row {
  key: string
  group: Group
  kind: 'choice' | 'action' | 'info'
  label: string
  detail?: string
  disabled?: boolean
  run?: () => void
}

/** The places of the text in the box, once they were asked for */
interface PlacesView {
  status: 'loading' | 'done' | 'failed'
  places: Place[]
}

/** A number for a label: up to six decimals, no trailing zeros */
function figure(value: number, digits = 6): string {
  return String(Number(value.toFixed(digits)))
}

function SearchPanel() {
  const { editor, engine } = useShell()
  const { select } = useSelection()
  const focus = useSearchFocus()
  const { setOpen: setSearchOpen } = useSearchActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // the text the person sent (Enter or "Search places"): the places query runs for it, and only for it
  const [submitted, setSubmitted] = useState<string | null>(null)
  const query = text.trim()
  const placeSearch = useMemo(
    () => createPlaceSearch({ fetch: editor.fetch, language: getLocale() }),
    [editor],
  )
  const placesQuery = useQuery(placeSearch.query(submitted ?? ''))
  const parsed = parseSearch(query)

  // Ctrl+F while the flyout is open moves the focus back to the input
  useEffect(() => {
    inputRef.current?.focus()
  }, [focus])

  // read from the engine: the loaded features by name, and what the ids are
  const found = useEngine((e) => {
    const objects = parsed.ids.map((id: OsmId) => {
      const info = e.entity(id.id)
      return { ...id, known: info !== undefined, name: info?.tags.name, preset: info?.preset?.name }
    })
    if (query.length < MIN_LOADED_QUERY) return { objects, loaded: [] }
    const all = e.data.all()
    const hits = findLoaded(entitiesOf(all), query, {
      centre: centreOf(e.map),
      placeOf: (id) => {
        const at = e.centreOf(id)
        return at && { lon: at[0], lat: at[1] }
      },
    })
    const loaded = hits.map((hit) => ({ ...hit, preset: e.entity(hit.id)?.preset?.name }))
    return { objects, loaded }
  })

  const fly = (position: Position) => {
    const map = engine.map
    if (map) {
      const zoom =
        position.zoom === undefined ? Math.max(map.getZoom(), 17) : mapZoomOf(position.zoom)
      map.easeTo({ center: [position.lon, position.lat], zoom, duration: 400 })
    }
    setSearchOpen(false)
  }

  const flyToPlace = (place: Place) => {
    const map = engine.map
    const box = place.bounds
    if (map && box && (box.north > box.south || box.east > box.west)) {
      map.fitBounds(
        [
          [box.west, box.south],
          [box.east, box.north],
        ],
        { padding: 40, maxZoom: 18, duration: 400 },
      )
    } else if (map) {
      map.easeTo({
        center: [place.lon, place.lat],
        zoom: Math.max(map.getZoom(), 17),
        duration: 400,
      })
    }
    setSearchOpen(false)
  }

  const selectObject = (id: string) => {
    select(id)
    engine.fitTo([id])
    setSearchOpen(false)
  }

  const searchPlaces = () => {
    if (!query || isAutomated()) return
    // asked once per text: a text that was asked is answered from the query, and a failure is asked again
    if (submitted === query) {
      if (placesQuery.isError) void placesQuery.refetch()
      return
    }
    setSubmitted(query)
  }

  // the places of this text, once they were asked for; an answer to another text is not shown
  const placesFor: PlacesView | null =
    submitted !== null && submitted === query
      ? {
          status: placesQuery.isError
            ? 'failed'
            : placesQuery.data === undefined
              ? 'loading'
              : 'done',
          places: placesQuery.data ?? [],
        }
      : null

  const rows: Row[] = []
  parsed.positions.forEach((position, index) => {
    rows.push({
      key: `position-${index}`,
      group: 'position',
      kind: 'choice',
      label:
        position.zoom === undefined
          ? m.search_go_to({ lat: figure(position.lat), lon: figure(position.lon) })
          : m.search_go_to_zoom({
              lat: figure(position.lat),
              lon: figure(position.lon),
              zoom: figure(position.zoom, 2),
            }),
      run: () => fly(position),
    })
  })
  for (const object of found.objects) {
    if (object.known) {
      rows.push({
        key: `object-${object.id}`,
        group: 'object',
        kind: 'choice',
        label: object.name ? `${object.id}, ${object.name}` : object.id,
        detail: object.preset,
        run: () => selectObject(object.id),
      })
    } else {
      rows.push({
        key: `object-${object.id}`,
        group: 'object',
        kind: 'info',
        label: m.search_object_not_loaded({ id: object.id }),
        detail: m.search_object_not_loaded_hint(),
        disabled: true,
      })
    }
  }
  for (const hit of found.loaded) {
    rows.push({
      key: `loaded-${hit.id}`,
      group: 'loaded',
      kind: 'choice',
      label: hit.label,
      detail: hit.preset,
      run: () => selectObject(hit.id),
    })
  }
  if (query) {
    const enabled = !isAutomated()
    rows.push({
      key: 'places-action',
      group: 'places',
      kind: 'action',
      label: m.search_places_action(),
      detail: !enabled
        ? m.search_places_off()
        : placesFor === null
          ? m.search_places_enter_hint()
          : undefined,
      disabled: !enabled,
      run: searchPlaces,
    })
    if (placesFor?.status === 'loading')
      rows.push({
        key: 'places-status',
        group: 'places',
        kind: 'info',
        label: m.search_places_loading(),
      })
    if (placesFor?.status === 'failed')
      rows.push({
        key: 'places-status',
        group: 'places',
        kind: 'info',
        label: m.search_places_failed(),
      })
    if (placesFor?.status === 'done' && placesFor.places.length === 0)
      rows.push({
        key: 'places-status',
        group: 'places',
        kind: 'info',
        label: m.search_places_none(),
      })
    for (const place of placesFor?.status === 'done' ? placesFor.places : []) {
      rows.push({
        key: `place-${place.id}`,
        group: 'places',
        kind: 'choice',
        label: place.name,
        detail: place.type,
        run: () => flyToPlace(place),
      })
    }
  }

  const choices = rows.filter((row) => row.kind !== 'info' && !row.disabled && row.run)
  // Enter: the highlighted row; else the first coordinate or object; else the places (asked once)
  const submit = () => {
    const highlighted = rows.find((row) => row.key === activeKey)
    const row =
      highlighted ??
      rows.find(
        (item) => (item.group === 'position' || item.group === 'object') && item.kind === 'choice',
      )
    if (row && row.kind !== 'info' && !row.disabled) return row.run?.()
    if (!query) return
    if (placesFor === null) return searchPlaces()
    rows
      .find(
        (item) => (item.group === 'loaded' || item.group === 'places') && item.kind === 'choice',
      )
      ?.run?.()
  }

  const move = (step: 1 | -1) => {
    if (choices.length === 0) return
    const at = choices.findIndex((row) => row.key === activeKey)
    const next =
      at < 0
        ? step > 0
          ? choices[0]
          : choices[choices.length - 1]
        : choices[(at + step + choices.length) % choices.length]
    setActiveKey(next?.key ?? null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    }
    // Ctrl+F in the field: the browser's find is not wanted here; the field keeps the focus
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') event.preventDefault()
  }

  const groups: { group: Group; title: string }[] = [
    { group: 'position', title: m.search_group_position() },
    { group: 'object', title: m.search_group_object() },
    { group: 'loaded', title: m.search_group_loaded() },
    { group: 'places', title: m.search_group_places() },
  ]

  return (
    <form
      role="search"
      className="flex flex-col gap-2 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {m.search_input_label()}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={text}
        autoComplete="off"
        spellCheck={false}
        placeholder={m.search_placeholder()}
        aria-controls={listId}
        onChange={(event) => {
          setText(event.target.value)
          setActiveKey(null)
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg bg-white px-3 py-2 text-base text-zinc-950 ring-1 ring-zinc-950/15 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 dark:bg-zinc-900 dark:text-white dark:ring-white/15 dark:placeholder:text-zinc-500"
      />
      {query === '' ? (
        <p className="px-1 pb-1 text-xs text-zinc-500 dark:text-zinc-400">{m.search_hint()}</p>
      ) : (
        <div id={listId} className="max-h-[60vh] overflow-y-auto">
          {groups.map(({ group, title }) => {
            const groupRows = rows.filter((row) => row.group === group)
            if (groupRows.length === 0) return null
            return (
              <section key={group} className="pb-2">
                <h3 className="px-2 pt-2 pb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {title}
                </h3>
                <ul>
                  {groupRows.map((row) => (
                    <li key={row.key}>
                      {row.kind === 'info' ? (
                        <p role="status" className="px-2 py-1.5 text-zinc-500 dark:text-zinc-400">
                          {row.label}
                          {row.detail && <span className="block text-xs">{row.detail}</span>}
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={row.disabled}
                          aria-current={row.key === activeKey ? 'true' : undefined}
                          onClick={row.run}
                          onMouseEnter={() => setActiveKey(row.disabled ? null : row.key)}
                          className={`flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-400 ${
                            row.key === activeKey
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <span className="min-w-0 truncate">{row.label}</span>
                          {row.detail && (
                            <span
                              className={`max-w-[45%] shrink-0 truncate text-xs ${
                                row.key === activeKey
                                  ? 'text-blue-100'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {row.detail}
                            </span>
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </form>
  )
}

/** Every entity of the data, as the loaded-data search reads them: nodes, ways, then relations */
function* entitiesOf(all: {
  nodes: LoadedFeature[]
  ways: LoadedFeature[]
  relations: LoadedFeature[]
}) {
  yield* all.nodes
  yield* all.ways
  yield* all.relations
}

/** The centre of the view, for ordering the loaded features */
function centreOf(map: { getCenter(): { lng: number; lat: number } } | undefined) {
  const centre = map?.getCenter()
  return centre ? { lon: centre.lng, lat: centre.lat } : undefined
}
