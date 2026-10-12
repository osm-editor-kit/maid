import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { ReactNode } from 'react'
import { CheckField } from './fields/Check.tsx'
import { ComboField } from './fields/Combo.tsx'
import { NumberField } from './fields/Number.tsx'
import { FieldRow } from './fields/Row.tsx'
import type { FieldComponent } from './fields/shared.ts'
import { TextField, TextareaField } from './fields/Text.tsx'

export { CheckField } from './fields/Check.tsx'
export { ComboField } from './fields/Combo.tsx'
export { FallbackField } from './fields/Fallback.tsx'
export { NumberField } from './fields/Number.tsx'
export { TextField, TextareaField } from './fields/Text.tsx'
export type { FieldComponent, FieldProps } from './fields/shared.ts'

/** iD field type → component. Types not listed use FallbackField. */
export const defaultFieldComponents: Record<string, FieldComponent> = {
  text: TextField,
  textarea: TextareaField,
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
  /** The tags before any edit. Given, the rows get a revert button for what differs from them. */
  baseTags?: Tags
  onChange?: (key: string, value: string | undefined) => void
  /** Overrides or adds components per field type */
  components?: Record<string, FieldComponent>
}): ReactNode {
  const { fields, tags, baseTags, onChange, components } = props
  if (fields.length === 0) return null
  const registry = { ...defaultFieldComponents, ...components }
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <FieldRow
          key={field.id}
          field={field}
          tags={tags}
          baseTags={baseTags}
          onChange={onChange}
          registry={registry}
        />
      ))}
    </div>
  )
}
