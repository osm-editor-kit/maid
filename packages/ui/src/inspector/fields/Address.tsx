import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId, useState } from 'react'
import { cleanValue, type TagEdit } from '../logic.ts'
import {
  addressPrefix,
  addressRows,
  modeSwitchEdits,
  STREET_PLACE,
  slotEdits,
  slotPlaceholder,
  slotValue,
  streetPlaceMode,
  suggestionOptions,
  suggestionsFor,
  type AddressCell,
  type AddressSuggestions,
  type StreetOrPlace,
} from './address-logic.ts'
import { ComboField } from './Combo.tsx'
import type { FieldProps } from './shared.ts'

export type AddressFieldProps = FieldProps & {
  /** The feature's country, as an ISO code (`de`). Without it the default layout is used. */
  country?: string
  /** Names from the features near this one, for the street, city and postcode inputs. */
  suggestions?: AddressSuggestions
}

/** The text of an input: the border of the row's inputs, with the corners of the row rounded. */
const TEXT =
  'h-8 w-full min-w-0 border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 read-only:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'

const SWITCH =
  'h-8 shrink-0 border border-zinc-950/10 bg-white px-2 text-xs text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:relative focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

/** Which sides of a cell are the outer sides of its row. */
type Edges = { left: boolean; right: boolean }

/** The corner classes of a text input. Each class is written out so that Tailwind finds it. */
function textRadius({ left, right }: Edges): string {
  if (left && right) return 'rounded-md'
  if (left) return 'rounded-l-md'
  if (right) return 'rounded-r-md'
  return 'rounded-none'
}

/**
 * The corner classes of a combo, whose input sits inside the combo's own element: the classes
 * are set on the wrapper, for the input inside it.
 */
function comboRadius({ left, right }: Edges): string {
  if (left && right) return '[&_input]:rounded-md'
  if (left) return '[&_input]:rounded-l-md [&_input]:rounded-r-none'
  if (right) return '[&_input]:rounded-r-md [&_input]:rounded-l-none'
  return '[&_input]:rounded-none'
}

/**
 * The address field: one row of inputs per row of the country's layout (iD's address_formats),
 * the inputs of a row joined like a button group. Each input writes its own key on blur or Enter
 * (Escape reverts). Street, city and postcode offer the suggestions. Read-only without onChange.
 */
export function AddressField(props: AddressFieldProps) {
  const { field, tags, id, onChange, country, suggestions } = props
  const prefix = addressPrefix(field)
  const rows = addressRows(field, tags, country)
  return (
    <div className="grid min-w-0 gap-1.5">
      {rows.map((row, r) => (
        <div key={r} className="flex min-w-0">
          {row.map((cell: AddressCell, c) => (
            <SlotCell
              key={cell.name}
              name={cell.name}
              share={cell.share}
              edges={{ left: c === 0, right: c === row.length - 1 }}
              id={r === 0 && c === 0 ? id : undefined}
              tags={tags}
              prefix={prefix}
              country={country}
              suggestions={suggestions}
              onChange={onChange}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

type SlotProps = {
  name: string
  share: number
  edges: Edges
  id?: string
  tags: Tags
  prefix: string
  country?: string
  suggestions?: AddressSuggestions
  onChange: FieldProps['onChange']
}

/** One input of a row: its share of the row's width, then the control. */
function SlotCell(props: SlotProps) {
  const { name, share, edges, tags, prefix, country, onChange } = props
  const apply = (edits: TagEdit[]) => {
    for (const edit of edits) onChange?.(edit.key, edit.value)
  }
  const wrapper = `relative min-w-0 focus-within:z-10 hover:z-10 ${edges.left ? '' : '-ml-px'}`
  if (name === STREET_PLACE) {
    // keyed by the two keys, so that a write from elsewhere starts over from the tags
    const signature = `${tags[`${prefix}:street`] ?? ''}\u0000${tags[`${prefix}:place`] ?? ''}`
    return (
      <div className={wrapper} style={{ flex: `${share} 1 0%` }}>
        <StreetPlaceSlot key={signature} {...props} apply={apply} />
      </div>
    )
  }
  const value = slotValue(name, tags, prefix)
  const label = slotPlaceholder(name, country)
  const list = suggestionsFor(name, props.suggestions)
  const readOnly = onChange === undefined
  const onText = (text: string) => apply(slotEdits(name, text, prefix))
  return (
    <div className={wrapper} style={{ flex: `${share} 1 0%` }}>
      {list && list.length > 0 ? (
        <ComboSlot
          key={value}
          id={props.id}
          label={label}
          tagKey={`${prefix}:${name}`}
          value={value}
          list={list}
          readOnly={readOnly}
          className={comboRadius(edges)}
          onText={onText}
        />
      ) : (
        <TextSlot
          key={value}
          id={props.id}
          label={label}
          value={value}
          readOnly={readOnly}
          className={textRadius(edges)}
          onText={onText}
        />
      )}
    </div>
  )
}

/**
 * iD's street+place input: a street or a place in one slot. A switch in front of it says which one
 * the slot holds; switching moves the value to the other key. Keyed by the two keys in SlotCell.
 */
function StreetPlaceSlot(props: SlotProps & { apply: (edits: TagEdit[]) => void }) {
  const { edges, id, tags, prefix, country, suggestions, onChange, apply } = props
  const [mode, setMode] = useState<StreetOrPlace>(() => streetPlaceMode(tags, prefix))
  const other: StreetOrPlace = mode === 'street' ? 'place' : 'street'
  const value = tags[`${prefix}:${mode}`] ?? ''
  const label = slotPlaceholder(STREET_PLACE, country)
  const list = suggestionsFor(STREET_PLACE, suggestions, mode)
  const readOnly = onChange === undefined
  const inner: Edges = { left: false, right: edges.right }
  const switchTo = (to: StreetOrPlace) => {
    setMode(to)
    apply(modeSwitchEdits(tags, prefix, to))
  }
  const onText = (text: string) => apply(slotEdits(STREET_PLACE, text, prefix, mode))
  return (
    <div className="flex min-w-0">
      <button
        type="button"
        disabled={readOnly}
        title={`Switch to ${other}`}
        onClick={() => switchTo(other)}
        className={`${SWITCH} ${edges.left ? 'rounded-l-md' : 'rounded-none'}`}
      >
        {mode === 'street' ? 'Street' : 'Place'}
      </button>
      <div className={`-ml-px min-w-0 flex-1 ${list && list.length > 0 ? comboRadius(inner) : ''}`}>
        {list && list.length > 0 ? (
          <ComboSlot
            key={`${mode}\u0000${value}`}
            id={id}
            label={label}
            tagKey={`${prefix}:${mode}`}
            value={value}
            list={list}
            readOnly={readOnly}
            className=""
            onText={onText}
          />
        ) : (
          <TextSlot
            key={`${mode}\u0000${value}`}
            id={id}
            label={label}
            value={value}
            readOnly={readOnly}
            className={textRadius(inner)}
            onText={onText}
          />
        )}
      </div>
    </div>
  )
}

/** A text input. Written on blur or Enter as cleanValue makes it; Escape puts the value back. */
function TextSlot(props: {
  id?: string
  label: string
  value: string
  readOnly: boolean
  className: string
  onText: (text: string) => void
}) {
  const { id, label, value, readOnly, className, onText } = props
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (readOnly) return
    const next = cleanValue(draft) ?? ''
    setDraft(next)
    if (next !== value) onText(next)
  }
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      placeholder={label}
      value={draft}
      readOnly={readOnly}
      className={`${TEXT} ${className}`}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.stopPropagation()
        }
      }}
    />
  )
}

/**
 * A combo over a list of suggestions. Its text is written as typed (no underscores, case kept), so
 * the value is what the mapper typed or picked. Its screen reader label is a visually hidden label,
 * as the combo takes no aria-label.
 */
function ComboSlot(props: {
  id?: string
  label: string
  tagKey: string
  value: string
  list: readonly string[]
  readOnly: boolean
  className: string
  onText: (text: string) => void
}) {
  const { id, label, tagKey, value, list, readOnly, className, onText } = props
  const generated = useId()
  const inputId = id ?? generated
  const field: Field = {
    id: `address-${tagKey}`,
    type: 'combo',
    key: tagKey,
    label,
    placeholder: label,
    options: suggestionOptions(list, value),
    universal: false,
    customValues: true,
    snakeCase: false,
    caseSensitive: true,
  }
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <ComboField
        field={field}
        tags={{ [tagKey]: value }}
        id={inputId}
        onChange={readOnly ? undefined : (_key, next) => onText(next ?? '')}
      />
    </div>
  )
}
