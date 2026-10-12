import { CheckIcon, MinusIcon } from '@heroicons/react/16/solid'
import { checkState, checkCycle, checkLabel, impliesYes, nextCheckValue } from '../logic.ts'
import { FallbackField } from './Fallback.tsx'
import type { FieldProps } from './shared.ts'

const BOX = 'grid size-4 shrink-0 place-items-center rounded-sm border text-white'
const BOX_ON = 'border-blue-500 bg-blue-500'
const BOX_OFF = 'border-zinc-950/20 bg-white dark:border-white/20 dark:bg-zinc-950'

/**
 * Unset, yes or no, as iD's check fields. A click or Space moves to the next value of the cycle
 * (checkCycle). The box shows yes as a check, unset as a dash; the text says which value it is.
 */
export function CheckField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const current = tags[key]
  const implied = impliesYes(field, tags)
  const checked = checkState(field.type, current, implied)
  const label = checkLabel(field, field.type, current, implied)
  const cycle = checkCycle(field)
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${field.label}: ${label}`}
      disabled={!onChange}
      onClick={() => onChange?.(key, nextCheckValue(field.type, current, cycle))}
      className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm text-zinc-950 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default dark:text-white dark:hover:bg-white/10"
    >
      <span aria-hidden="true" className={`${BOX} ${checked === true ? BOX_ON : BOX_OFF}`}>
        {checked === true ? <CheckIcon className="size-4" /> : null}
        {checked === 'mixed' ? (
          <MinusIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
        ) : null}
      </span>
      <span className={`min-w-0 truncate ${current ? '' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {label}
      </span>
    </button>
  )
}
