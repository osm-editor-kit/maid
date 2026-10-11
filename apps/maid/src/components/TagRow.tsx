import { useState } from 'react'

type Props = {
  tagKey: string
  value: string
  onChange: (value: string | undefined) => void
}

const INPUT =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-neutral-300 focus:border-blue-500 focus:bg-white focus:outline-none'

/** One tag. The value is edited in place and applied on Enter or when the field loses focus. */
export function TagRow({ tagKey, value, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  const commit = () => draft !== value && onChange(draft.trim() || undefined)
  return (
    <tr className="border-b border-neutral-200 last:border-0">
      <th
        scope="row"
        className="w-2/5 truncate py-1 pr-2 text-left font-normal text-neutral-600"
        title={tagKey}
      >
        {tagKey}
      </th>
      <td className="py-0.5">
        <input
          aria-label={`Value of ${tagKey}`}
          className={INPUT}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(value)
              event.stopPropagation()
            }
          }}
        />
      </td>
      <td className="w-6 text-right">
        <button
          type="button"
          aria-label={`Remove ${tagKey}`}
          className="rounded px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-800"
          onClick={() => onChange(undefined)}
        >
          ×
        </button>
      </td>
    </tr>
  )
}
