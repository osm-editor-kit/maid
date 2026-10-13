import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react'
import { XMarkIcon } from '@heroicons/react/16/solid'
import type { FieldOption } from '@osm-editor-kit/maid-presets'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { moveActive } from '../picker-logic.ts'
import { CheckBox } from './CheckBox.tsx'
import { filterOptions, shownText } from './combo-logic.ts'
import { mixedOf, MULTIPLE_VALUES } from './mixed-logic.ts'
import {
  acceptSemi,
  afterLastSeparator,
  manyAdd,
  manyCandidates,
  manyChipsFor,
  manyPick,
  manyRemove,
  multiAdd,
  multiChipsFor,
  multiOptions,
  multiPrefix,
  multiSuffix,
  multiToggle,
  removeSemi,
  semiChips,
  semiFull,
  semiOptions,
  semiWrite,
  type ChipState,
} from './multi-logic.ts'
import type { FieldProps } from './shared.ts'
import { FRAME } from './shared.ts'

/** A chip that only some of several features have: a dashed outline. */
const SOME_CHIP =
  'outline outline-1 -outline-offset-1 outline-dashed outline-zinc-400 dark:outline-zinc-500'

// The box is the text input's frame without its fixed height: chips wrap inside it.
const BOX = `${FRAME.replace(/^h-8 /, '')} flex min-h-8 flex-wrap items-center gap-1 p-1 focus-within:outline-2 focus-within:outline-blue-500`
const TEXT_INPUT =
  'h-6 min-w-0 flex-1 basis-24 bg-transparent px-1 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500 dark:[color-scheme:dark]'
const CHIP =
  'flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md bg-zinc-950/5 pl-1 pr-0.5 text-sm text-zinc-950 dark:bg-white/10 dark:text-white'
const CHIP_TOGGLE =
  'flex min-w-0 items-center gap-1.5 rounded px-0.5 focus-visible:outline-2 focus-visible:outline-blue-500'
const CHIP_REMOVE =
  'grid size-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/10 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

/**
 * semiCombo: one tag whose value is a list joined with ';'. The chosen values are chips, each
 * with a ×; the input offers the options not chosen yet. A comma in the typed text adds several.
 * Backspace in the empty input removes the last chip. The input hides when the list is full.
 */
export function SemiComboField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return null
  // Several features whose lists differ are shown, not edited: one write would give every feature the
  // same list, and the chips of a value that only some have cannot be removed from those alone.
  const mixed = mixedOf(combined, key) !== undefined
  const chips = semiChips(tags[key], mixedOf(combined, key))
  const values = chips.map((chip) => chip.value)
  const write = (next: readonly string[]) => {
    const written = semiWrite(next)
    if (onChange && written !== tags[key]) onChange(key, written)
  }
  const editable = onChange !== undefined && !mixed
  return (
    <ChipInput
      id={id}
      label={field.label}
      placeholder={field.placeholder ?? 'Add'}
      chips={chips.map((chip, index) => {
        const shown = shownText(field, chip.value)
        return (
          <Chip
            key={`${index}-${chip.value}`}
            label={shown.text}
            raw={shown.raw}
            value={chip.value}
            some={chip.some}
            onRemove={editable ? () => write(removeSemi(values, index)) : undefined}
          />
        )
      })}
      options={semiOptions(field, values)}
      query={afterLastSeparator}
      inputHidden={semiFull(values) || mixed}
      onAccept={
        editable
          ? (typed, option) => {
              write(acceptSemi(field, values, typed, option))
            }
          : undefined
      }
      onBackspace={
        editable && values.length > 0
          ? () => write(removeSemi(values, values.length - 1))
          : undefined
      }
    />
  )
}

/**
 * multiCombo: a key ending in ':' (iD adds the colon). Each chosen value is its own tag
 * `prefix + value=yes`. A chip shows its state with a checkbox (a click flips yes and no) and
 * its × removes the tag. The input adds `prefix + value=yes`. Nothing is written without a suffix.
 */
export function MultiComboField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  if (multiPrefix(field) === undefined) return null
  const chips = multiChipsFor(field, tags, combined)
  return (
    <ChipInput
      id={id}
      label={field.label}
      placeholder={chips.some((chip) => chip.some) ? MULTIPLE_VALUES : (field.placeholder ?? 'Add')}
      chips={chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          raw={chip.raw}
          state={chip.state}
          value={chip.value}
          some={chip.some}
          box
          onToggle={
            onChange
              ? () => {
                  const edit = multiToggle(chip)
                  onChange(edit.key, edit.value)
                }
              : undefined
          }
          onRemove={onChange ? () => onChange(chip.key, undefined) : undefined}
        />
      ))}
      options={multiOptions(field, chips)}
      onAccept={
        onChange
          ? (typed, option) => {
              const suffix = option ? option.value : multiSuffix(field, typed)
              if (suffix === undefined) return
              const edit = multiAdd(field, tags, suffix)
              if (edit) onChange(edit.key, edit.value)
            }
          : undefined
      }
    />
  )
}

/**
 * manyCombo: a list of keys, each a yes/no tag of its own. The chips are the keys with a value
 * (their labels; no can be seen struck through). Only the listed keys can be added: adding sets
 * the key to yes.
 */
export function ManyComboField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const chips = manyChipsFor(field, tags, combined)
  const candidates = manyCandidates(field, tags, combined)
  return (
    <ChipInput
      id={id}
      label={field.label}
      placeholder={chips.some((chip) => chip.some) ? MULTIPLE_VALUES : (field.placeholder ?? 'Add')}
      chips={chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          state={chip.state}
          value={chip.value}
          some={chip.some}
          onRemove={
            onChange
              ? () => {
                  const edit = manyRemove(chip.key)
                  onChange(edit.key, edit.value)
                }
              : undefined
          }
        />
      ))}
      options={candidates}
      onAccept={
        onChange
          ? (typed, option) => {
              const key = option ? option.value : manyPick(candidates, typed)
              if (key === undefined) return
              const edit = manyAdd(key)
              onChange(edit.key, edit.value)
            }
          : undefined
      }
    />
  )
}

type ChipProps = {
  label: string
  /** Several features: only some of them have it. A dashed outline; the title says so. */
  some?: boolean
  /** The label is a raw value, not an option's label: shown in italics */
  raw?: boolean
  /** A checkbox state. Absent: a plain chip. No is struck through; other shows its raw value. */
  state?: ChipState
  value?: string
  /** Shows the checkbox box (multiCombo). */
  box?: boolean
  onToggle?: () => void
  onRemove?: () => void
}

function Chip({
  label,
  some = false,
  raw = false,
  state,
  value = '',
  box = false,
  onToggle,
  onRemove,
}: ChipProps) {
  const text = (
    <span
      className={`min-w-0 truncate ${state === 'no' ? 'text-zinc-500 line-through dark:text-zinc-400' : ''} ${raw ? 'italic' : ''}`}
    >
      {label}
    </span>
  )
  const detail =
    state === 'other' ? (
      <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">{value}</span>
    ) : null
  const showBox = box && state !== undefined
  return (
    <span
      className={`${CHIP} ${some ? SOME_CHIP : ''}`}
      title={some ? 'On some of the selected features' : undefined}
    >
      {onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={state === 'yes' ? true : state === 'no' ? false : 'mixed'}
          aria-label={label}
          title={`${label}: ${value}`}
          onClick={onToggle}
          className={CHIP_TOGGLE}
        >
          {showBox ? <ChipBox state={state} /> : null}
          {text}
          {detail}
        </button>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 px-0.5">
          {showBox ? <ChipBox state={state} /> : null}
          {text}
          {detail}
        </span>
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
          onClick={onRemove}
          className={CHIP_REMOVE}
        >
          <XMarkIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </span>
  )
}

/** The checkbox of a multiCombo chip: yes is a check, no an empty box, other a dash. */
function ChipBox({ state }: { state: ChipState }) {
  return <CheckBox state={state === 'yes' ? 'on' : state === 'other' ? 'dash' : 'off'} />
}

type ChipInputProps = {
  id?: string
  /** The field's label: the list's accessible name */
  label: string
  placeholder: string
  chips: ReactNode[]
  /** What the list offers, already minus the chosen values */
  options: readonly FieldOption[]
  /** The text the list filters by, from what is typed (semi: the text after the last comma) */
  query?: (typed: string) => string
  /** Hides the input (a full list) */
  inputHidden?: boolean
  /** Undefined: read-only. Called with the typed text and the option picked, if any. */
  onAccept?: (typed: string, option: FieldOption | undefined) => void
  /** Backspace in the empty input */
  onBackspace?: () => void
}

/**
 * The chips and the input of a multi-value combo. Typing filters the list; Down and Up move
 * through it; Enter accepts the highlighted option, or the typed text; Tab and blur accept the
 * same way; Escape clears the text and closes the list. A click on an option accepts it.
 */
function ChipInput(props: ChipInputProps) {
  const {
    id,
    label,
    placeholder,
    chips,
    options,
    query = (typed: string) => typed,
    inputHidden = false,
    onAccept,
    onBackspace,
  } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Tab moves the focus on; the blur accepts the highlighted option with the text
  const tabbed = useRef<FieldOption | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const readOnly = onAccept === undefined
  const showInput = !readOnly && !inputHidden
  const results = filterOptions(options, query(draft))
  const active = activeIndex < results.length ? activeIndex : -1
  const listVisible = showInput && open && results.length > 0

  const { refs, floatingStyles } = useFloating({
    open: listVisible,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { minWidth: `${rects.reference.width}px` })
        },
      }),
    ],
  })

  /** Accepts the typed text (or the option) and clears the draft. Nothing typed is no write. */
  function accept(option: FieldOption | undefined) {
    const text = draft
    setDraft('')
    setOpen(false)
    setActiveIndex(-1)
    if (!onAccept) return
    if (option === undefined && text.trim() === '') return
    onAccept(text, option)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    const picked = listVisible && active >= 0 ? results[active] : undefined
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setOpen(true)
        setActiveIndex(moveActive(listVisible ? active : -1, delta, results.length))
        return
      }
      case 'Tab':
        // no preventDefault: the focus moves on, and the blur accepts what is typed
        tabbed.current = picked
        return
      case 'Enter':
        event.preventDefault()
        accept(picked)
        return
      case 'Escape':
        // as the combo: the editor does not see the key
        event.stopPropagation()
        setOpen(false)
        setActiveIndex(-1)
        setDraft('')
        return
      case 'Backspace':
        if (draft === '' && onBackspace) onBackspace()
        return
    }
  }

  if (readOnly && chips.length === 0) return null

  return (
    <div className="grid min-w-0 gap-1">
      {/* oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render */}
      <div
        ref={refs.setReference}
        className={BOX}
        onClick={() => {
          if (showInput) inputRef.current?.focus()
        }}
      >
        {chips}
        {showInput ? (
          <input
            {...PLAIN_INPUT}
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-label={chips.length === 0 ? label : `Add to ${label}`}
            placeholder={placeholder}
            value={draft}
            aria-expanded={listVisible}
            aria-controls={listVisible ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
            className={TEXT_INPUT}
            onChange={(event) => {
              setDraft(event.currentTarget.value)
              setOpen(true)
              setActiveIndex(-1)
            }}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              const option = tabbed.current
              tabbed.current = undefined
              setOpen(false)
              setActiveIndex(-1)
              accept(option)
            }}
          />
        ) : null}
      </div>
      <FloatingPortal>
        {listVisible ? (
          <div
            id={listId}
            // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
            ref={refs.setFloating}
            role="listbox"
            aria-label={label}
            // keeps the focus in the input while the list is clicked
            onMouseDown={(event) => event.preventDefault()}
            style={floatingStyles}
            className="z-50 max-h-[26rem] overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          >
            {results.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => {
                  accept(option)
                  inputRef.current?.focus()
                }}
                className={`flex h-8 cursor-pointer items-center gap-3 rounded px-2 ${
                  index === active ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.label !== option.value ? (
                  <span className="shrink-0 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {option.value}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </FloatingPortal>
    </div>
  )
}
