import { ComboInput } from './ComboInput.tsx'
import { FallbackField } from './Fallback.tsx'
import { keyDisplay } from './mixed-logic.ts'
import type { FieldProps } from './shared.ts'

/**
 * A combobox for a single value (combo, typeCombo, networkCombo). The input shows an option's
 * label, or the raw value in italics. Typing filters the options; Down and Up move through them;
 * Enter and Tab accept the highlighted option or the typed text; Escape restores the value. Text is
 * written on commit (blur), as cleaned by combo-logic.ts. No suggestions come from elsewhere.
 * Several features: a mixed key is an empty input, "Multiple values", its values as the title
 * (keyDisplay). `placeholder` overrides the placeholder of the empty input (access rows).
 */
export function ComboField(props: FieldProps & { placeholder?: string }) {
  const { field, tags, id, onChange, combined, placeholder } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const display = keyDisplay(key, tags, combined, field.placeholder)
  return (
    <ComboInput
      id={id}
      field={field}
      tagKey={key}
      // undefined, not '': a commit of a blank must not write over a mixed key (ComboInput compares it)
      value={display.mixed === undefined ? tags[key] : undefined}
      placeholder={placeholder ?? display.placeholder}
      title={display.title}
      onChange={onChange}
    />
  )
}
