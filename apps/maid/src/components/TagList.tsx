import type { Tags } from '@osm-editor-kit/maid-style'
import { AddTag } from './AddTag'
import { TagRow } from './TagRow'

type Props = {
  tags: Tags
  /** Without it the list is read-only (relations for now) */
  onChange?: (key: string, value: string | undefined) => void
}

/** Raw tags of a feature, sorted by key */
export function TagList({ tags, onChange }: Props) {
  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))
  return (
    <>
      {entries.length === 0 && <p className="text-zinc-500 dark:text-zinc-400">No tags</p>}
      <table className="w-full table-fixed border-collapse font-mono text-xs">
        <tbody>
          {entries.map(([key, value]) =>
            onChange ? (
              // the value in the key resets the row's draft when the tag changes from elsewhere
              <TagRow
                key={`${key}=${value}`}
                tagKey={key}
                value={value}
                onChange={(next) => onChange(key, next)}
              />
            ) : (
              <tr
                key={key}
                className="border-b border-zinc-950/5 last:border-0 dark:border-white/5"
              >
                <th
                  scope="row"
                  className="w-2/5 truncate py-1 pr-2 text-left font-normal text-zinc-500 dark:text-zinc-400"
                  title={key}
                >
                  {key}
                </th>
                <td className="truncate py-1" title={value}>
                  {value}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {onChange && <AddTag onAdd={onChange} />}
    </>
  )
}
