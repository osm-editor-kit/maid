import type { ComponentPropsWithoutRef } from 'react'
import { useState } from 'react'
import { cleanValue, lengthNotice, MAX_VALUE_LENGTH } from '../logic.ts'
import type { FieldProps } from './shared.ts'
import { INPUT } from './shared.ts'

export type DraftInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'readOnly'
> & {
  tagKey: string
  value: string
  onChange?: FieldProps['onChange']
}

/**
 * The draft of a text control. It is written on blur as cleanValue makes it; Escape puts the
 * tag's value back. The parent gives the control a key that changes with the tag's value, so the
 * draft starts over when the tag changes elsewhere.
 */
export function useDraft({
  tagKey,
  value,
  onChange,
}: {
  tagKey: string
  value: string
  onChange?: FieldProps['onChange']
}) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (!onChange) return
    const next = cleanValue(draft)
    setDraft(next ?? '')
    if ((next ?? '') !== value) onChange(tagKey, next)
  }
  const revert = () => setDraft(value)
  return { draft, setDraft, commit, revert }
}

/** A single-line input. Enter applies the draft, as blurring does. */
export function DraftInput({ tagKey, value, onChange, ...rest }: DraftInputProps) {
  const { draft, setDraft, commit, revert } = useDraft({ tagKey, value, onChange })
  return (
    <>
      <input
        {...rest}
        className={INPUT}
        value={draft}
        readOnly={!onChange}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            revert()
            event.stopPropagation()
          }
        }}
      />
      <LengthNotice draft={draft} />
    </>
  )
}

/** The counter under a text control, from 10 characters before the limit; amber at the limit. */
export function LengthNotice({ draft }: { draft: string }) {
  const notice = lengthNotice(draft)
  if (!notice) return null
  return (
    <span
      className={`justify-self-end text-xs tabular-nums ${notice.atLimit ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'}`}
    >
      {notice.length}/{MAX_VALUE_LENGTH}
    </span>
  )
}
