import type { ComponentPropsWithoutRef } from 'react'
import { useId, useState } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { cleanValue, excessOf, lengthNotice, MAX_VALUE_LENGTH, tooLongText } from '../logic.ts'
import type { FieldProps } from './shared.ts'
import { INPUT, LIMITED } from './shared.ts'

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

/**
 * What a text control with the length limit says about its draft: the input is invalid while the
 * draft is over the limit, and the message that says how far over is what it is described by. Spread
 * `invalid` and `describedBy` on the input, and give `messageId` to LengthNotice.
 */
export function useLengthLimit(draft: string) {
  const messageId = useId()
  const over = excessOf(draft) > 0
  return {
    messageId,
    invalid: over ? true : undefined,
    describedBy: (other?: string) =>
      [other, over ? messageId : undefined].filter(Boolean).join(' ') || undefined,
  }
}

/** A single-line input. Enter applies the draft, as blurring does. */
export function DraftInput({ tagKey, value, onChange, ...rest }: DraftInputProps) {
  const { draft, setDraft, commit, revert } = useDraft({ tagKey, value, onChange })
  const limit = useLengthLimit(draft)
  return (
    <>
      <input
        {...PLAIN_INPUT}
        {...rest}
        className={`${INPUT} ${LIMITED}`}
        aria-invalid={limit.invalid}
        aria-describedby={limit.describedBy(rest['aria-describedby'])}
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
      <LengthNotice draft={draft} messageId={limit.messageId} />
    </>
  )
}

/**
 * The counter under a text control, from 10 characters before the limit: neutral up to the limit,
 * red over it, with the message ("7 characters too long") in the element with `messageId`.
 */
export function LengthNotice({ draft, messageId }: { draft: string; messageId: string }) {
  const notice = lengthNotice(draft)
  if (!notice) return null
  const over = notice.excess > 0
  return (
    <span
      className={`flex items-baseline justify-end gap-2 justify-self-end text-xs tabular-nums ${over ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`}
    >
      <span>
        {notice.length} / {MAX_VALUE_LENGTH}
      </span>
      {over && <span id={messageId}>{tooLongText(notice.excess)}</span>}
    </span>
  )
}
