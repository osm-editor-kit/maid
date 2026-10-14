import { checkAfterClick, checkCycle, checkLabel, checkStateFor, impliesYes } from '../logic.ts'
import { checkBoxOf } from './check-logic.ts'
import { CheckBox } from './CheckBox.tsx'
import { FallbackField } from './Fallback.tsx'
import { MULTIPLE_VALUES, mixedOf } from './mixed-logic.ts'
import type { FieldProps } from './shared.ts'

/**
 * Unset, yes or no, as iD's check fields. A click or Space moves to the next value of the cycle
 * (checkCycle). The box shows yes as a check, unset as a grey dash; the text says which value it is.
 * Several features: a key whose features differ is an indeterminate box, "Multiple values"; a click on it
 * sets yes on all of them (checkAfterClick). The box mapping is in check-logic.ts (checkBoxOf). The unset
 * option is already '' here: the presets map id-tagging-schema's "undefined" to it (optionValueOf).
 *
 * The button is the whole control: the box and the value text. Its width is its content (the row puts it
 * on the title's line, see Row.tsx), so it is w-full of its wrapper, which is as wide as the text.
 */
export function CheckField(props: FieldProps) {
  const { id, onChange, combined, tags, field } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const current = tags[key]
  const implied = impliesYes(field, tags)
  const mixed = mixedOf(combined, key)
  const checked = checkStateFor(field.type, current, implied, mixed)
  const label =
    mixed === undefined ? checkLabel(field, field.type, current, implied) : MULTIPLE_VALUES
  const cycle = checkCycle(field)
  const { box, ariaChecked } = checkBoxOf(checked)
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={`${field.label}: ${label}`}
      title={mixed?.values.join('\n')}
      disabled={!onChange}
      onClick={() =>
        onChange?.(key, checkAfterClick(field.type, current, cycle, checked === 'mixed'))
      }
      className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm text-zinc-950 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default dark:text-white dark:hover:bg-white/10"
    >
      <CheckBox state={box} />
      <span
        className={`min-w-0 truncate ${current || mixed ? '' : 'text-zinc-500 dark:text-zinc-400'}`}
      >
        {label}
      </span>
    </button>
  )
}
