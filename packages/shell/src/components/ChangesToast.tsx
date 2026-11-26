import { m } from '@osm-editor-kit/maid-i18n'
import type { OperationChanges } from '@osm-editor-kit/maid-operations'
import { notify } from '@osm-editor-kit/maid-ui'

/**
 * After an operation ran from its key (V for Reverse), the tags it changed, as the hover box beside the edit menu would
 * have shown them: the key gives no preview, so the toast says afterwards what happened (Tobias, 2026-11-26). Nothing
 * when no tag changed, e.g. a way without direction tags that was only turned round.
 */
export function announceChanges(label: string, changes: OperationChanges | undefined): void {
  const rows = (changes?.features ?? []).flatMap((feature) =>
    [...new Set([...Object.keys(feature.before), ...Object.keys(feature.after)])]
      .filter((key) => feature.before[key] !== feature.after[key])
      .sort()
      .map((key) => ({
        id: `${feature.id} ${key}`,
        key: changes!.features.length > 1 ? `${feature.label}  ${key}` : key,
        before: feature.before[key],
        after: feature.after[key],
      })),
  )
  if (rows.length === 0) return
  notify.info(
    <div data-testid="changes-toast">
      <p>{m.shell_changes_toast_title({ label })}</p>
      <table className="mt-1 font-mono text-xs/5">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="pr-2 align-top">{row.key}</td>
              <td className="align-top">
                <span className="text-red-700 line-through dark:text-red-400">
                  {row.before ?? ''}
                </span>
                {row.before !== undefined && row.after !== undefined ? ' → ' : ' '}
                <span className="text-green-700 dark:text-green-400">{row.after ?? ''}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  )
}
