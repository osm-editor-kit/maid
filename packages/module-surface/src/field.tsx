/**
 * The sidebar field for `surface` and `smoothness`: two tiles, each with its photo, that open a picker in a flyout.
 * Choosing writes the tag at once and closes the flyout. A text fallback under the tiles takes any value.
 *
 * Without `onChange` (read-only) the tiles show and nothing opens.
 */
import { XMarkIcon } from '@heroicons/react/16/solid'
import type { Field } from '@osm-editor-kit/maid-presets'
import { ComboField, Flyout, type FieldProps } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  creditsFor,
  gridStep,
  isKnownSmoothness,
  isKnownSurface,
  SMOOTHNESS_KEY,
  smoothnessChoices,
  smoothnessOptions,
  smoothnessPicture,
  smoothnessTitle,
  SURFACE_KEY,
  surfaceGroups,
  surfaceOptions,
  surfacePicture,
  surfaceTitle,
  tabStopIndex,
  type Picture,
} from './logic.ts'
import { PICTURES } from './photos.ts'

/** Which picker is open */
type Picker = typeof SURFACE_KEY | typeof SMOOTHNESS_KEY

/** An item of a picker grid: a surface or a level */
type PickItem = { value: string; label: string; picture?: Picture; description?: string }
type PickGroup = { title?: string; items: PickItem[] }

/** The surface groups do not change: computed once */
const SURFACE_GROUPS = surfaceGroups()

/** The text fallback's combos: the catalogue's values as suggestions, any value can be typed */
const SURFACE_COMBO: Field = {
  id: SURFACE_KEY,
  type: 'combo',
  key: SURFACE_KEY,
  label: 'Surface',
  placeholder: 'e.g. asphalt',
  options: surfaceOptions(),
  universal: false,
}
const SMOOTHNESS_COMBO: Field = {
  id: SMOOTHNESS_KEY,
  type: 'combo',
  key: SMOOTHNESS_KEY,
  label: 'Smoothness',
  placeholder: 'e.g. good',
  options: smoothnessOptions(),
  universal: false,
}

const TILE =
  'flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-zinc-950/10 bg-white p-1.5 text-left text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white'
const TILE_BUTTON = `${TILE} cursor-pointer hover:border-zinc-950/20 enabled:hover:bg-zinc-50 dark:hover:border-white/20 dark:enabled:hover:bg-zinc-900`
const PICK_TILE =
  'flex min-w-0 flex-col gap-1 rounded-lg p-1 text-left text-zinc-950 cursor-pointer hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white dark:hover:bg-white/10'
const PICK_CHOSEN = 'ring-2 ring-inset ring-blue-500'
const MUTED = 'text-zinc-500 dark:text-zinc-400'

/**
 * A picture in a frame: the photo, the vehicle icon on the frame's ground, or the text when there is no picture.
 * The photos are square; the frame's size comes from `className`.
 */
function Frame(props: { picture?: Picture; alt: string; text: string; className: string }) {
  const { picture, alt, text, className } = props
  const url = picture ? PICTURES[picture.path] : undefined
  return (
    <span
      className={`grid place-items-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900 ${className}`}
    >
      {url !== undefined && picture !== undefined ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={
            picture.kind === 'vehicle'
              ? 'size-3/5 object-contain dark:invert'
              : 'size-full object-cover'
          }
        />
      ) : (
        <span className={`px-2 text-center text-xs ${MUTED}`}>{text}</span>
      )}
    </span>
  )
}

/** The face of a tile: the picture, the label (the title, or the value when it is not in the catalogue) and the value */
function TileFace(props: { name: string; value?: string; title?: string; picture?: Picture }) {
  const { name, value, title, picture } = props
  const empty = value === undefined
  const label = title ?? value ?? name
  return (
    <>
      <Frame
        picture={empty ? undefined : picture}
        alt={label}
        text={empty ? name : label}
        className="h-16 w-full"
      />
      <span className="min-w-0 truncate text-sm font-medium">{empty ? 'Choose…' : label}</span>
      {!empty && title !== undefined ? (
        <span className={`min-w-0 truncate font-mono text-xs ${MUTED}`}>{value}</span>
      ) : null}
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

/**
 * A grid of picture tiles. One is the Tab stop (the chosen one, else the first); the arrow keys move the focus through
 * the grid (gridStep); Enter and Space choose (a button's own click); Escape closes the picker.
 */
function PickGrid(props: {
  label: string
  groups: PickGroup[]
  columns: 3 | 4
  chosen?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const { label, groups, columns, chosen, onPick, onClose } = props
  const container = useRef<HTMLDivElement>(null)
  // every item's place in the grid, in the order the groups render them
  const values = groups.flatMap((group) => group.items.map((item) => item.value))
  const places = new Map(values.map((value, place) => [value, place]))
  const tabStop = tabStopIndex(values, chosen)

  // the focus goes to the chosen item when the picker opens (the Flyout leaves it to the field)
  useEffect(() => {
    container.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // the editor does not see the key: it closes the picker only
      event.stopPropagation()
      onClose()
      return
    }
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
    const current = buttons.findIndex((button) => button === event.target)
    const next = gridStep(current, event.key, buttons.length, columns)
    if (next === undefined) return
    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div
      ref={container}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`grid gap-x-2 gap-y-3 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}
    >
      {groups.map((group) => (
        <div key={group.title ?? ''} role="presentation" className="contents">
          {group.title !== undefined ? (
            <p className={`col-span-full text-xs font-medium ${MUTED}`}>{group.title}</p>
          ) : null}
          {group.items.map((item) => {
            const checked = item.value === chosen
            const position = places.get(item.value) ?? -1
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={checked}
                data-value={item.value}
                tabIndex={position === tabStop ? 0 : -1}
                onClick={() => onPick(item.value)}
                className={`${PICK_TILE} ${checked ? PICK_CHOSEN : ''}`}
              >
                <Frame
                  picture={item.picture}
                  alt={item.label}
                  text={item.label}
                  className="aspect-square w-full"
                />
                <span className="min-w-0 truncate text-xs font-medium">{item.label}</span>
                {item.label !== item.value ? (
                  <span className={`min-w-0 truncate font-mono text-[0.7rem] ${MUTED}`}>
                    {item.value}
                  </span>
                ) : null}
                {item.description !== undefined ? (
                  <span className={`line-clamp-3 text-[0.7rem] leading-snug ${MUTED}`}>
                    {item.description}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** The surface picker: the catalogue's surfaces in two groups, four to a row */
function SurfacePicker(props: {
  chosen?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const { chosen, onPick, onClose } = props
  const paths = SURFACE_GROUPS.flatMap((group) =>
    group.items.flatMap((item) => (item.picture ? [item.picture.path] : [])),
  )
  return (
    <div className="grid gap-3 p-3">
      <PickGrid
        label="Surface"
        groups={SURFACE_GROUPS}
        columns={4}
        chosen={chosen}
        onPick={onPick}
        onClose={onClose}
      />
      <Credits paths={paths} />
    </div>
  )
}

/**
 * The smoothness picker: the levels for the chosen surface, best to worst, with their photos and descriptions; the
 * generic levels (vehicle icons) without a surface or a surface without photos. A value the surface does not offer is
 * shown first, marked, so that it is not hidden.
 */
function SmoothnessPicker(props: {
  surface?: string
  chosen?: string
  onPick: (value: string) => void
  onClose: () => void
}) {
  const { surface, chosen, onPick, onClose } = props
  const { photos, choices } = smoothnessChoices(surface)
  const offered: PickItem[] = choices.map((choice) => ({
    value: choice.value,
    label: choice.label,
    picture: choice.picture,
    description: choice.description,
  }))
  const notOffered: PickItem[] =
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
  const groups: PickGroup[] = [{ items: [...notOffered, ...offered] }]
  const paths = groups.flatMap((group) =>
    group.items.flatMap((item) => (item.picture ? [item.picture.path] : [])),
  )
  const hint =
    surface === undefined
      ? 'Choose a surface first for its photos. These are the levels.'
      : photos
        ? undefined
        : 'No photos for this surface: the levels.'
  return (
    <div className="grid gap-3 p-3">
      {hint !== undefined ? <p className={`text-xs ${MUTED}`}>{hint}</p> : null}
      <PickGrid
        label="Smoothness"
        groups={groups}
        columns={3}
        chosen={chosen}
        onPick={onPick}
        onClose={onClose}
      />
      <Credits paths={paths} />
    </div>
  )
}

/** One tile: a flyout with its picker, or a plain frame when read-only. The clear button sits on its corner. */
function ValueTile(props: {
  id?: string
  name: string
  picker: Picker
  open: Picker | undefined
  setOpen: (picker: Picker | undefined) => void
  value?: string
  title?: string
  picture?: Picture
  onClear?: () => void
  children?: ReactNode
}) {
  const { id, name, picker, open, setOpen, value, title, picture, onClear, children } = props
  const face = <TileFace name={name} value={value} title={title} picture={picture} />
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

/** The text fallback: any value, with the catalogue's values as suggestions. Open by itself when a value is not known. */
function TypedValues(props: {
  tags: FieldProps['tags']
  onChange: NonNullable<FieldProps['onChange']>
  open: boolean
}) {
  const { tags, onChange, open } = props
  return (
    <details open={open} className="text-sm">
      <summary
        className={`cursor-pointer text-xs select-none ${MUTED} hover:text-zinc-950 dark:hover:text-white`}
      >
        Type a value
      </summary>
      <div className="mt-2 grid gap-2">
        <label className="grid gap-1">
          <span className={`text-xs ${MUTED}`}>Surface</span>
          <ComboField field={SURFACE_COMBO} tags={tags} onChange={onChange} />
        </label>
        <label className="grid gap-1">
          <span className={`text-xs ${MUTED}`}>Smoothness</span>
          <ComboField field={SMOOTHNESS_COMBO} tags={tags} onChange={onChange} />
        </label>
      </div>
    </details>
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
  const unknown =
    (surface !== undefined && !isKnownSurface(surface)) ||
    (smoothness !== undefined && !isKnownSmoothness(smoothness))

  const writable = onChange !== undefined
  const choose = (key: Picker) => (value: string) => {
    onChange?.(key, value)
    setOpen(undefined)
  }
  const close = () => setOpen(undefined)

  return (
    <div className="grid gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <ValueTile
          id={id}
          name="Surface"
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
      {writable ? <TypedValues tags={tags} onChange={onChange} open={unknown} /> : null}
    </div>
  )
}
