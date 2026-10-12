import { DraftInput } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import type { FieldProps } from './shared.ts'

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
