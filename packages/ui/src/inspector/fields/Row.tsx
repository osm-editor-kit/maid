import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/16/solid'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId, useState } from 'react'
import { InfoPopover, type ReferenceLoader } from '../../InfoPopover.tsx'
import {
  comboHint,
  isModified,
  isPresent,
  keysWithValue,
  removeEdits,
  revertEdits,
  valueSignature,
  type TagEdit,
} from '../logic.ts'
import { FallbackField } from './Fallback.tsx'
import { RelatedAddButtons, RelatedDetails, type RelatedRow } from './Related.tsx'
import type { FieldComponent, FieldMeasure, FieldProps } from './shared.ts'
import { HINT, LABEL, ROW_BUTTON } from './shared.ts'

/** Field types that take a value from a list of options and show the option's label as a hint. */
const COMBO_TYPES = new Set(['combo', 'typeCombo', 'networkCombo', 'radio', 'structureRadio'])

/**
 * The "i" among the row's buttons, in their square look. It fades in while the pointer or the
 * focus is in this field's row (the group is named, so a group around all rows does not count),
 * stays while its panel is open, and is always there on touch.
 */
const INFO_BUTTON =
  'rounded opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 group-hover/field:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100'

/**
 * The "Measure on the map" button: as the "i", it fades in with the row, and it stays while the
 * measure it started is under way (aria-pressed).
 */
const MEASURE_BUTTON = `${ROW_BUTTON} opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 group-hover/field:opacity-100 aria-pressed:bg-zinc-950/5 aria-pressed:text-blue-600 aria-pressed:opacity-100 pointer-coarse:opacity-100 dark:aria-pressed:bg-white/10 dark:aria-pressed:text-blue-400`

/** A ruler on a diagonal with its ticks, 16 px, in the colour of the text (the row's icons are 16 px too) */
function RulerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 9.5 9.5 2.5l4 4-7 7-4-4Z" />
      <path d="M4.25 7.75 6 9.5M6 6l1.75 1.75M7.75 4.25 9.5 6" />
    </svg>
  )
}

const STEADY_TYPES = new Set([
  'semiCombo',
  'multiCombo',
  'manyCombo',
  'directionalCombo',
  'localized',
  'address',
  // fields that modules bring and that keep their own rows and inputs
  'streetImages',
  'surfaceSmoothness',
  'trafficSign',
])

export function FieldRow(props: {
  field: Field
  tags: Tags
  /** The tags before any edit. Without them there is no revert button. */
  baseTags?: Tags
  onChange: FieldProps['onChange']
  registry: Record<string, FieldComponent>
  /** The related tags below the field (lines, add buttons, editors). Absent: none. */
  related?: RelatedRow
  /** Finds the wiki documentation for the "i" after the label, when the field has a reference. Called on opening only. */
  loadReference?: ReferenceLoader
  /** The measuring tape: the "Measure on the map" button, for the keys that have one. Absent: none. */
  measure?: FieldMeasure
}) {
  const { field, tags, baseTags, onChange, registry, related, loadReference, measure } = props
  const id = useId()
  const labelId = useId()
  // the label bar's container for the control's own buttons: set by a callback ref, so no ref is read in render
  const [labelActions, setLabelActions] = useState<HTMLElement | null>(null)
  const key = field.key
  // A multi-key field shows only once one of its keys has a value
  const Control = registry[field.type] ?? FallbackField
  // a field over several keys that has no component of its own only shows the keys in use
  if (Control === FallbackField && key === undefined && keysWithValue(field, tags).length === 0)
    return null
  const hint =
    key !== undefined && COMBO_TYPES.has(field.type) ? comboHint(field, tags[key]) : undefined
  const present = isPresent(field, tags)
  const modified = baseTags !== undefined && isModified(field, tags, baseTags)
  const apply = (edits: TagEdit[]) => {
    for (const edit of edits) onChange?.(edit.key, edit.value)
  }
  return (
    <div
      role={key === undefined ? 'group' : undefined}
      aria-labelledby={key === undefined ? labelId : undefined}
      className="group/field grid min-w-0 gap-1"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {key === undefined ? (
            <span id={labelId} className={LABEL}>
              {field.label}
            </span>
          ) : (
            <label htmlFor={id} className={LABEL}>
              {field.label}
            </label>
          )}
          {/* the control's buttons for the label bar (FieldProps.labelActions); hidden while it is empty */}
          <span ref={setLabelActions} className="flex shrink-0 items-center gap-1 empty:hidden" />
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {hint ? <span className={HINT}>{hint}</span> : null}
          {field.reference ? (
            <InfoPopover
              label={field.label}
              reference={field.reference}
              load={loadReference}
              buttonClassName={INFO_BUTTON}
            />
          ) : null}
          {onChange && key !== undefined && measure?.can(key) ? (
            <button
              type="button"
              aria-label={`Measure ${field.label} on the map`}
              aria-pressed={measure.active === key}
              title="Measure on the map"
              className={MEASURE_BUTTON}
              onClick={() => measure?.start(key)}
            >
              <RulerIcon />
            </button>
          ) : null}
          {onChange && related ? <RelatedAddButtons field={field} related={related} /> : null}
          {onChange && modified && baseTags ? (
            <button
              type="button"
              aria-label={`Revert ${field.label}`}
              title={`Revert ${field.label}`}
              className={ROW_BUTTON}
              onClick={() => apply(revertEdits(field, tags, baseTags))}
            >
              <ArrowUturnLeftIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          {onChange && present ? (
            <button
              type="button"
              aria-label={`Remove ${field.label}`}
              title={`Remove ${field.label}`}
              className={ROW_BUTTON}
              onClick={() => apply(removeEdits(field, tags))}
            >
              <TrashIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <Control
        // Most controls keep a draft and start over when the tag changes elsewhere. The chip fields
        // show the tags as they are and keep the focus in their input while values are added.
        key={STEADY_TYPES.has(field.type) ? field.id : valueSignature(field, tags)}
        id={id}
        field={field}
        tags={tags}
        onChange={onChange}
        labelActions={labelActions}
      />
      {related ? (
        <RelatedDetails field={field} tags={tags} related={related} onChange={onChange} />
      ) : null}
    </div>
  )
}
