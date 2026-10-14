import type { Field } from '@osm-editor-kit/maid-presets'
import type { CheckBoxState } from './CheckBox.tsx'

/**
 * The field as a check field reads it. id-tagging-schema lists the unset value of a check as the string
 * 'undefined' in `options` (armrest: ["undefined", "yes", "no"]), and iD maps that to no value (check.ts).
 * Here it becomes '', the unset value logic.ts takes (isUnsetOption). Without this the unset option was
 * a value of its own: a click wrote `armrest=undefined`, which is set (checked) and shows as "Unknown".
 */
export function checkFieldOf(field: Field): Field {
  if (!field.options.some((option) => option.value === 'undefined')) return field
  return {
    ...field,
    options: field.options.map((option) =>
      option.value === 'undefined' ? { ...option, value: '' } : option,
    ),
  }
}

/**
 * The box and aria-checked of a check's state (checkStateFor): yes is a check, no an empty box, unset a
 * grey dash in an empty box, several values an indeterminate box. An unset check is 'mixed' for assistive
 * technology, as it always was here.
 */
export function checkBoxOf(checked: boolean | 'unset' | 'mixed'): {
  box: CheckBoxState
  ariaChecked: boolean | 'mixed'
} {
  if (checked === 'unset') return { box: 'unknown', ariaChecked: 'mixed' }
  if (checked === 'mixed') return { box: 'dash', ariaChecked: 'mixed' }
  return { box: checked ? 'on' : 'off', ariaChecked: checked }
}
