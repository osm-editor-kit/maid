import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { ComboField } from './Combo.tsx'
import { accessOptions, impliedAccess } from './radio-logic.ts'
import type { FieldProps } from './shared.ts'
import { LABEL } from './shared.ts'

/** The row labels (iD's types.<key> translations, in English). */
const ROW_LABELS: Record<string, string> = {
  access: 'Access',
  foot: 'Foot',
  motor_vehicle: 'Motor vehicle',
  bicycle: 'Bicycle',
  horse: 'Horse',
}

/**
 * Access: one compact combo per key (access, foot, motor_vehicle, bicycle, horse, ... from the
 * field's keys). Each row lists the access values of its key and shows, as placeholder, the value
 * the key would have from the tags (impliedAccess). Rows are always shown; each writes its own key
 * on commit (the combo's blur) and removes it when empty. Read-only without onChange.
 */
export function AccessField(props: FieldProps) {
  const { field, tags, onChange } = props
  return (
    <div className="grid min-w-0 gap-1.5">
      {(field.keys ?? []).map((key) => (
        <AccessRow key={key} rowKey={key} tags={tags} onChange={onChange} />
      ))}
    </div>
  )
}

function AccessRow(props: { rowKey: string; tags: Tags; onChange: FieldProps['onChange'] }) {
  const { rowKey, tags, onChange } = props
  const id = useId()
  const label = ROW_LABELS[rowKey] ?? rowKey
  const implied = impliedAccess(tags, rowKey)
  // A synthetic combo field: the row's key, its options and its implied placeholder
  const rowField: Field = {
    id: `access-${rowKey}`,
    type: 'combo',
    key: rowKey,
    label,
    options: accessOptions(rowKey),
    universal: false,
    customValues: false,
    ...(implied === undefined ? {} : { placeholder: implied }),
  }
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <ComboField field={rowField} tags={tags} id={id} onChange={onChange} />
    </div>
  )
}
