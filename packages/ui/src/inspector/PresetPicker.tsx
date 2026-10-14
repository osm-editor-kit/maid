import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  HeartIcon as HeartSolidIcon,
} from '@heroicons/react/16/solid'
import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline'
import type { Browse, Preset } from '@osm-editor-kit/maid-presets'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isFavouriteNumber } from '../favourites.ts'
import { PLAIN_INPUT } from '../plain-input.ts'
import { EMPTY_NOTE, keepFocus, listboxMove, revealRow, ROW_ACTIVE } from './listbox.ts'
import { listRows, type ListRow } from './picker-browse.ts'
import { mainTagLabel } from './picker-logic.ts'
import { useRecents } from './recents.ts'
import { SearchField } from './SearchField.tsx'

// the colour is not here: a class of the same property in the same string would be overridden by the
// order of the generated CSS, so each button adds its own text colour (a favourite's heart is rose)
const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg enabled:cursor-pointer enabled:hover:bg-zinc-950/5 enabled:hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:enabled:hover:bg-white/10 dark:enabled:hover:text-white'
const ICON_TONE = 'text-zinc-500 dark:text-zinc-400'

/** A favourite as the picker shows it: its preset, and the number that starts it */
export type PickerFavourite = { preset: Preset; number: string }

/**
 * The texts of the picker that the editor translates (packages/i18n: picker_recent, picker_category_expand,
 * picker_category_collapse). English without them.
 */
export type PresetPickerTexts = { recent: string; expand: string; collapse: string }

const ENGLISH_TEXTS: PresetPickerTexts = {
  recent: 'Recently used',
  expand: 'Show the feature types in this category',
  collapse: 'Hide the feature types in this category',
}

/**
 * The number of a favourite, as a field. It is sent on Enter or when the field loses focus, not on
 * every key: a number that another favourite has swaps the two, so a half-typed number must not
 * swap. A number that is empty, zero or starts with zero is invalid: it is shown so, and not sent.
 * Escape gives back the number the favourite has.
 */
function FavouriteNumberField(props: {
  name: string
  value: string
  onCommit: (next: string) => void
}) {
  const { name, value, onCommit } = props
  const [draft, setDraft] = useState(value)
  // a number that changed elsewhere (a swap with another favourite) replaces the draft
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDraft(value)
  }
  const valid = isFavouriteNumber(draft)
  const commit = () => {
    if (valid && draft !== value) onCommit(draft)
  }
  return (
    <input
      {...PLAIN_INPUT}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label={`Number of ${name}`}
      aria-invalid={!valid}
      title="Hold the modifier key and type this number to start the feature type"
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        // an invalid number is given up: the favourite keeps the number it had
        if (valid) commit()
        else setDraft(value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
        }
      }}
      className="h-8 w-14 shrink-0 rounded-md border border-zinc-950/10 bg-white px-2 text-center font-mono text-xs text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 aria-invalid:border-rose-500 aria-invalid:text-rose-600 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:aria-invalid:border-rose-400 dark:aria-invalid:text-rose-400"
    />
  )
}

export function PresetPicker(props: {
  /** Returns the presets for a query, best first. Called on every change of the query. */
  search: (query: string) => Preset[]
  onPick: (preset: Preset) => void
  /** Draws a preset's icon (a category's too); without it rows have no icon */
  renderIcon?: (preset: Preset) => ReactNode
  /** The preset the feature has now, marked in the list */
  currentId?: string
  /**
   * The favourites for the feature's geometry, in order. With an empty search they are listed
   * first, under "Favourites", with their numbers.
   */
  favourites?: readonly PickerFavourite[]
  /**
   * Given, an empty search lists the recently used presets that fit the feature (under "Recently used", after the
   * favourites), then the defaults for its geometry: presets, and categories that expand in place to their members
   * (presets browseOf). Without it, an empty search lists what `search` gives for an empty query.
   */
  browse?: Browse
  /** The texts the picker shows that the editor translates. English without it. */
  texts?: PresetPickerTexts
  /** Given, every row gets a heart: it makes the preset a favourite, or takes it out again */
  onToggleFavourite?: (preset: Preset) => void
  /** Given with `onToggleFavourite`, the favourites in the list get move up and down buttons */
  onMoveFavourite?: (preset: Preset, delta: 1 | -1) => void
  /**
   * Given, every favourite gets a number field: the number the person types is given to the
   * favourite (a number another favourite has swaps the two). Invalid numbers are not sent.
   */
  onSetNumber?: (preset: Preset, number: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const {
    search,
    onPick,
    renderIcon,
    currentId,
    favourites = [],
    browse,
    texts = ENGLISH_TEXTS,
    onToggleFavourite,
    onMoveFavourite,
    onSetNumber,
    autoFocus = false,
    placeholder = 'Search feature types',
  } = props

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // the categories that are open: their members are listed under them, and only while nothing is searched
  const [openCategories, setOpenCategories] = useState<readonly string[]>([])
  const remember = useRecents((state) => state.remember)
  const recentIds = useRecents((state) => state.ids)
  const baseId = useId()
  const listId = `${baseId}-list`
  const favouritesHeadingId = `${baseId}-favourites`
  const recentHeadingId = `${baseId}-recent`
  const optionId = (index: number) => `${baseId}-option-${index}`

  // the favourites and the defaults are listed only while nothing is searched; their numbers show on every row
  const searching = query.trim() !== ''
  const numberById = new Map(favourites.map((favourite) => [favourite.preset.id, favourite.number]))
  const defaults = browse ? browse.defaults : searching ? [] : search('')
  const rows = listRows({
    searching,
    found: searching ? search(query) : [],
    defaults,
    recent: browse && !searching ? browse.recent(recentIds) : [],
    favourites: favourites.map((favourite) => favourite.preset),
    expanded: new Set(openCategories),
  })
  const active = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1)
  // the favourites come first in the list, then the recent presets: their rows are contiguous
  const favouriteCount = rows.filter(
    (row) => row.kind === 'preset' && row.section === 'favourite',
  ).length
  const recentCount = rows.filter((row) => row.kind === 'preset' && row.section === 'recent').length

  function moveTo(index: number) {
    setActiveIndex(index)
    revealRow(optionId(index))
  }

  function toggleCategory(id: string) {
    setOpenCategories((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  // a chosen preset becomes the most recent one (a hidden preset is not recorded, as iD)
  function pick(preset: Preset) {
    if (preset.searchable !== false) remember(preset.id)
    onPick(preset)
  }

  // Enter picks a preset, and opens or closes a category
  function activate(row: ListRow) {
    if (row.kind === 'category') toggleCategory(row.category.id)
    else pick(row.preset)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'Escape':
        // gives the keyboard back to the editor: its keys do not work inside a text field
        event.currentTarget.blur()
        break
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault()
        const next = listboxMove(event.key, active, rows.length)
        if (next !== undefined) moveTo(next)
        return
      }
      case 'Enter': {
        const row = rows[active]
        if (row) {
          event.preventDefault()
          activate(row)
        }
        return
      }
    }
  }

  /**
   * One preset row: the option itself, then, outside the option, the buttons that act on the preset.
   * They sit beside the option so that a button is never inside an element with the option role.
   * A member of an open category is indented.
   */
  function renderPresetRow(row: Extract<ListRow, { kind: 'preset' }>, index: number) {
    const { preset } = row
    const isActive = index === active
    const tag = mainTagLabel(preset)
    const number = numberById.get(preset.id)
    const isFavourite = number !== undefined
    const inFavourites = row.section === 'favourite'
    return (
      <div
        key={row.key}
        role="presentation"
        className={`group flex items-center gap-1 ${row.member ? 'pl-6' : ''}`}
      >
        <div
          id={optionId(index)}
          role="option"
          aria-selected={isActive}
          onMouseDown={keepFocus}
          onClick={() => pick(preset)}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm ${
            isActive ? ROW_ACTIVE : ''
          }`}
        >
          {renderIcon ? (
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950/5 dark:bg-white/10 [&>svg]:size-5">
              {renderIcon(preset)}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{preset.name}</span>
            {tag ? (
              <span className="block truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {tag}
              </span>
            ) : null}
          </span>
          {number !== undefined && !onSetNumber ? (
            <kbd className="shrink-0 rounded border border-zinc-950/10 px-1.5 font-mono text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
              {number}
            </kbd>
          ) : null}
          {preset.id === currentId ? (
            <span className="shrink-0 rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
              current
            </span>
          ) : null}
        </div>
        {inFavourites && onMoveFavourite ? (
          // shown on hover, and when a button of the row has the keyboard focus
          <span className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Move ${preset.name} up`}
              title="Move up"
              disabled={index === 0}
              onMouseDown={keepFocus}
              onClick={() => onMoveFavourite(preset, -1)}
              className={`${ICON_BUTTON} ${ICON_TONE}`}
            >
              <ChevronUpIcon className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Move ${preset.name} down`}
              title="Move down"
              disabled={index === favouriteCount - 1}
              onMouseDown={keepFocus}
              onClick={() => onMoveFavourite(preset, 1)}
              className={`${ICON_BUTTON} ${ICON_TONE}`}
            >
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        {number !== undefined && onSetNumber ? (
          <FavouriteNumberField
            name={preset.name}
            value={number}
            onCommit={(next) => onSetNumber(preset, next)}
          />
        ) : null}
        {onToggleFavourite ? (
          <button
            type="button"
            aria-pressed={isFavourite}
            aria-label={
              isFavourite
                ? `Remove ${preset.name} from favourites`
                : `Add ${preset.name} to favourites`
            }
            title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            onMouseDown={keepFocus}
            onClick={() => onToggleFavourite(preset)}
            className={`${ICON_BUTTON} ${isFavourite ? 'text-rose-600 dark:text-rose-400' : ICON_TONE}`}
          >
            {isFavourite ? (
              <HeartSolidIcon className="size-4" aria-hidden="true" />
            ) : (
              <HeartOutlineIcon className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    )
  }

  /** A category row: it opens or closes its members in place; a chevron shows which */
  function renderCategoryRow(row: Extract<ListRow, { kind: 'category' }>, index: number) {
    const { category } = row
    const isActive = index === active
    return (
      <div key={row.key} role="presentation" className="group flex items-center gap-1">
        <div
          id={optionId(index)}
          role="option"
          aria-selected={isActive}
          title={row.expanded ? texts.collapse : texts.expand}
          onMouseDown={keepFocus}
          onClick={() => {
            moveTo(index)
            toggleCategory(category.id)
          }}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm ${
            isActive ? ROW_ACTIVE : ''
          }`}
        >
          {renderIcon ? (
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950/5 dark:bg-white/10 [&>svg]:size-5">
              {renderIcon(category)}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{category.name}</span>
          </span>
          {row.expanded ? (
            <ChevronDownIcon
              className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              aria-hidden="true"
            />
          ) : (
            <ChevronRightIcon
              className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    )
  }

  function renderRow(row: ListRow, index: number) {
    return row.kind === 'category' ? renderCategoryRow(row, index) : renderPresetRow(row, index)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SearchField
        {...PLAIN_INPUT}
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={rows.length > 0}
        aria-controls={rows.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setActiveIndex(0)
          setOpenCategories([])
        }}
        onKeyDown={onKeyDown}
      />

      {rows.length === 0 ? (
        <p className={EMPTY_NOTE}>No feature type found</p>
      ) : (
        <div
          id={listId}
          role="listbox"
          aria-label="Feature types"
          className="max-h-[26rem] overflow-y-auto"
        >
          {favouriteCount > 0 ? (
            <div
              role="group"
              aria-labelledby={favouritesHeadingId}
              className="mb-2 border-b border-zinc-950/10 pb-2 dark:border-white/10"
            >
              <p
                id={favouritesHeadingId}
                className="px-2 pt-1 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
              >
                Favourites
              </p>
              {rows.slice(0, favouriteCount).map((row, index) => renderRow(row, index))}
            </div>
          ) : null}
          {recentCount > 0 ? (
            <div
              role="group"
              aria-labelledby={recentHeadingId}
              className="mb-2 border-b border-zinc-950/10 pb-2 dark:border-white/10"
            >
              <p
                id={recentHeadingId}
                className="px-2 pt-1 pb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
              >
                {texts.recent}
              </p>
              {rows
                .slice(favouriteCount, favouriteCount + recentCount)
                .map((row, offset) => renderRow(row, favouriteCount + offset))}
            </div>
          ) : null}
          {rows
            .slice(favouriteCount + recentCount)
            .map((row, offset) => renderRow(row, favouriteCount + recentCount + offset))}
        </div>
      )}
    </div>
  )
}
