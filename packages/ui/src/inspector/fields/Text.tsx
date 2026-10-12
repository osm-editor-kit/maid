import type { ComponentPropsWithoutRef } from 'react'
import { DraftInput, LengthNotice, useDraft } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import type { FieldProps } from './shared.ts'
import { TEXTAREA } from './shared.ts'

/** Free text. Edits `field.key` only; language variants of localized names come later. */
export function TextField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const type =
    field.type === 'url' || field.type === 'email' || field.type === 'tel' ? field.type : 'text'
  return (
    <DraftInput
      id={id}
      type={type}
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder ?? 'Unknown'}
      onChange={onChange}
    />
  )
}

/** A multi-line text. Enter adds a line break; the value is written on blur. */
export function TextareaField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  return (
    <DraftTextarea
      id={id}
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder ?? 'Unknown'}
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
  const lines = draft.split('\n').length
  return (
    <>
      <textarea
        {...rest}
        rows={Math.min(8, Math.max(2, lines))}
        className={TEXTAREA}
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
      <LengthNotice draft={draft} />
    </>
  )
}
