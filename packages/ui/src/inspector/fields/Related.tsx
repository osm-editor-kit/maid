import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChatBubbleLeftIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/16/solid'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import {
  relatedLabel,
  type RelatedCategory,
  type RelatedSlot,
  type RelatedTag,
} from '../related-logic.ts'
import { DateField } from './DateColour.tsx'
import { DraftInput } from './DraftInput.tsx'
import type { FieldProps } from './shared.ts'
import { LABEL } from './shared.ts'

/** The related tags of one row: the set ones (lines), the ones the buttons add, and the open editors. */
export type RelatedRow = {
  lines: RelatedTag[]
  offers: RelatedSlot[]
  /** the keys whose editor is open */
  open: readonly string[]
  onOpen: (key: string) => void
  onClose: (key: string) => void
}

const KIND_ICON: Readonly<Record<RelatedCategory, typeof BookOpenIcon>> = {
  source: BookOpenIcon,
  note: ChatBubbleLeftIcon,
  check_date: CalendarDaysIcon,
}

const KIND_NAME: Readonly<Record<RelatedCategory, string>> = {
  source: 'source',
  note: 'note',
  check_date: 'check date',
}

const BUTTON =
  'grid size-5 pointer-coarse:size-11 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

/** The add buttons in a row's label bar: hidden until the row is hovered or focused, always on touch. */
const ADD_BUTTON = `${BUTTON} opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 group-hover/field:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100`

/** One button per key that can be added; a button whose editor is open closes it. */
export function RelatedAddButtons({ field, related }: { field: Field; related: RelatedRow }) {
  return (
    <>
      {related.offers.map((slot) => {
        const open = related.open.includes(slot.key)
        const Icon = KIND_ICON[slot.category]
        const text = `Add a ${KIND_NAME[slot.category]} for ${field.label}`
        return (
          <button
            key={slot.key}
            type="button"
            aria-label={text}
            aria-expanded={open}
            title={text}
            className={ADD_BUTTON}
            onClick={() => (open ? related.onClose(slot.key) : related.onOpen(slot.key))}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        )
      })}
    </>
  )
}

/** The lines of the set related tags, then one box with the open editors. Read-only: lines only. */
export function RelatedDetails(props: {
  field: Field
  tags: Tags
  related: RelatedRow
  onChange: FieldProps['onChange']
}) {
  const { field, tags, related, onChange } = props
  const editors = onChange
    ? [...related.lines, ...related.offers].filter((slot) => related.open.includes(slot.key))
    : []
  if (related.lines.length === 0 && editors.length === 0) return null
  const toggle = (key: string) =>
    related.open.includes(key) ? related.onClose(key) : related.onOpen(key)
  return (
    <div className="grid min-w-0 gap-1">
      {related.lines.map((tag) => (
        <RelatedLine
          key={tag.key}
          tag={tag}
          label={relatedLabel(tag, field)}
          editing={related.open.includes(tag.key)}
          onToggle={onChange ? () => toggle(tag.key) : undefined}
        />
      ))}
      {editors.length > 0 && onChange ? (
        <div className="grid min-w-0 gap-2 rounded-md bg-zinc-950/5 p-2 dark:bg-white/5">
          {editors.map((slot) => (
            <RelatedEditor
              key={slot.key}
              slot={slot}
              label={relatedLabel(slot, field)}
              tags={tags}
              onChange={onChange}
              onClose={() => related.onClose(slot.key)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RelatedLine(props: {
  tag: RelatedTag
  label: string
  editing: boolean
  onToggle?: () => void
}) {
  const { tag, label, editing, onToggle } = props
  const Icon = KIND_ICON[tag.category]
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="shrink-0">{label}</span>
      <span
        className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300"
        title={`${tag.key}=${tag.value}`}
      >
        {tag.value}
      </span>
      {onToggle ? (
        <button
          type="button"
          aria-label={`Edit ${label}`}
          aria-expanded={editing}
          title={`Edit ${label}`}
          className={BUTTON}
          onClick={onToggle}
        >
          <PencilIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * The editor of one related tag: its control (a draft text, or the date field with "today" for
 * check dates), a close button and a remove button. Remove writes the tag away and closes this.
 */
function RelatedEditor(props: {
  slot: RelatedSlot
  label: string
  tags: Tags
  onChange: NonNullable<FieldProps['onChange']>
  onClose: () => void
}) {
  const { slot, label, tags, onChange, onClose } = props
  const id = useId()
  const value = tags[slot.key] ?? ''
  // the date field reads its key from the field it is given: a field for this related key
  const dateField: Field = {
    id: `related:${slot.key}`,
    type: 'date',
    key: slot.key,
    label,
    options: [],
    universal: false,
  }
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`Close ${label}`}
            title="Close"
            className={BUTTON}
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            title="Remove"
            className={BUTTON}
            onClick={() => {
              if (value !== '') onChange(slot.key, undefined)
              onClose()
            }}
          >
            <TrashIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid min-w-0 gap-1">
        {slot.category === 'check_date' ? (
          <DateField key={value} id={id} field={dateField} tags={tags} onChange={onChange} />
        ) : (
          <DraftInput
            key={value}
            id={id}
            tagKey={slot.key}
            value={value}
            placeholder="Unknown"
            onChange={onChange}
          />
        )}
      </div>
    </div>
  )
}
