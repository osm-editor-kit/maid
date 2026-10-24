import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  StarIcon as StarSolidIcon,
} from '@heroicons/react/16/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import type { Browse, Geometry, Preset } from '@osm-editor-kit/maid-presets'
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ENGLISH_FAVOURITE_TEXTS,
  isDrawnGeometry,
  type FavouriteEntry,
  type FavouriteTexts,
} from '../favourites.ts'
import { FlyoutPinnedContext } from '../Flyout.tsx'
import { GeometryIcon } from '../GeometryIcons.tsx'
import { ICON_BUTTON, ICON_TONE } from '../icon-button.ts'
import { PLAIN_INPUT } from '../plain-input.ts'
import { EMPTY_NOTE, keepFocus, listboxMove, listRow, revealRow } from './listbox.ts'
import { isCategory, listRows, type ListRow } from './picker-browse.ts'
import { mainTagLabel, startRow } from './picker-logic.ts'
import { useRecentIds, useRecentsActions } from './recents.ts'
import { SearchField } from './SearchField.tsx'

/** A favourite as the picker takes it: its preset, its number and its geometry */
export type PickerFavourite = FavouriteEntry

/**
 * The texts of the picker that the editor translates (packages/i18n: picker_recent, picker_category_expand,
 * picker_category_collapse, picker_favourites, ...). English without them.
 */
export type PresetPickerTexts = {
  recent: string
  expand: string
  collapse: string
  /** The Favourites row, and its hint when it is open or closed */
  favourites: string
  favouritesExpand: string
  favouritesCollapse: string
} & FavouriteTexts

const ENGLISH_TEXTS: PresetPickerTexts = {
  recent: 'Recently used',
  expand: 'Show the feature types in this category',
  collapse: 'Hide the feature types in this category',
  favourites: 'Favourites',
  favouritesExpand: 'Show all your favourites',
  favouritesCollapse: 'Hide your favourites',
  ...ENGLISH_FAVOURITE_TEXTS,
}

/** The square an icon sits in; a favourite's number sits on its corner, as a small badge */
function IconBox(props: { children?: ReactNode; number?: string; title?: string }) {
  const { children, number, title } = props
  return (
    <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950/5 dark:bg-white/10 [&>svg]:size-5">
      {children}
      {number !== undefined ? (
        <span
          title={title}
          className="absolute -right-1 -bottom-1 min-w-5 rounded-full bg-zinc-800 px-1 text-center font-mono text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-white dark:bg-zinc-200 dark:text-zinc-900 dark:ring-zinc-800"
        >
          {number}
        </span>
      ) : null}
    </span>
  )
}

/** The star of a row: filled for a favourite, and a click takes the favourite out again */
function StarButton(props: { name: string; on: boolean; onClick: () => void }) {
  const { name, on, onClick } = props
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={`${ICON_BUTTON} ${on ? 'text-amber-500 dark:text-amber-400' : ICON_TONE}`}
    >
      {on ? (
        <StarSolidIcon className="size-4" aria-hidden="true" />
      ) : (
        <StarOutlineIcon className="size-4" aria-hidden="true" />
      )}
    </button>
  )
}

/** The rows of a part of the list that are contiguous: how many, from `start` on, satisfy `test` */
function leadingCount(rows: readonly ListRow[], start: number, test: (row: ListRow) => boolean) {
  let count = 0
  for (let at = start; at < rows.length; at++) {
    const row = rows[at]
    if (!row || !test(row)) break
    count++
  }
  return count
}

const isFavouriteRow = (row: ListRow) =>
  row.kind === 'favourites' || (row.kind === 'preset' && row.section === 'favourite')
const isRecentRow = (row: ListRow) => row.kind === 'preset' && row.section === 'recent'

export function PresetPicker(props: {
  /** Returns the presets for a query, best first. Called on every change of the query. */
  search: (query: string) => Preset[]
  onPick: (preset: Preset) => void
  /** Draws a preset's icon (a category's too); without it rows have no icon */
  renderIcon?: (preset: Preset) => ReactNode
  /** The preset the feature has now, marked in the list */
  currentId?: string
  /**
   * The favourites, of every geometry, in order. They are listed under the Favourites row, which opens to show them
   * all. A favourite whose geometry is not `geometry` is shown disabled.
   */
  favourites?: readonly PickerFavourite[]
  /**
   * The geometry of the feature, when all the features share one. The favourites of this geometry are the ones that
   * fit; a star on a row makes or takes out a favourite for it. Undefined for several geometries: nothing fits.
   */
  geometry?: Geometry
  /**
   * Given, an empty search lists the recently used presets that fit the feature (under "Recently used", after the
   * Favourites row), then the defaults for its geometry: presets, and categories that expand in place to their
   * members (presets browseOf). Without it, an empty search lists what `search` gives for an empty query.
   */
  browse?: Browse
  /** The texts the picker shows that the editor translates. English without it. */
  texts?: PresetPickerTexts
  /** Given, every row of a geometry the feature has gets a star: it makes the preset a favourite, or takes it out again */
  onToggleFavourite?: (preset: Preset, geometry: Geometry) => void
  /** Given with `onToggleFavourite`, the favourites of a geometry in the Favourites row get move up and down buttons */
  onMoveFavourite?: (preset: Preset, geometry: Geometry, delta: 1 | -1) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const {
    search,
    onPick,
    renderIcon,
    currentId,
    favourites: storedFavourites = [],
    geometry,
    browse,
    texts = ENGLISH_TEXTS,
    onToggleFavourite,
    onMoveFavourite,
    autoFocus = false,
    placeholder = 'Search feature types',
  } = props
  const pinned = useContext(FlyoutPinnedContext)
  // a relation cannot be drawn, so no favourite fits it: the Favourites row is not shown for it
  const favourites = geometry === 'relation' ? [] : storedFavourites

  const [query, setQuery] = useState('')
  // the categories that are open: their members are listed under them, and only while nothing is searched. The
  // picker opens with the current type's category open, so the type is in view
  const [openCategories, setOpenCategories] = useState<readonly string[]>(() =>
    currentId && browse
      ? browse.defaults
          .filter((row) => isCategory(row) && row.members.some((member) => member.id === currentId))
          .map((row) => row.id)
      : [],
  )
  const [favouritesOpen, setFavouritesOpen] = useState(false)
  const { remember } = useRecentsActions()
  const recentIds = useRecentIds()
  // the current type is the active row when the picker opens (a keyboard's Enter keeps it); found in the rows below
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const recentHeadingId = `${baseId}-recent`
  const optionId = (index: number) => `${baseId}-option-${index}`

  // the favourites and the defaults are listed only while nothing is searched
  const searching = query.trim() !== ''
  const defaults = browse ? browse.defaults : searching ? [] : search('')
  const rows = listRows({
    searching,
    found: searching ? search(query) : [],
    defaults,
    recent: browse && !searching ? browse.recent(recentIds) : [],
    favourites,
    favouritesOpen,
    expanded: new Set(openCategories),
  })
  const currentRow =
    currentId === undefined
      ? -1
      : rows.findIndex(
          (row) =>
            row.kind === 'preset' && row.section !== 'favourite' && row.preset.id === currentId,
        )
  // the Favourites row and its members come first, then the recent presets: each part's rows are contiguous
  const favouriteCount = leadingCount(rows, 0, isFavouriteRow)
  const recentCount = leadingCount(rows, favouriteCount, isRecentRow)
  const active =
    rows.length === 0
      ? -1
      : Math.min(activeIndex ?? startRow(currentRow, favouriteCount, recentCount), rows.length - 1)

  // the current type's row in view when the picker opens (once: later moves reveal their own rows)
  const firstActive = useRef(active > 0 ? optionId(active) : undefined)
  useEffect(function revealTheCurrentTypeOnOpen() {
    if (firstActive.current !== undefined) revealRow(firstActive.current)
  }, [])

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

  /** A favourite whose geometry is not the feature's cannot be picked: it is shown disabled */
  function isDisabled(row: ListRow) {
    return row.kind === 'preset' && row.section === 'favourite' && row.geometry !== geometry
  }

  // Enter picks a preset, and opens or closes a category or the Favourites row
  function activate(row: ListRow) {
    if (row.kind === 'category') toggleCategory(row.category.id)
    else if (row.kind === 'favourites') setFavouritesOpen((open) => !open)
    else if (!isDisabled(row)) pick(row.preset)
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
   * One preset row: the option itself, then, outside the option, the buttons that act on the preset. They sit beside
   * the option so that a button is never inside an element with the option role. A member of an open category is
   * indented. A favourite's number is a badge on its icon; its geometry is the row's, or the feature's.
   */
  function renderPresetRow(row: Extract<ListRow, { kind: 'preset' }>, index: number) {
    const { preset } = row
    const isActive = index === active
    const disabled = isDisabled(row)
    const rowGeometry = row.geometry ?? geometry
    const entry =
      rowGeometry === undefined
        ? undefined
        : favourites.find((item) => item.preset.id === preset.id && item.geometry === rowGeometry)
    const number = entry?.number
    const drawn =
      row.geometry !== undefined && isDrawnGeometry(row.geometry) ? row.geometry : undefined
    const tag = mainTagLabel(preset)
    // the favourites of the row's geometry, in order: their move buttons are at the ends of this list
    const ofGeometry = favourites.filter((item) => item.geometry === rowGeometry)
    const position = ofGeometry.findIndex((item) => item.preset.id === preset.id)
    return (
      <div
        key={row.key}
        role="presentation"
        className={`group flex items-center gap-1 pr-1 ${listRow({ current: preset.id === currentId, active: isActive })} ${row.member ? 'ml-6' : ''}`}
      >
        <div
          id={optionId(index)}
          role="option"
          aria-selected={isActive}
          aria-disabled={disabled || undefined}
          onMouseDown={keepFocus}
          onClick={() => {
            if (!disabled) pick(preset)
          }}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-sm ${
            disabled ? 'cursor-default opacity-50' : 'cursor-pointer'
          }`}
        >
          <IconBox
            number={number}
            title={number !== undefined ? texts.startHint(preset.name, number) : undefined}
          >
            {renderIcon?.(preset)}
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{preset.name}</span>
            {tag ? (
              <span className="block truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {tag}
              </span>
            ) : null}
          </span>
          {disabled && drawn ? (
            <span
              title={texts.onlyAs(texts.geometries[drawn])}
              className="inline-flex shrink-0 text-zinc-500 dark:text-zinc-400 [&>svg]:size-4"
            >
              <GeometryIcon geometry={drawn} />
              <span className="sr-only">{texts.onlyAs(texts.geometries[drawn])}</span>
            </span>
          ) : null}
          {preset.id === currentId ? (
            <span className="shrink-0 rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
              current
            </span>
          ) : null}
        </div>
        {row.section === 'favourite' && onMoveFavourite && rowGeometry !== undefined ? (
          // shown on hover, and when a button of the row has the keyboard focus
          <span className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Move ${preset.name} up`}
              title="Move up"
              disabled={position <= 0}
              onMouseDown={keepFocus}
              onClick={() => onMoveFavourite(preset, rowGeometry, -1)}
              className={`${ICON_BUTTON} ${ICON_TONE}`}
            >
              <ChevronUpIcon className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Move ${preset.name} down`}
              title="Move down"
              disabled={position < 0 || position === ofGeometry.length - 1}
              onMouseDown={keepFocus}
              onClick={() => onMoveFavourite(preset, rowGeometry, 1)}
              className={`${ICON_BUTTON} ${ICON_TONE}`}
            >
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        {onToggleFavourite && rowGeometry !== undefined ? (
          <StarButton
            name={preset.name}
            on={entry !== undefined}
            onClick={() => onToggleFavourite(preset, rowGeometry)}
          />
        ) : null}
      </div>
    )
  }

  /** A category row: it opens or closes its members in place; a chevron shows which */
  function renderCategoryRow(row: Extract<ListRow, { kind: 'category' }>, index: number) {
    const { category } = row
    const isActive = index === active
    return (
      <div
        key={row.key}
        role="presentation"
        className={`group flex items-center gap-1 pr-1 ${listRow({ active: isActive })}`}
      >
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
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm"
        >
          <IconBox>{renderIcon?.(category)}</IconBox>
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

  /** The Favourites row: a star, and a chevron that shows whether all the favourites are listed under it */
  function renderFavouritesRow(row: Extract<ListRow, { kind: 'favourites' }>, index: number) {
    const isActive = index === active
    return (
      <div
        key={row.key}
        role="presentation"
        className={`group flex items-center gap-1 pr-1 ${listRow({ active: isActive })}`}
      >
        <div
          id={optionId(index)}
          role="option"
          aria-selected={isActive}
          title={row.expanded ? texts.favouritesCollapse : texts.favouritesExpand}
          onMouseDown={keepFocus}
          onClick={() => {
            moveTo(index)
            setFavouritesOpen((open) => !open)
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm"
        >
          <IconBox>
            <StarSolidIcon className="text-amber-500 dark:text-amber-400" aria-hidden="true" />
          </IconBox>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{texts.favourites}</span>
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
    if (row.kind === 'category') return renderCategoryRow(row, index)
    if (row.kind === 'favourites') return renderFavouritesRow(row, index)
    return renderPresetRow(row, index)
  }

  const before = rows.slice(0, favouriteCount)
  const recent = rows.slice(favouriteCount, favouriteCount + recentCount)
  const rest = rows.slice(favouriteCount + recentCount)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SearchField
        {...PLAIN_INPUT}
        type="search"
        role="combobox"
        // Alt and a number pick a favourite here too: the field has the focus right after a drawing (FavouriteHint)
        data-favourite-keys=""
        autoComplete="off"
        spellCheck={false}
        // in a flyout that only shows on hover the field waits for a click; then it is made again with the focus
        key={pinned ? 'pinned' : 'shown'}
        autoFocus={autoFocus && pinned}
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
          setFavouritesOpen(false)
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
            <div className="mb-2 border-b border-zinc-950/10 pb-2 dark:border-white/10">
              {before.map((row, offset) => renderRow(row, offset))}
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
              {recent.map((row, offset) => renderRow(row, favouriteCount + offset))}
            </div>
          ) : null}
          {rest.map((row, offset) => renderRow(row, favouriteCount + recentCount + offset))}
        </div>
      )}
    </div>
  )
}
