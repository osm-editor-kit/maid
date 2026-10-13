import type { ComponentPropsWithoutRef } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { DraftInput, LengthNotice, useDraft, useLengthLimit } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import { keyDisplay } from './mixed-logic.ts'
import type { FieldProps } from './shared.ts'
import { LIMITED, TEXTAREA } from './shared.ts'

/** Free text. Edits `field.key` only; language variants of localized names come later. */
export function TextField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const type =
    field.type === 'url' || field.type === 'email' || field.type === 'tel' ? field.type : 'text'
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <DraftInput
      id={id}
      type={type}
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
    />
  )
}

/** A multi-line text. Enter adds a line break; the value is written on blur. */
export function TextareaField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder ?? 'Unknown')
  return (
    <DraftTextarea
      id={id}
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      onChange={onChange}
    />
  )
}

type DraftTextareaProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'value' | 'defaultValue' | 'onChange' | 'readOnly'
> & {
  tagKey: string
  value: string
  onChange?: FieldProps['onChange']
}

/** Two to eight rows, one more per line of the draft. Wrapped lines are not counted. */
function DraftTextarea({ tagKey, value, onChange, ...rest }: DraftTextareaProps) {
  const { draft, setDraft, commit, revert } = useDraft({ tagKey, value, onChange })
  const limit = useLengthLimit(draft)
  const lines = draft.split('\n').length
  return (
    <>
      <textarea
        {...PLAIN_INPUT}
        {...rest}
        rows={Math.min(8, Math.max(2, lines))}
        className={`${TEXTAREA} ${LIMITED}`}
        aria-invalid={limit.invalid}
        aria-describedby={limit.describedBy(rest['aria-describedby'])}
        value={draft}
        readOnly={!onChange}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
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
