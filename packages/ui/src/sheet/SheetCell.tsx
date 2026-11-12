import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import { memo, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { PLAIN_INPUT } from '../plain-input.ts'
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
  /** Opened with the list button: all suggestions are listed until the text changes */
  browsing?: boolean
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
    browsing = false,
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
    // opened with the list button and nothing typed yet: all suggestions, not only those that fit the value
    text: browsing && draft === null ? '' : value,
  })
  const optionId = (index: number) => `${listId}-${index}`
  // The host's message wins; else the column's check of what is shown (the draft while it is edited).
  const invalid = data?.invalid ?? column.validate?.(value, row)
  const mixedTitle = mixed?.map((entry) => entry.text ?? '(no tag)').join('\n')
  const role = column.role === 'rowheader' ? 'rowheader' : 'gridcell'
  const tone = data?.tone ?? 'default'
  const listShown = suggestions.open && anchor !== null
  const open = active || editing

  function pick(index: number, input: HTMLTextAreaElement) {
    const item = suggestions.items[index]
    if (item === undefined) return
    input.value = item.value
    setDraft(item.value)
    suggestions.dismiss(item.value)
    // Blur commits, as it does for any edit that ends (Sheet's onBlur).
    input.blur()
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
      className={cellClassName({ selected })}
      style={cellStyle({ selected, active, editing, invalid: invalid !== undefined, edges })}
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
        aria-label={m.ui_cell_label({ column: column.header, row: row.label })}
        aria-invalid={invalid !== undefined ? true : undefined}
        aria-describedby={invalid !== undefined ? messageId : undefined}
        aria-description={mixed ? m.ui_cell_mixed({ count: mixed.length }) : undefined}
        title={mixedTitle ?? (editing || value === '' ? undefined : value)}
        placeholder={mixed ? 'Multiple values' : trailing ? column.header : undefined}
        // a tag is one line, as in a text input: a pasted line break becomes a space
        onChange={(event) => setDraft(event.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={onKeyDown}
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
        })}${suggest !== undefined && !readOnly ? ' pr-6' : ''}`}
      />
      {suggest !== undefined && !readOnly ? (
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
          label={`Suggestions for ${column.header}`}
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
