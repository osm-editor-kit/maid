import type { Field } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { keysWithValue } from '../logic.ts'
import { ComboInput } from './ComboInput.tsx'
import { DraftInput } from './DraftInput.tsx'
import { keyDisplay, MULTIPLE_VALUES, mixedKeysOf, mixedOf, mixedTitle } from './mixed-logic.ts'
import type { FieldProps, MixedValue } from './shared.ts'

/**
 * One row per key of a multi-key field that has a value, and one per key that is mixed. Nothing when none
 * has one. A key of a field with a key of its own is a text input (mixed: keyDisplay).
 */
export function FallbackField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key !== undefined) {
    const display = keyDisplay(key, tags, combined, field.placeholder)
    return (
      <DraftInput
        id={id}
        tagKey={key}
        value={display.value}
        placeholder={display.placeholder}
        title={display.title}
        onChange={onChange}
      />
    )
  }
  const mixed = mixedKeysOf(field, combined)
  const shown = [...new Set([...keysWithValue(field, tags), ...mixed])]
  return (
    <div className="grid gap-1.5">
      {shown.map((tagKey) => (
        <KeyRow
          key={tagKey}
          field={field}
          tagKey={tagKey}
          value={tags[tagKey] ?? ''}
          mixed={mixedOf(combined, tagKey)}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

/**
 * The generic control of a field whose type has no several-values control of its own, over its key when
 * the key is mixed: an empty combo, "Multiple values", the values as its list and as its title (Row.tsx
 * chooses it). A key that is not mixed is the field's own control, as FallbackField draws it.
 */
export function MixedField(props: FieldProps) {
  const { field, id, onChange, combined } = props
  const mixed = mixedOf(combined, field.key)
  if (field.key === undefined || mixed === undefined) return <FallbackField {...props} />
  return <MixedCombo id={id} field={field} tagKey={field.key} mixed={mixed} onChange={onChange} />
}

/** A combo over the values of a mixed key: the list is the values; a typed text is written as a combo writes it. */
function MixedCombo(props: {
  id?: string
  field: Field
  tagKey: string
  mixed: MixedValue
  onChange: FieldProps['onChange']
}) {
  const { id, field, tagKey, mixed, onChange } = props
  return (
    <ComboInput
      id={id}
      field={listField(field, mixed)}
      tagKey={tagKey}
      // undefined, not '': a commit of a blank must not write over a mixed key
      value={undefined}
      placeholder={MULTIPLE_VALUES}
      title={mixedTitle(mixed)}
      onChange={onChange}
    />
  )
}

/** The field a mixed key's combo works with: the same spelling rules, the values as the only options. */
function listField(field: Field, mixed: MixedValue): Field {
  return {
    ...field,
    type: 'combo',
    options: mixed.values.map((value) => ({ value, label: value })),
    customValues: true,
  }
}

function KeyRow({
  field,
  tagKey,
  value,
  mixed,
  onChange,
}: {
  field: Field
  tagKey: string
  value: string
  mixed: MixedValue | undefined
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
      {mixed === undefined ? (
        <DraftInput id={id} tagKey={tagKey} value={value} onChange={onChange} />
      ) : (
        <MixedCombo
          id={id}
          field={{ ...field, key: tagKey }}
          tagKey={tagKey}
          mixed={mixed}
          onChange={onChange}
        />
      )}
    </div>
  )
}
