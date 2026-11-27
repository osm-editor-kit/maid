import { ChevronDownIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import { memo, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { PLAIN_INPUT } from '../plain-input.ts'
import { Tooltip } from '../Tooltip.tsx'
import { cellClassName, cellStyle, inputClassName } from './cell-look.ts'
import { SuggestList } from './SuggestList.tsx'
import type { SheetCellData, SheetColumn, SheetRow } from './types.ts'
import { useSuggestions } from './useSuggestions.ts'

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
  /** The row's problem (SheetRow.warning): the cell is amber */
  warning?: string
  /** This cell shows the row's exclamation mark, with the warning as its tooltip (the row's last cell) */
  warningIcon?: boolean
  /** Columns this cell spans (a merged cell, SheetRow.merged) */
  span?: number
  /**
   * A mouse pick from the suggestion list: the grid commits the edit (the input has the picked value) and keeps the
   * focus on this cell. One function for all renders, so the memo holds.
   */
  onPick?: (input: HTMLTextAreaElement) => void
}

/**
 * One cell: a wrapper with the grid's roles, and one real `<textarea>` (readOnly outside edit mode, so the editor's
 * shortcuts skip it and the caret keys stay the browser's). It is a text area so that a long value wraps and the
 * row grows with it (cell-look.ts); Enter still commits (keys.ts), and a pasted line break becomes a space. The draft is this cell's own state: typing re-renders
 * this cell only. The grid reads the input's value when an edit ends.
 *
 * A column with `suggest` shows its list while the cell is edited (SuggestList). Arrows move the highlight; Enter
 * and Tab take the highlighted item into the input and then let the grid commit as usual; Escape closes the list
 * and stops there, so the cell stays in edit mode. Such a cell also has a list button at its end (a chevron, as a
 * select has): a press opens the cell with all of its suggestions, as if nothing were typed; typing filters again.
 */
export const SheetCell = memo(function SheetCell(props: SheetCellProps) {
  const {
    row,
    column,
    data,
    trailing,
    active,
    editing,
    selected,
    edges,
    readOnly,
    tabIndex,
    warning,
    warningIcon = false,
    span = 1,
    onPick,
  } = props
  const committed = data?.value.kind === 'value' ? data.value.text : ''
  const mixed = data?.value.kind === 'mixed' ? data.value.values : undefined
  const [draft, setDraft] = useState<string | null>(null)
  // A cell that is not edited shows its text: a draft left from an edit goes now.
  if (!editing && draft !== null) setDraft(null)
  const value = editing ? (draft ?? committed) : committed
  const messageId = useId()
  const listId = useId()
  const [anchor, setAnchor] = useState<HTMLTextAreaElement | null>(null)
  const suggest = data?.noSuggestions === true ? undefined : column.suggest
  const suggestions = useSuggestions({
    enabled: editing,
    suggest,
    delay: column.suggestDelay ?? 0,
    cellRow: row.id,
    cellCol: column.id,
    row,
    // nothing typed yet (an edit opened by Enter, a double click or the list button): all suggestions, not only those
    // that fit the value the cell has; typing filters them
    text: draft === null ? '' : value,
  })
  const optionId = (index: number) => `${listId}-${index}`
  // The host's message wins; else the column's check of what is shown (the draft while it is edited).
  const invalid = data?.invalid ?? column.validate?.(value, row)
  const mixedTitle = mixed?.map((entry) => entry.text ?? m.ui_sheet_no_tag()).join('\n')
  const role = column.role === 'rowheader' ? 'rowheader' : 'gridcell'
  const tone = data?.tone ?? 'default'
  const listShown = suggestions.open && anchor !== null
  const open = active || editing
  // the column draws the text itself while the cell is not edited (SheetColumn.display)
  const drawn =
    column.display !== undefined && !editing && value !== '' && mixed === undefined
      ? column.display(value)
      : undefined

  function pick(index: number, input: HTMLTextAreaElement) {
    const item = suggestions.items[index]
    if (item === undefined) return
    input.value = item.value
    setDraft(item.value)
    suggestions.dismiss(item.value)
    // The grid commits, as for Enter, and the focus stays in the cell (a blur would be a leave of the sheet: the focus
    // on the page, a pending row dropped without its warning).
    if (onPick !== undefined) onPick(input)
    else input.blur()
  }

  // Runs before the grid's key handler (this input is inside it): a key the list takes stops here, except
  // Enter and Tab after a take, which the grid commits with the taken text.
  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!editing) return
    const result = suggestions.keyDown(event.key)
    if (result === undefined) return
    if (result.action === 'take' && result.value !== undefined) {
      event.currentTarget.value = result.value
      setDraft(result.value)
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      role={role}
      aria-selected={selected}
      aria-readonly={readOnly || undefined}
      data-row={row.id}
      data-col={column.id}
      className={cellClassName({
        selected,
        warning: warning !== undefined,
        // a cell that cannot be written and is empty (a side that is off): grey
        disabled: readOnly && !trailing && value === '' && mixed === undefined,
      })}
      style={{
        ...cellStyle({
          selected,
          active,
          editing,
          invalid: invalid !== undefined,
          warning: warning !== undefined,
          edges,
        }),
        ...(span > 1 ? { gridColumn: `span ${span}` } : {}),
      }}
    >
      <textarea
        {...PLAIN_INPUT}
        ref={setAnchor}
        rows={1}
        value={value}
        readOnly={!editing}
        tabIndex={tabIndex}
        spellCheck={false}
        role={suggest !== undefined ? 'combobox' : undefined}
        aria-autocomplete={suggest !== undefined ? 'list' : undefined}
        aria-expanded={suggest !== undefined ? listShown : undefined}
        aria-controls={listShown ? listId : undefined}
        aria-activedescendant={
          listShown && suggestions.highlighted >= 0 ? optionId(suggestions.highlighted) : undefined
        }
        aria-label={m.ui_cell_label({
          column: row.colLabels?.[column.id] ?? column.header,
          row: row.label,
        })}
        aria-invalid={invalid !== undefined ? true : undefined}
        aria-describedby={invalid !== undefined ? messageId : undefined}
        aria-description={warning ?? (mixed ? m.ui_cell_mixed({ count: mixed.length }) : undefined)}
        title={
          mixedTitle ??
          (editing ? undefined : (data?.invalid ?? (value === '' ? undefined : value)))
        }
        placeholder={mixed ? m.ui_multiple_values() : trailing ? column.header : undefined}
        // a tag is one line, as in a text input: a pasted line break becomes a space
        onChange={(event) => setDraft(event.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={onKeyDown}
        style={drawn !== undefined ? { color: 'transparent' } : undefined}
        // a cell closes to two lines after it loses the focus: it shows the start of its text, not the scroll
        // position the edit left
        onBlur={(event) => {
          event.currentTarget.scrollTop = 0
        }}
        className={`${inputClassName({
          mono: column.mono === true,
          tone,
          mixed: mixed !== undefined,
          editing,
          open,
        })}${(suggest !== undefined && !readOnly) || (warning !== undefined && warningIcon) ? ' pr-6' : ''}${
          // the drawn text gives the cell its height (it may be shorter than the text): the input lies over it
          drawn !== undefined ? ' absolute inset-0 h-full' : ''
        }`}
      />
      {drawn !== undefined ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none block min-h-6 px-1.5 py-1 [overflow-wrap:anywhere] text-zinc-950 dark:text-white ${
            column.mono === true ? 'font-mono text-xs/5' : 'text-sm/5'
          }`}
        >
          {drawn}
        </span>
      ) : null}
      {warning !== undefined && warningIcon ? (
        <Tooltip label={warning}>
          <span
            role="img"
            data-row-warning=""
            aria-label={m.ui_sheet_row_warning()}
            className="absolute top-1 right-0.5 inline-flex size-5 items-center justify-center text-amber-600 dark:text-amber-400"
          >
            <ExclamationTriangleIcon className="size-4" aria-hidden="true" />
          </span>
        </Tooltip>
      ) : suggest !== undefined && !readOnly ? (
        <button
          type="button"
          tabIndex={-1}
          data-suggest-button=""
          aria-label={m.ui_cell_suggestions({ column: column.header, row: row.label })}
          title={m.ui_cell_suggestions({ column: column.header, row: row.label })}
          className="absolute top-1 right-0.5 inline-flex size-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {invalid !== undefined ? (
        <span id={messageId} className="sr-only">
          {invalid}
        </span>
      ) : null}
      {listShown && anchor !== null ? (
        <SuggestList
          id={listId}
          label={m.ui_sheet_suggestions({ column: column.header })}
          anchor={anchor}
          items={suggestions.items}
          highlighted={suggestions.highlighted}
          optionId={optionId}
          onPick={(index) => pick(index, anchor)}
        />
      ) : null}
    </div>
  )
})
