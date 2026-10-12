import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/16/solid'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
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
import type { FieldComponent, FieldProps } from './shared.ts'
import { HINT, LABEL } from './shared.ts'

/** Field types that take a value from a list of options and show the option's label as a hint. */
const COMBO_TYPES = new Set(['combo', 'typeCombo', 'networkCombo', 'radio', 'structureRadio'])

const ROW_BUTTON =
  'grid size-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

const STEADY_TYPES = new Set(['semiCombo', 'multiCombo', 'manyCombo'])

export function FieldRow(props: {
  field: Field
  tags: Tags
  /** The tags before any edit. Without them there is no revert button. */
  baseTags?: Tags
  onChange: FieldProps['onChange']
  registry: Record<string, FieldComponent>
}) {
  const { field, tags, baseTags, onChange, registry } = props
  const id = useId()
  const labelId = useId()
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
      className="grid min-w-0 gap-1"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        {key === undefined ? (
          <span id={labelId} className={LABEL}>
            {field.label}
          </span>
        ) : (
          <label htmlFor={id} className={LABEL}>
            {field.label}
          </label>
        )}
        <div className="flex min-w-0 items-center gap-1">
          {hint ? <span className={HINT}>{hint}</span> : null}
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
      />
    </div>
  )
}
