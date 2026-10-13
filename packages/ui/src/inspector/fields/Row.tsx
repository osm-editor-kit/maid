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
import { FallbackField, MixedField } from './Fallback.tsx'
import { handlesSeveral, mixedKeysOf, mixedSignature } from './mixed-logic.ts'
import { RelatedAddButtons, RelatedDetails, type RelatedRow } from './Related.tsx'
import type {
  AddressContext,
  CombinedTags,
  FieldComponent,
  FieldMeasure,
  FieldProps,
} from './shared.ts'
import { HINT, LABEL, REVEAL, ROW_BUTTON, writeEdits } from './shared.ts'

/** Field types that take a value from a list of options and show the option's label as a hint. */
const COMBO_TYPES = new Set(['combo', 'typeCombo', 'networkCombo', 'radio', 'structureRadio'])

/** The hint in the label line of a row whose key is mixed over several features (where a combo's label is). */
const MIXED_HINT = 'mixed'

/**
 * The "i" among the row's buttons, in their square look. It fades in while the pointer or the
 * focus is in this field's row (the group is named, so a group around all rows does not count),
 * stays while its panel is open, and is always there on touch.
 */
const INFO_BUTTON = `rounded ${REVEAL}`

/**
 * The "Measure on the map" button: as the "i", it fades in with the row, and it stays while the
 * measure it started is under way (aria-pressed).
 */
const MEASURE_BUTTON = `${ROW_BUTTON} ${REVEAL} aria-pressed:bg-zinc-950/5 aria-pressed:text-blue-600 dark:aria-pressed:bg-white/10 dark:aria-pressed:text-blue-400`

/** Revert and remove: as the other buttons of the label bar, they show with the row */
const ACTION_BUTTON = `${ROW_BUTTON} ${REVEAL}`

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
  'parkingRestriction',
])

export function FieldRow(props: {
  field: Field
  tags: Tags
  /** Several features: how each key is over them (FieldProps.combined). Absent for one feature. */
  combined?: CombinedTags
  /** Several features: each feature's own tags (FieldProps.features). Absent for one feature. */
  features?: readonly Tags[]
  /** The tags before any edit. Without them there is no revert button. */
  baseTags?: Tags
  onChange: FieldProps['onChange']
  /** Several tags as one change (FieldProps.onChangeTags). Absent: `onChange` per key. */
  onChangeTags?: FieldProps['onChangeTags']
  registry: Record<string, FieldComponent>
  /** The related tags below the field (lines, add buttons, editors). Absent: none. */
  related?: RelatedRow
  /** Finds the wiki documentation for the "i" after the label, when the field has a reference. Called on opening only. */
  loadReference?: ReferenceLoader
  /** The measuring tape: the "Measure on the map" button, for the keys that have one. Absent: none. */
  measure?: FieldMeasure
  /** The address field's country and nearby features (FieldProps.address). Absent: none. */
  address?: AddressContext
}) {
  const {
    field,
    tags,
    combined,
    features,
    baseTags,
    onChange,
    onChangeTags,
    registry,
    related,
    loadReference,
    measure,
    address,
  } = props
  const id = useId()
  const labelId = useId()
  // the label bar's container for the control's own buttons: set by a callback ref, so no ref is read in render
  const [labelActions, setLabelActions] = useState<HTMLElement | null>(null)
  const key = field.key
  // The keys of this row that the features differ on (several features only; none for one feature)
  const mixedKeys = mixedKeysOf(field, combined)
  // A type with no several-values control of its own gets the generic mixed control over a mixed key
  const generic = mixedKeys.length > 0 && !handlesSeveral(field.type)
  // A multi-key field shows only once one of its keys has a value
  const Control = generic
    ? key !== undefined
      ? MixedField
      : FallbackField
    : (registry[field.type] ?? FallbackField)
  // a field over several keys that has no component of its own only shows the keys in use
  if (
    Control === FallbackField &&
    key === undefined &&
    keysWithValue(field, tags).length === 0 &&
    mixedKeys.length === 0
  )
    return null
  const hint =
    mixedKeys.length > 0
      ? MIXED_HINT
      : key !== undefined && COMBO_TYPES.has(field.type)
        ? comboHint(field, tags[key])
        : undefined
  // a mixed key has no value in the tags, but removing the field removes it from every feature
  const present = isPresent(field, tags) || mixedKeys.length > 0
  // and a mixed key has no single base value to go back to, so there is no revert
  const modified = baseTags !== undefined && isModified(field, tags, baseTags)
  // revert and remove can touch several keys of the field: one change
  const apply = (edits: TagEdit[]) => writeEdits({ onChange, onChangeTags }, edits)
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
          <span
            ref={setLabelActions}
            className={`flex shrink-0 items-center gap-1 empty:hidden ${REVEAL}`}
          />
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
          {onChange && modified && baseTags && mixedKeys.length === 0 ? (
            <button
              type="button"
              aria-label={`Revert ${field.label}`}
              title={`Revert ${field.label}`}
              className={ACTION_BUTTON}
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
              className={ACTION_BUTTON}
              onClick={() =>
                apply([
                  ...removeEdits(field, tags),
                  ...mixedKeys.map((tagKey) => ({ key: tagKey, value: undefined })),
                ])
              }
            >
              <TrashIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <Control
        // Most controls keep a draft and start over when the tag changes elsewhere. The chip fields
        // show the tags as they are and keep the focus in their input while values are added.
        key={
          STEADY_TYPES.has(field.type)
            ? field.id
            : `${valueSignature(field, tags)}|${mixedSignature(field, combined)}`
        }
        id={id}
        field={field}
        tags={tags}
        combined={combined}
        features={features}
        onChange={onChange}
        onChangeTags={onChangeTags}
        labelActions={labelActions}
        address={field.type === 'address' ? address : undefined}
      />
      {related ? (
        <RelatedDetails field={field} tags={tags} related={related} onChange={onChange} />
      ) : null}
    </div>
  )
}
