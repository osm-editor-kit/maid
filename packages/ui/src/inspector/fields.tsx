import { ChevronUpDownIcon } from '@heroicons/react/16/solid'
import type { Field, FieldOption, Tags } from '@osm-editor-kit/maid-presets'
import { useId, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import {
  checkChoices,
  comboHint,
  commitValue,
  isUnsetOption,
  keysWithValue,
  valueSignature,
} from './logic.ts'

export type FieldProps = {
  field: Field
  tags: Tags
  /** The id of the control, for the row's label. Set by PresetFields; components may ignore it. */
  id?: string
  /** Sets or (with undefined) removes one tag. Absent: read-only. */
  onChange?: (key: string, value: string | undefined) => void
}
export type FieldComponent = (props: FieldProps) => ReactNode

const FRAME =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'
const INPUT = `${FRAME} px-2 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
const SELECT = `${FRAME} cursor-pointer appearance-none pr-8`
const LABEL = 'min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-300'
const HINT = 'min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400'

/** Field types that take a value from a list of options and show the option's label as a hint. */
const COMBO_TYPES = new Set(['combo', 'typeCombo', 'networkCombo', 'radio', 'structureRadio'])

type DraftInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'readOnly'
> & {
  tagKey: string
  value: string
  onChange?: FieldProps['onChange']
}

/**
 * A text input with a local draft. The draft is applied on Enter or when the input loses focus;
 * Escape restores the tag's value. The parent gives it a key that changes with the tag's value,
 * so the draft starts over when the tag changes elsewhere.
 */
function DraftInput({ tagKey, value, onChange, ...rest }: DraftInputProps) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (!onChange) return
    const next = commitValue(draft)
    if ((next ?? '') !== value) onChange(tagKey, next)
  }
  return (
    <input
      {...rest}
      className={INPUT}
      value={draft}
      readOnly={!onChange}
      onChange={(event) => setDraft(event.target.value)}
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

/** Free text. Edits `field.key` only; language variants of localized names come later. */
export function TextField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const type =
    field.type === 'url' || field.type === 'email' || field.type === 'tel' ? field.type : 'text'
  return (
    <DraftInput
      id={id}
      type={type}
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder}
      onChange={onChange}
    />
  )
}

/** A number as text, so that values with units (maxspeed "50 mph") are kept. Empty means no tag. */
export function NumberField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  return (
    <DraftInput
      id={id}
      type="text"
      inputMode="decimal"
      min={field.minValue}
      step={field.increment}
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder}
      onChange={onChange}
    />
  )
}

/** A text input with a datalist of the field's options. Free values stay possible. */
export function ComboField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  return (
    <ComboInput
      id={id}
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder}
      options={field.options.filter((option) => !isUnsetOption(option))}
      onChange={onChange}
    />
  )
}

function ComboInput({ options, ...rest }: DraftInputProps & { options: FieldOption[] }) {
  const listId = useId()
  return (
    <>
      <DraftInput {...rest} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.value} label={option.label} />
        ))}
      </datalist>
    </>
  )
}

/** Yes, No or not set. Without options of its own the choices are Yes and No. */
export function CheckField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const current = tags[key]
  const { unsetLabel, choices } = checkChoices(field, current)
  return (
    <div className="relative">
      <select
        id={id}
        className={SELECT}
        value={current ?? ''}
        disabled={!onChange}
        onChange={(event) => onChange?.(key, event.target.value || undefined)}
      >
        <option value="">{unsetLabel}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <ChevronUpDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 my-auto size-4 text-zinc-500 dark:text-zinc-400"
      />
    </div>
  )
}

/** One row per key of a multi-key field that has a value. Nothing when none has one. */
export function FallbackField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key !== undefined) {
    return (
      <DraftInput
        id={id}
        tagKey={key}
        value={tags[key] ?? ''}
        placeholder={field.placeholder}
        onChange={onChange}
      />
    )
  }
  return (
    <div className="grid gap-1.5">
      {keysWithValue(field, tags).map((tagKey) => (
        <KeyRow key={tagKey} tagKey={tagKey} value={tags[tagKey] ?? ''} onChange={onChange} />
      ))}
    </div>
  )
}

function KeyRow({
  tagKey,
  value,
  onChange,
}: {
  tagKey: string
  value: string
  onChange: FieldProps['onChange']
}) {
  const id = useId()
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2">
      <label
        htmlFor={id}
        title={tagKey}
        className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400"
      >
        {tagKey}
      </label>
      <DraftInput id={id} tagKey={tagKey} value={value} onChange={onChange} />
    </div>
  )
}

/** iD field type → component. Types not listed use FallbackField. */
export const defaultFieldComponents: Record<string, FieldComponent> = {
  text: TextField,
  textarea: TextField,
  url: TextField,
  email: TextField,
  tel: TextField,
  identifier: TextField,
  localized: TextField,
  number: NumberField,
  roadspeed: NumberField,
  roadheight: NumberField,
  combo: ComboField,
  typeCombo: ComboField,
  networkCombo: ComboField,
  radio: ComboField,
  structureRadio: ComboField,
  check: CheckField,
  defaultCheck: CheckField,
  onewayCheck: CheckField,
}

/** The preset's fields, one row each. Renders nothing for an empty list. */
export function PresetFields(props: {
  fields: Field[]
  tags: Tags
  onChange?: (key: string, value: string | undefined) => void
  /** Overrides or adds components per field type */
  components?: Record<string, FieldComponent>
}): ReactNode {
  const { fields, tags, onChange, components } = props
  if (fields.length === 0) return null
  const registry = { ...defaultFieldComponents, ...components }
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          tags={tags}
          onChange={onChange}
          registry={registry}
        />
      ))}
    </div>
  )
}

function FieldRow(props: {
  field: Field
  tags: Tags
  onChange: FieldProps['onChange']
  registry: Record<string, FieldComponent>
}) {
  const { field, tags, onChange, registry } = props
  const id = useId()
  const labelId = useId()
  const key = field.key
  // A multi-key field shows only once one of its keys has a value
  if (key === undefined && keysWithValue(field, tags).length === 0) return null
  const Control = registry[field.type] ?? FallbackField
  const hint =
    key !== undefined && COMBO_TYPES.has(field.type) ? comboHint(field, tags[key]) : undefined
  return (
    <div
      role={key === undefined ? 'group' : undefined}
      aria-labelledby={key === undefined ? labelId : undefined}
      className="grid min-w-0 gap-1"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        {key === undefined ? (
          <span id={labelId} className={LABEL}>
            {field.label}
          </span>
        ) : (
          <label htmlFor={id} className={LABEL}>
            {field.label}
          </label>
        )}
        {hint ? <span className={HINT}>{hint}</span> : null}
      </div>
      <Control
        key={valueSignature(field, tags)}
        id={id}
        field={field}
        tags={tags}
        onChange={onChange}
      />
    </div>
  )
}
