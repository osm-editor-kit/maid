import type { FieldOption } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { isUnsetOption } from '../logic.ts'
import { DraftInput, type DraftInputProps } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import type { FieldProps } from './shared.ts'

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
