import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addableFields,
  addPicked,
  defaultOnPick,
  pickedFields,
  rowFields,
} from './add-field-logic.ts'
import { AddField } from './AddField.tsx'
import { AccessField } from './fields/Access.tsx'
import { CheckField } from './fields/Check.tsx'
import { ComboField } from './fields/Combo.tsx'
import { ColourField, DateField } from './fields/DateColour.tsx'
import { EmailField, IdentifierField, TelField, UrlField } from './fields/Link.tsx'
import { ManyComboField, MultiComboField, SemiComboField } from './fields/Multi.tsx'
import { NumberField, RoadHeightField, RoadSpeedField } from './fields/Number.tsx'
import { RadioField, StructureRadioField } from './fields/Radio.tsx'
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
  url: UrlField,
  email: EmailField,
  tel: TelField,
  identifier: IdentifierField,
  localized: TextField,
  date: DateField,
  colour: ColourField,
  number: NumberField,
  roadspeed: RoadSpeedField,
  roadheight: RoadHeightField,
  combo: ComboField,
  typeCombo: ComboField,
  networkCombo: ComboField,
  semiCombo: SemiComboField,
  multiCombo: MultiComboField,
  manyCombo: ManyComboField,
  radio: RadioField,
  structureRadio: StructureRadioField,
  access: AccessField,
  check: CheckField,
  defaultCheck: CheckField,
  onewayCheck: CheckField,
}

/**
 * The preset's fields, one row each, then the picked fields, then the "Add field" input for the
 * rest of `moreFields`. Renders nothing when there is no row and nothing to add. Give it a `key` per
 * feature: the picked fields are state of this component and are forgotten with it.
 */
export function PresetFields(props: {
  fields: Field[]
  tags: Tags
  /** The tags before any edit. Given, the rows get a revert button for what differs from them. */
  baseTags?: Tags
  onChange?: (key: string, value: string | undefined) => void
  /** Overrides or adds components per field type */
  components?: Record<string, FieldComponent>
  /** The fields the "Add field" list offers (presets.moreFieldsFor). No list without onChange. */
  moreFields?: Field[]
}): ReactNode {
  const { fields, tags, baseTags, onChange, components, moreFields = [] } = props
  // the ids picked from "Add field", in the order picked: they are rows although they have no value
  const [picked, setPicked] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  // the row to focus, set by a pick and taken once the row is rendered
  const focusNext = useRef<string | undefined>(undefined)
  useEffect(() => {
    const target = focusNext.current
    if (target === undefined) return
    focusNext.current = undefined
    const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-field-id]') ?? []
    const row = [...rows].find((element) => element.dataset.fieldId === target)
    row?.querySelector<HTMLElement>('input, textarea, select')?.focus()
  }, [picked])

  const registry = { ...defaultFieldComponents, ...components }
  const rows = rowFields(fields, pickedFields(picked, [...fields, ...moreFields]))
  const offer = onChange ? addableFields(moreFields, new Set(rows.map((field) => field.id))) : []

  // a field from the list is shown at once; a `default` is written when its key is empty
  const pick = (field: Field) => {
    setPicked((ids) => addPicked(ids, field.id))
    focusNext.current = field.id
    const value = defaultOnPick(field, tags)
    if (field.key !== undefined && value !== undefined) onChange?.(field.key, value)
  }

  if (rows.length === 0 && offer.length === 0) return null
  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {rows.map((field) => (
        // empty: a keyless row without a value renders nothing and must not leave a gap
        <div key={field.id} data-field-id={field.id} className="empty:hidden">
          <FieldRow
            field={field}
            tags={tags}
            baseTags={baseTags}
            onChange={onChange}
            registry={registry}
          />
        </div>
      ))}
      {offer.length > 0 ? <AddField fields={offer} onPick={pick} /> : null}
    </div>
  )
}
