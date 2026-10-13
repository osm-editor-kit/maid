import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { ComboField } from './Combo.tsx'
import { MULTIPLE_VALUES, mixedOf } from './mixed-logic.ts'
import { accessOptions, accessPlaceholder } from './radio-logic.ts'
import type { CombinedTags, FieldProps } from './shared.ts'
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
 * Several features: the placeholder is the implied value when every feature implies the same one,
 * else "Multiple values" (accessPlaceholder); a mixed key is an empty combo with its values as the title.
 */
export function AccessField(props: FieldProps) {
  const { field, tags, onChange, combined, features } = props
  return (
    <div className="grid min-w-0 gap-1.5">
      {(field.keys ?? []).map((key) => (
        <AccessRow
          key={key}
          rowKey={key}
          tags={tags}
          combined={combined}
          features={features}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function AccessRow(props: {
  rowKey: string
  tags: Tags
  combined: CombinedTags | undefined
  features: readonly Tags[] | undefined
  onChange: FieldProps['onChange']
}) {
  const { rowKey, tags, combined, features, onChange } = props
  const id = useId()
  const label = ROW_LABELS[rowKey] ?? rowKey
  // Without the features a mixed key has no implied value that can be shown: the placeholder says so
  const placeholder =
    mixedOf(combined, rowKey) !== undefined && features === undefined
      ? MULTIPLE_VALUES
      : (accessPlaceholder(rowKey, tags, features) ?? '')
  // A synthetic combo field: the row's key and its options
  const rowField: Field = {
    id: `access-${rowKey}`,
    type: 'combo',
    key: rowKey,
    label,
    options: accessOptions(rowKey),
    universal: false,
    customValues: false,
  }
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <ComboField
        field={rowField}
        tags={tags}
        combined={combined}
        placeholder={placeholder}
        id={id}
        onChange={onChange}
      />
    </div>
  )
}
