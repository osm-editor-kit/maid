/**
 * The sidebar field for `surface` and `smoothness`: two tiles, each with its photo and name, that open a picker in a
 * flyout. The picker has a search that has the focus when it opens: it filters the photos as you type, and when no
 * photo matches it lists the other values and the typed one. Choosing writes the tag at once and closes the flyout.
 *
 * The tag (`surface=gravel`) shows on a tile or a card only while it is hovered or focused. The clear button removes
 * a tag. Without `onChange` (read-only) the tiles show and nothing opens.
 */
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/16/solid'
import { Flyout, type FieldProps, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  creditsFor,
  isKnownSmoothness,
  type Named,
  optionStep,
  type Picture,
  pickerView,
  SMOOTHNESS_KEY,
  smoothnessChoices,
  smoothnessOthers,
  smoothnessPicture,
  smoothnessTitle,
  SURFACE_KEY,
  surfaceGroups,
  surfaceOthers,
  surfacePicture,
  surfaceTitle,
} from './logic.ts'
import { PICTURES } from './photos.ts'

/** Which picker is open */
type Picker = typeof SURFACE_KEY | typeof SMOOTHNESS_KEY

/** A card of a picker: a surface or a level, with its photo (or emoji) and, for a level of a surface, its description */
type Card = { value: string; label: string; description?: string; picture?: Picture }

/** A group of cards; the title is absent for a picker with one group */
type CardGroup = { title?: string; items: Card[] }

/** The surface cards do not change: computed once */
const SURFACE_CARDS: CardGroup[] = surfaceGroups().map((group) => ({
  title: group.title,
  items: group.items.map((item) => ({
    value: item.value,
    label: item.label,
    picture: item.picture,
  })),
}))
const SURFACE_OTHERS = surfaceOthers()

const TILE =
  'group/tile flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-zinc-950/10 bg-white p-1.5 text-left text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white'
const TILE_BUTTON = `${TILE} cursor-pointer hover:border-zinc-950/20 enabled:hover:bg-zinc-50 dark:hover:border-white/20 dark:enabled:hover:bg-zinc-900`
/** The tag of a tile, over the bottom of its photo while the tile is hovered or focused */
const TILE_TAG =
  'pointer-events-none absolute inset-x-0 bottom-0 truncate bg-zinc-950/75 px-1.5 py-0.5 text-left font-mono text-[0.65rem] text-white opacity-0 transition-opacity group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100'
/** The tag and the description of a card, over the bottom of its photo while the card is hovered or active */
const CARD_CAPTION =
  'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 overflow-hidden rounded-b-md bg-zinc-950/75 px-1.5 py-1 text-left text-white opacity-0 transition-opacity group-hover/option:opacity-100 group-aria-selected/option:opacity-100'
const PICK_CHOSEN = 'ring-2 ring-inset ring-blue-500'
const ROW_ACTIVE = 'bg-zinc-950/10 dark:bg-white/15'
const MUTED = 'text-zinc-500 dark:text-zinc-400'

/** The tag a tile or a card stands for, as the tag is written: `surface=gravel` */
function tagText(key: string, value: string) {
  return `${key}=${value}`
}

/** The content of a frame for a picture: the photo, or the emoji large and centred; the text when a photo has no file */
function pictureContent(picture: Picture, alt: string, text: string) {
  switch (picture.kind) {
    case 'photo': {
      const url = PICTURES[picture.path]
      return url === undefined ? (
        <span className={`px-2 text-center text-xs ${MUTED}`}>{text}</span>
      ) : (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      )
    }
    case 'emoji':
      return (
        <>
          <span aria-hidden="true" className="text-5xl leading-none">
            {picture.text}
          </span>
          <span className="sr-only">{alt}</span>
        </>
      )
  }
}

/**
 * A picture in a frame: the photo or the emoji of the picture, or the text when there is no picture.
 * The photos are square; the frame's size comes from `className`.
 */
function Frame(props: { picture?: Picture; alt: string; text: string; className: string }) {
  const { picture, alt, text, className } = props
  return (
    <span
      className={`grid place-items-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900 ${className}`}
    >
      {picture === undefined ? (
        <span className={`px-2 text-center text-xs ${MUTED}`}>{text}</span>
      ) : (
        pictureContent(picture, alt, text)
      )}
    </span>
  )
}

/** The face of a tile: the picture with the tag over it on hover, and the name (the title, or the value when it is not in the catalogue) */
function TileFace(props: {
  name: string
  tagKey: string
  value?: string
  title?: string
  picture?: Picture
}) {
  const { name, tagKey, value, title, picture } = props
  const empty = value === undefined
  const label = title ?? value ?? name
  return (
    <>
      <span className="relative block h-16 w-full">
        <Frame
          picture={empty ? undefined : picture}
          alt={label}
          text={empty ? name : label}
          className="size-full"
        />
        {empty ? null : <span className={TILE_TAG}>{tagText(tagKey, value)}</span>}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{empty ? 'Choose…' : label}</span>
    </>
  )
}

/** The credits of the photos a picker shows: the catalogue's licence and source, for the CC licences */
function Credits(props: { paths: readonly string[] }) {
  const credits = creditsFor(props.paths)
  if (credits.length === 0) return null
  return (
    <details className={`text-xs ${MUTED}`}>
      <summary className="cursor-pointer select-none hover:text-zinc-950 dark:hover:text-white">
        Photo credits
      </summary>
      <ul className="mt-1.5 grid gap-1 break-words">
        {credits.map((credit) => (
          <li key={credit.file}>
            {credit.file.slice(credit.file.lastIndexOf('/') + 1)}: {credit.license}, {credit.source}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** A card of the picker: its photo with the tag and description over it on hover, and its name below */
function CardOption(props: {
  id: string
  card: Card
  tagKey: string
  active: boolean
  chosen: boolean
  onPick: (value: string) => void
}) {
  const { id, card, tagKey, active, chosen, onPick } = props
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-current={chosen || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(card.value)}
      className={`group/option flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg p-1 text-left text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/10 ${active ? ROW_ACTIVE : ''} ${chosen ? PICK_CHOSEN : ''}`}
    >
      <span className="relative block aspect-square w-full">
        <Frame picture={card.picture} alt={card.label} text={card.label} className="size-full" />
        <span className={CARD_CAPTION}>
          <span className="truncate font-mono text-[0.7rem] font-medium">
            {tagText(tagKey, card.value)}
          </span>
          {card.description !== undefined ? (
            <span className="line-clamp-5 text-[0.65rem] leading-snug text-zinc-200">
              {card.description}
            </span>
          ) : null}
        </span>
      </span>
      <span className="min-w-0 truncate text-xs font-medium">{card.label}</span>
    </div>
  )
}

/** A row of the picker below the cards: a value without a card, or the typed value */
function ValueRow(props: {
  id: string
  label: string
  value: string
  active: boolean
  chosen: boolean
  onPick: (value: string) => void
}) {
  const { id, label, value, active, chosen, onPick } = props
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-current={chosen || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(value)}
      className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/10 ${active ? ROW_ACTIVE : ''} ${chosen ? PICK_CHOSEN : ''}`}
    >
      <span className="min-w-0 truncate font-medium">{label}</span>
      <span className={`min-w-0 truncate font-mono text-xs ${MUTED}`}>{value}</span>
    </div>
  )
}

/**
 * A picker: a search that has the focus, and the list under it. The list has a fixed height, the height it has with
 * all its cards, so that the flyout does not change height while the search narrows the list. The arrow keys move the
 * highlight (`aria-activedescendant`), Enter picks it, a click picks the option, Escape closes the picker.
 */
function Picker(props: {
  label: string
  placeholder: string
  tagKey: string
  groups: CardGroup[]
  others: Named[]
  columns: 3 | 4
  chosen?: string
  hint?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const { label, placeholder, tagKey, groups, others, columns, chosen, hint, onPick, onClose } =
    props
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [fullHeight, setFullHeight] = useState<number | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const allCards = groups.flatMap((group) => group.items)
  const view = pickerView(allCards, others, query)
  // the place of each shown card in the options: the cards come first, in the order the groups show them
  const place = new Map(view.cards.map((card, index): [Card, number] => [card, index]))
  const shownGroups = groups
    .map((group) => ({ title: group.title, items: group.items.filter((item) => place.has(item)) }))
    .filter((group) => group.items.length > 0)
  const typedOption: Named[] =
    view.typed === undefined ? [] : [{ value: view.typed, label: `Use '${query.trim()}'` }]
  const options: Named[] = [...view.cards, ...view.others, ...typedOption]
  const cardCount = view.cards.length
  const active = options.length === 0 ? -1 : Math.min(activeIndex, options.length - 1)
  const credits = allCards.flatMap((card) =>
    card.picture?.kind === 'photo' ? [card.picture.path] : [],
  )

  // the height with all the cards, measured once while nothing is typed; the box keeps it for every search
  function keepFullHeight() {
    if (fullHeight !== undefined || query.trim() !== '') return
    const height = box.current?.scrollHeight
    if (height) setFullHeight(height)
  }
  useLayoutEffect(keepFullHeight, [fullHeight, query])

  function moveTo(index: number) {
    setActiveIndex(index)
    document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      // the editor does not see the key: it closes the picker only
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      const option = options[active]
      if (option !== undefined) {
        event.preventDefault()
        onPick(option.value)
      }
      return
    }
    // with nothing typed, Left and Right move the highlight too; with text they move the caret
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && query === '') {
      if (options.length === 0) return
      event.preventDefault()
      const step = event.key === 'ArrowRight' ? 1 : -1
      moveTo(Math.min(Math.max(active + step, 0), options.length - 1))
      return
    }
    const next = optionStep(active, event.key, options.length, cardCount, columns)
    if (next !== undefined) {
      event.preventDefault()
      moveTo(next)
    }
  }

  const othersStart = cardCount
  return (
    <div className="grid gap-3 p-3">
      <div className="relative flex min-w-0">
        <MagnifyingGlassIcon
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
        />
        <input
          {...PLAIN_INPUT}
          type="search"
          role="combobox"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full min-w-0 rounded-lg border border-zinc-950/10 bg-white pr-3 pl-9 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:[color-scheme:dark] dark:placeholder:text-zinc-500 dark:hover:border-white/20"
        />
      </div>

      {hint !== undefined ? <p className={`text-xs ${MUTED}`}>{hint}</p> : null}

      <div
        id={listId}
        ref={box}
        role="listbox"
        aria-label={label}
        style={{ height: fullHeight }}
        className="max-h-[65vh] overflow-y-auto p-0.5"
      >
        <div className={`grid gap-x-2 gap-y-3 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {shownGroups.map((group) => (
            <div
              key={group.title ?? ''}
              role="group"
              aria-label={group.title ?? label}
              className="contents"
            >
              {group.title !== undefined ? (
                <p className={`col-span-full text-xs font-medium ${MUTED}`}>{group.title}</p>
              ) : null}
              {group.items.map((card) => {
                const index = place.get(card) ?? -1
                return (
                  <CardOption
                    key={card.value}
                    id={optionId(index)}
                    card={card}
                    tagKey={tagKey}
                    active={index === active}
                    chosen={card.value === chosen}
                    onPick={onPick}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {view.others.length > 0 || view.typed !== undefined ? (
          <div role="group" aria-label="Other values" className="mt-3 grid gap-0.5">
            {view.others.length > 0 ? (
              <p className={`px-2 pt-1 pb-0.5 text-xs font-medium ${MUTED}`}>Other values</p>
            ) : null}
            {view.others.map((other, offset) => (
              <ValueRow
                key={other.value}
                id={optionId(othersStart + offset)}
                label={other.label}
                value={other.value}
                active={othersStart + offset === active}
                chosen={other.value === chosen}
                onPick={onPick}
              />
            ))}
            {view.typed !== undefined ? (
              <ValueRow
                id={optionId(othersStart + view.others.length)}
                label={`Use '${query.trim()}'`}
                value={view.typed}
                active={othersStart + view.others.length === active}
                chosen={view.typed === chosen}
                onPick={onPick}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <Credits paths={credits} />
    </div>
  )
}

/** The surface picker: the catalogue's surfaces in two groups, four to a row, and the values without a photo */
function SurfacePicker(props: {
  chosen?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  return (
    <Picker
      label="Surface"
      placeholder="Search surfaces"
      tagKey={SURFACE_KEY}
      groups={SURFACE_CARDS}
      others={SURFACE_OTHERS}
      columns={4}
      chosen={props.chosen}
      onPick={props.onPick}
      onClose={props.onClose}
    />
  )
}

/**
 * The smoothness picker: the levels for the chosen surface, best to worst, with their photos and descriptions; the
 * generic levels (their emoji) without a surface or a surface without photos. A value the surface does not offer is
 * shown first, marked, so that it is not hidden. The levels the surface has no photo for are the other values.
 */
function SmoothnessPicker(props: {
  surface?: string
  chosen?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const { surface, chosen, onPick, onClose } = props
  const { photos, choices } = smoothnessChoices(surface)
  const offered: Card[] = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    picture: choice.picture,
    description: choice.description,
  }))
  const notOffered: Card[] =
    chosen !== undefined && !choices.some((choice) => choice.value === chosen)
      ? [
          {
            value: chosen,
            label: smoothnessTitle(chosen) ?? chosen,
            picture: smoothnessPicture(surface, chosen),
            description: isKnownSmoothness(chosen)
              ? 'Not offered for this surface'
              : 'Not in the catalogue',
          },
        ]
      : []
  const cards = [...notOffered, ...offered]
  const hint =
    surface === undefined
      ? 'Choose a surface first for its photos. These are the levels.'
      : photos
        ? undefined
        : 'No photos for this surface: the levels.'
  return (
    <Picker
      label="Smoothness"
      placeholder="Search smoothness"
      tagKey={SMOOTHNESS_KEY}
      groups={[{ items: cards }]}
      others={smoothnessOthers(cards.map((card) => card.value))}
      columns={3}
      chosen={chosen}
      hint={hint}
      onPick={onPick}
      onClose={onClose}
    />
  )
}

/** One tile: a flyout with its picker, or a plain frame when read-only. The clear button sits on its corner. */
function ValueTile(props: {
  id?: string
  name: string
  tagKey: string
  picker: Picker
  open: Picker | undefined
  setOpen: (picker: Picker | undefined) => void
  value?: string
  title?: string
  picture?: Picture
  onClear?: () => void
  children?: ReactNode
}) {
  const { id, name, tagKey, picker, open, setOpen, value, title, picture, onClear, children } =
    props
  const face = (
    <TileFace name={name} tagKey={tagKey} value={value} title={title} picture={picture} />
  )
  if (children === undefined) {
    return <div className={TILE}>{face}</div>
  }
  return (
    <div className="relative min-w-0">
      <Flyout
        label={name}
        placement="right"
        className="w-[34rem]"
        focus={false}
        open={open === picker}
        onOpenChange={(next) => setOpen(next ? picker : undefined)}
        trigger={
          <button id={id} type="button" aria-haspopup="dialog" className={TILE_BUTTON}>
            {face}
          </button>
        }
      >
        {children}
      </Flyout>
      {onClear !== undefined && value !== undefined ? (
        <button
          type="button"
          aria-label={`Clear ${name.toLowerCase()}`}
          title={`Clear ${name.toLowerCase()}`}
          onClick={onClear}
          className="absolute top-1 right-1 grid size-5 cursor-pointer place-items-center rounded-full bg-white/90 text-zinc-600 shadow-xs hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:text-white"
        >
          <XMarkIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Empty tags are no value */
function valueOf(tags: FieldProps['tags'], key: string) {
  const value = tags[key]
  return value === undefined || value === '' ? undefined : value
}

/** The field the module registers for the type `surfaceSmoothness` */
export function SurfaceSmoothnessField(props: FieldProps) {
  const { tags, id, onChange } = props
  const surface = valueOf(tags, SURFACE_KEY)
  const smoothness = valueOf(tags, SMOOTHNESS_KEY)
  const [open, setOpen] = useState<Picker | undefined>(undefined)

  const writable = onChange !== undefined
  const choose = (key: Picker) => (value: string) => {
    onChange?.(key, value)
    setOpen(undefined)
  }
  const close = () => setOpen(undefined)

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <ValueTile
        id={id}
        name="Surface"
        tagKey={SURFACE_KEY}
        picker={SURFACE_KEY}
        open={open}
        setOpen={setOpen}
        value={surface}
        title={surface === undefined ? undefined : surfaceTitle(surface)}
        picture={surface === undefined ? undefined : surfacePicture(surface)}
        onClear={writable ? () => onChange?.(SURFACE_KEY, undefined) : undefined}
      >
        {writable ? (
          <SurfacePicker chosen={surface} onPick={choose(SURFACE_KEY)} onClose={close} />
        ) : undefined}
      </ValueTile>
      <ValueTile
        name="Smoothness"
        tagKey={SMOOTHNESS_KEY}
        picker={SMOOTHNESS_KEY}
        open={open}
        setOpen={setOpen}
        value={smoothness}
        title={smoothness === undefined ? undefined : smoothnessTitle(smoothness)}
        picture={smoothness === undefined ? undefined : smoothnessPicture(surface, smoothness)}
        onClear={writable ? () => onChange?.(SMOOTHNESS_KEY, undefined) : undefined}
      >
        {writable ? (
          <SmoothnessPicker
            surface={surface}
            chosen={smoothness}
            onPick={choose(SMOOTHNESS_KEY)}
            onClose={close}
          />
        ) : undefined}
      </ValueTile>
    </div>
  )
}
