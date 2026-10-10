import type { Tags } from '@maid/style'

type Props = { tags: Tags }

/** Raw tags of a feature, sorted by key. Read-only for now. */
export function TagList({ tags }: Props) {
  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return <p className="text-neutral-500">No tags</p>
  return (
    <table className="w-full table-fixed border-collapse font-mono text-xs">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-neutral-200 last:border-0">
            <th scope="row" className="w-2/5 truncate py-1 pr-2 text-left font-normal text-neutral-600" title={key}>
              {key}
            </th>
            <td className="truncate py-1" title={value}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
