/**
 * A small table beside the edit menu that says more than a row's label or tooltip: what blocks a Merge (the tags of the
 * features side by side, the conflicting ones first and marked), or which tags Copy tags copies. The tones are the way
 * table's (amber with ≠ for a value that differs), monospace like the tag table.
 */

/** What the box shows; an operation's `OperationDetails` (maid-operations) fits this type */
export type MenuDetails = {
  /** The heading: why the item cannot be chosen, or what it does */
  title: string
  /** One column per feature; with one column there is no header row. No rows: the box says only the title. */
  columns: readonly { label: string; id?: string; note?: string }[]
  /** One row per key (or relation), the cells in the order of `columns`; `conflict` rows are marked */
  rows: readonly {
    label: string
    cells: readonly (string | undefined)[]
    conflict?: boolean
  }[]
}

/** The widest the box gets (max-w-md): the menu puts it on the side where this fits */
export const DETAILS_MAX_WIDTH = 448

const CONFLICT_CELL = 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'

export function DetailsBox({ details }: { details: MenuDetails }) {
  const { title, columns, rows } = details
  const header = columns.length > 1
  const firstCalm = rows.findIndex((row) => !row.conflict)
  const anyConflict = rows.some((row) => row.conflict)
  return (
    <div className="max-h-[60vh] w-max max-w-md overflow-auto rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10">
      <p className={`px-1 text-zinc-700 dark:text-zinc-200 ${rows.length > 0 ? 'mb-1.5' : ''}`}>
        {title}
      </p>
      {rows.length > 0 && (
        <table className="border-separate border-spacing-0 font-mono text-xs/5">
          {header && (
            <thead>
              <tr>
                <th />
                {columns.map((column, i) => (
                  <th
                    key={`${column.id ?? ''}${i}`}
                    title={column.id}
                    className="max-w-40 px-1.5 pb-1 text-left align-bottom font-sans font-semibold text-zinc-950 dark:text-white"
                  >
                    <span className="block truncate">{column.label}</span>
                    {(column.id || column.note) && (
                      <span className="block truncate font-normal text-zinc-500 dark:text-zinc-400">
                        {[column.id, column.note].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, i) => {
              // a line between the rows that block and the others
              const divider =
                anyConflict && i === firstCalm
                  ? 'border-t border-zinc-950/10 dark:border-white/15'
                  : ''
              return (
                <tr key={row.label} data-conflict={row.conflict ? 'true' : undefined}>
                  <th
                    scope="row"
                    className={`max-w-40 px-1 text-left align-top font-normal break-all ${divider} ${
                      row.conflict
                        ? 'text-amber-900 dark:text-amber-200'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {row.conflict && <span aria-label="differs">≠ </span>}
                    {row.label}
                  </th>
                  {row.cells.map((cell, j) => (
                    <td
                      key={j}
                      className={`max-w-40 px-1.5 align-top break-all ${divider} ${
                        cell === undefined
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : row.conflict
                            ? CONFLICT_CELL
                            : 'text-zinc-950 dark:text-white'
                      }`}
                    >
                      {cell ?? '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
