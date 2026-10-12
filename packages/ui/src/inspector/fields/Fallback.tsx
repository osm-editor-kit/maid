import { useId } from 'react'
import { keysWithValue } from '../logic.ts'
import { DraftInput } from './DraftInput.tsx'
import type { FieldProps } from './shared.ts'

/** One row per key of a multi-key field that has a value. Nothing when none has one. */
export function FallbackField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  if (key !== undefined) {
    return (
      <DraftInput
        id={id}
        tagKey={key}
        value={tags[key] ?? ''}
        placeholder={field.placeholder}
        onChange={onChange}
      />
    )
  }
  return (
    <div className="grid gap-1.5">
      {keysWithValue(field, tags).map((tagKey) => (
        <KeyRow key={tagKey} tagKey={tagKey} value={tags[tagKey] ?? ''} onChange={onChange} />
      ))}
    </div>
  )
}

function KeyRow({
  tagKey,
  value,
  onChange,
}: {
  tagKey: string
  value: string
  onChange: FieldProps['onChange']
}) {
  const id = useId()
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2">
      <label
        htmlFor={id}
        title={tagKey}
        className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400"
      >
        {tagKey}
      </label>
      <DraftInput id={id} tagKey={tagKey} value={value} onChange={onChange} />
    </div>
  )
}
