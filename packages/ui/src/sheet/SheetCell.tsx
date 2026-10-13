import { memo, useId, useState } from 'react'
import { PLAIN_INPUT } from '../plain-input.ts'
import { cellClassName, cellStyle, inputClassName } from './cell-look.ts'
import type { SheetCellData, SheetColumn, SheetRow } from './types.ts'

export type SheetCellProps = {
  row: SheetRow
  column: SheetColumn
  /** The cell's data. Its identity changes only when the cell does, so the memo holds. */
  data: SheetCellData | undefined
  /** The empty row at the end: no data, a placeholder instead. */
  trailing: boolean
  active: boolean
  editing: boolean
  selected: boolean
  /** Outline sides of the range (see cell-look.ts) */
  edges: number
  readOnly: boolean
  tabIndex: number
}

/**
 * One cell: a wrapper with the grid's roles, and one real `<input>` (readOnly outside edit mode, so the editor's
 * shortcuts skip it and the caret keys stay the browser's). The draft is this cell's own state: typing re-renders
 * this cell only. The grid reads the input's value when an edit ends.
 */
export const SheetCell = memo(function SheetCell(props: SheetCellProps) {
  const { row, column, data, trailing, active, editing, selected, edges, readOnly, tabIndex } =
    props
  const committed = data?.value.kind === 'value' ? data.value.text : ''
  const mixed = data?.value.kind === 'mixed' ? data.value.values : undefined
  const [draft, setDraft] = useState<string | null>(null)
  // A cell that is not edited shows its text: a draft left from an edit goes now.
  if (!editing && draft !== null) setDraft(null)
  const value = editing ? (draft ?? committed) : committed
  const messageId = useId()
  // The host's message wins; else the column's check of what is shown (the draft while it is edited).
  const invalid = data?.invalid ?? column.validate?.(value, row)
  const mixedTitle = mixed?.map((entry) => `${entry.text ?? 'no tag'}: ${entry.count}`).join(', ')
  const role = column.role === 'rowheader' ? 'rowheader' : 'gridcell'
  const tone = data?.tone ?? 'default'
  return (
    <div
      role={role}
      aria-selected={selected}
      aria-readonly={readOnly || undefined}
      data-row={row.id}
      data-col={column.id}
      className={cellClassName({ selected })}
      style={cellStyle({ selected, active, editing, invalid: invalid !== undefined, edges })}
    >
      <input
        {...PLAIN_INPUT}
        type="text"
        value={value}
        readOnly={!editing}
        tabIndex={tabIndex}
        spellCheck={false}
        aria-label={`${column.header} of ${row.label}`}
        aria-invalid={invalid !== undefined ? true : undefined}
        aria-describedby={invalid !== undefined ? messageId : undefined}
        aria-description={mixed ? `${mixed.length} different values` : undefined}
        title={mixedTitle}
        placeholder={mixed ? 'Multiple values' : trailing ? column.header : undefined}
        onChange={(event) => setDraft(event.target.value)}
        className={inputClassName({
          mono: column.mono === true,
          tone,
          mixed: mixed !== undefined,
          editing,
        })}
      />
      {invalid !== undefined ? (
        <span id={messageId} className="sr-only">
          {invalid}
        </span>
      ) : null}
    </div>
  )
})
