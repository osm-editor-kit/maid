import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Cell, CellState } from './cell-state.ts'
import {
  AFTER_CLASS,
  BEFORE_CLASS,
  changeToneOf,
  EDITED_BAR_CLASS,
  PREVIEW_CLASS,
  toneOf,
} from './cell-tone.ts'
import type { CellChange } from './changes.ts'
import { m } from './messages.ts'
import { storedKeyOf } from './plan.ts'
import type { TableColumn } from './table.ts'
import { MAX_VALUE_LENGTH } from './write.ts'

export type WayTableCellProps = {
  /** The display key of the row (mirrored on a reversed column) */
  readonly displayKey: string
  readonly column: TableColumn
  readonly cell: Cell
  /** The reference's value for the key, for the words of the cell */
  readonly referenceValue: string | undefined
  /** Changed in this session against the base data */
  readonly edited: boolean
  /** "Highlight changes" is on: the cell shows its change instead of the comparison with the selected way */
  readonly showChanges: boolean
  /** The cell's change in this session (with `showChanges`); absent: the way has the key neither before nor now */
  readonly change: CellChange | undefined
  /** A carry or set-on-all would change this cell */
  readonly previewing: boolean
  /** The one cell the grid's arrow keys start from (roving focus) */
  readonly tabbable: boolean
  readonly onActivate: () => void
  /** Writes the value (undefined removes the key) */
  readonly onCommit: (value: string | undefined) => void
}

/** What a screen reader hears for a cell, by its state */
function describe(state: CellState, value: string, reference: string): string {
  switch (state) {
    case 'different':
      return m.way_table_cell_different({ value, reference })
    case 'added':
      return m.way_table_cell_added({ value })
    case 'missing':
      return m.way_table_cell_missing({ reference })
    case 'empty':
      return m.way_table_cell_not_set()
    case 'reference':
    case 'same':
      return value
  }
}

/** What a screen reader hears for a cell's change */
function describeChange(change: CellChange | undefined): string {
  if (!change) return m.way_table_cell_not_set()
  switch (change.kind) {
    case 'modified':
      return m.way_table_cell_modified({ before: change.before ?? '', after: change.after ?? '' })
    case 'created':
      return m.way_table_cell_created({ value: change.after ?? '' })
    case 'deleted':
      return m.way_table_cell_deleted({ value: change.before ?? '' })
    case 'unchanged':
      return change.after ?? ''
  }
}

/** The text of a cell with "Highlight changes": before → after, struck through when removed */
function ChangeText({ change }: { readonly change: CellChange | undefined }) {
  if (!change) return <span className="text-zinc-400 dark:text-zinc-500">—</span>
  switch (change.kind) {
    case 'modified':
      return (
        <>
          <del className={BEFORE_CLASS}>{change.before}</del>
          <span className="px-1 text-zinc-500 dark:text-zinc-400">→</span>
          <ins className={`no-underline ${AFTER_CLASS}`}>{change.after}</ins>
        </>
      )
    case 'created':
      return <ins className={`no-underline ${AFTER_CLASS}`}>{change.after}</ins>
    case 'deleted':
      return <del className={BEFORE_CLASS}>{change.before}</del>
    case 'unchanged':
      return <span className="text-zinc-950 dark:text-white">{change.after}</span>
  }
}

/**
 * One value of the table. Click or Enter edits it: Enter or leaving the cell saves, Escape cancels, Delete removes the
 * key (a read-only column does not edit). The edit is one undo step, made by the grid through `onCommit`.
 */
export function WayTableCell(props: WayTableCellProps) {
  const {
    displayKey,
    column,
    cell,
    referenceValue,
    edited,
    showChanges,
    change,
    previewing,
    tabbable,
    onActivate,
    onCommit,
  } = props
  const [draft, setDraft] = useState<string | null>(null)
  // Set when the cell ends its edit itself, so the blur that follows does not save the draft a second time
  const skipBlur = useRef(false)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = draft !== null
  const editable = column.readOnly !== true
  const value = cell.value ?? ''
  const tone = toneOf(cell.state)
  const changeTone =
    showChanges && change && change.kind !== 'unchanged' ? changeToneOf(change.kind) : undefined
  const visible = cell.state === 'missing' ? '' : cell.state === 'empty' ? '—' : value
  const tooLong = draft !== null && draft.trim().length > MAX_VALUE_LENGTH
  const words = (
    showChanges
      ? [describeChange(change), cell.dependent ? m.way_table_cell_depends() : '']
      : [
          describe(cell.state, value, referenceValue ?? ''),
          cell.dependent ? m.way_table_cell_depends() : '',
          edited ? m.way_table_cell_edited() : '',
        ]
  )
    .filter(Boolean)
    .join('. ')
  // the tooltip names the stored key of a mirrored cell, and says why an edit is refused
  const hint = tooLong
    ? m.way_table_too_long()
    : column.readOnly
      ? m.way_table_read_only()
      : cell.dependent
        ? m.way_table_stored_as({ key: storedKeyOf(displayKey, column.reversed) })
        : undefined

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function start() {
    if (!editable) return
    skipBlur.current = false
    setDraft(value)
  }

  /** Saves the text; false when it is too long (the cell stays as it is) */
  function commit(text: string, refocus: boolean): boolean {
    const next = text.trim()
    if (next.length > MAX_VALUE_LENGTH) return false
    skipBlur.current = true
    setDraft(null)
    if (next !== value) onCommit(next === '' ? undefined : next)
    if (refocus) cellRef.current?.focus()
    return true
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commit(draft ?? '', true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      skipBlur.current = true
      setDraft(null)
      cellRef.current?.focus()
    }
  }

  function onInputBlur() {
    if (skipBlur.current) {
      skipBlur.current = false
      return
    }
    if (draft === null) return
    // a value that is too long is not saved: the cell goes back to the stored value
    if (!commit(draft, false)) setDraft(null)
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLTableCellElement>) {
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      start()
    } else if (event.key === 'Delete' && editable && value !== '') {
      event.preventDefault()
      onCommit(undefined)
    }
  }

  const classes = [
    'relative min-w-40 max-w-72 border-r border-b border-zinc-950/10 p-0 align-top outline-none',
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:border-white/10',
    showChanges ? (changeTone?.cell ?? '') : tone.cell,
    previewing ? PREVIEW_CLASS : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <td
      ref={cellRef}
      tabIndex={tabbable ? 0 : -1}
      data-cell
      data-row-key={displayKey}
      data-col-id={column.id}
      aria-readonly={!editable || undefined}
      title={hint}
      className={classes}
      onFocus={onActivate}
      onClick={() => {
        if (!editing) start()
      }}
      onKeyDown={onCellKeyDown}
    >
      {tone.dashed && !showChanges ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-1 border border-dashed border-red-400 dark:border-red-700"
        />
      ) : null}
      {edited && !showChanges ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] ${EDITED_BAR_CLASS}`}
        />
      ) : null}
      {editing ? (
        <input
          {...PLAIN_INPUT}
          ref={inputRef}
          value={draft}
          spellCheck={false}
          aria-label={m.way_table_cell_input_label({ key: displayKey, way: column.label })}
          aria-invalid={tooLong || undefined}
          onChange={(event) => setDraft(event.target.value.replace(/\r?\n/g, ' '))}
          onKeyDown={onInputKeyDown}
          onBlur={onInputBlur}
          className="block h-full min-h-9 w-full bg-white px-2 py-1.5 text-sm text-zinc-950 outline-2 -outline-offset-2 outline-blue-600 dark:bg-zinc-900 dark:text-white"
        />
      ) : (
        <div className="flex min-h-9 items-start gap-1 px-2 py-1.5">
          <span
            aria-hidden
            className="w-3 shrink-0 text-xs font-bold text-amber-700 dark:text-amber-300"
          >
            {showChanges ? (changeTone?.mark ?? '') : tone.mark}
          </span>
          {showChanges ? (
            <span aria-hidden className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
              <ChangeText change={change} />
            </span>
          ) : (
            <span
              aria-hidden
              title={value === '' ? undefined : value}
              className={`min-w-0 flex-1 text-sm [overflow-wrap:anywhere] ${tone.text}`}
            >
              {visible}
            </span>
          )}
          {cell.dependent ? (
            <span aria-hidden className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
              ⇄
            </span>
          ) : null}
        </div>
      )}
      <span className="sr-only">{words}</span>
    </td>
  )
}
