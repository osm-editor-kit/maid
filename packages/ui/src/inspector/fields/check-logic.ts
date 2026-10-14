import type { CheckBoxState } from './CheckBox.tsx'

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
