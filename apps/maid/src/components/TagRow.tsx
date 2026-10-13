import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'

type Props = {
  tagKey: string
  value: string
  onChange: (value: string | undefined) => void
}

const INPUT =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-950/20 focus:border-blue-500 focus:bg-white focus:outline-none dark:hover:border-white/20 dark:focus:bg-zinc-950'

/** One tag. The value is edited in place and applied on Enter or when the field loses focus. */
export function TagRow({ tagKey, value, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  const commit = () => draft !== value && onChange(draft.trim() || undefined)
  return (
    <tr className="border-b border-zinc-950/5 last:border-0 dark:border-white/5">
      <th
        scope="row"
        className="w-2/5 truncate py-1 pr-2 text-left font-normal text-zinc-500 dark:text-zinc-400"
        title={tagKey}
      >
        {tagKey}
      </th>
      <td className="py-0.5">
        <input
          {...PLAIN_INPUT}
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
          className="cursor-pointer rounded px-1 text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={() => onChange(undefined)}
        >
          ×
        </button>
      </td>
    </tr>
  )
}
