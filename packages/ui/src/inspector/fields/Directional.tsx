import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { ComboField } from './Combo.tsx'
import {
  directionalKeys,
  directionalValues,
  directionalWrite,
  type DirectionalKeys,
  type DirectionalSide,
} from './directional-logic.ts'
import { FallbackField } from './Fallback.tsx'
import type { FieldProps } from './shared.ts'
import { LABEL } from './shared.ts'

/**
 * A value for each side of a field that has a left and a right tag (cycleway, sidewalk:both,
 * parking:both, parking:both:orientation). Two combos, Left and Right, each over the field's
 * options. The side shows its own key, or what the common keys say (directionalValues); a choice
 * writes the tags as iD does (directionalWrite), one onChange per changed key. Each combo keeps
 * its draft while the other side is edited. Read-only without onChange.
 *
 * Row.tsx keys the control by the field's tag values; the type is listed in STEADY_TYPES so that
 * the combos keep the focus when a write from one side changes the tags.
 */
export function DirectionalComboField(props: FieldProps) {
  const { field, tags, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const keys = directionalKeys(key)
  const values = directionalValues(keys, tags)
  return (
    <div className="grid min-w-0 gap-1.5">
      <SideRow
        field={field}
        side="left"
        label="Left"
        keys={keys}
        value={values.left}
        tags={tags}
        onChange={onChange}
      />
      <SideRow
        field={field}
        side="right"
        label="Right"
        keys={keys}
        value={values.right}
        tags={tags}
        onChange={onChange}
      />
    </div>
  )
}

function SideRow(props: {
  field: Field
  side: DirectionalSide
  label: string
  keys: DirectionalKeys
  value: string | undefined
  tags: Tags
  onChange: FieldProps['onChange']
}) {
  const { field, side, label, keys, value, tags, onChange } = props
  const id = useId()
  const sideKey = side === 'left' ? keys.left : keys.right
  // A combo over the side's key: the field's options and spelling rules, its own label
  const sideField: Field = {
    ...field,
    id: `${field.id}-${side}`,
    type: 'combo',
    key: sideKey,
    label,
  }
  const sideTags: Tags = value === undefined ? {} : { [sideKey]: value }
  return (
    <div
      className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2"
      // the side's own key, for the map (PresetFields onFieldFocus); the innermost one counts
      data-focus-key={sideKey}
      data-focus-side={side}
    >
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <ComboField
        // the combo's draft starts over when this side's value changes elsewhere
        key={`${sideKey}=${value ?? ''}`}
        field={sideField}
        tags={sideTags}
        id={id}
        onChange={
          onChange
            ? (_key, next) => {
                for (const edit of directionalWrite(keys, tags, side, next)) {
                  onChange(edit.key, edit.value)
                }
              }
            : undefined
        }
      />
    </div>
  )
}
