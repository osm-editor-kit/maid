/**
 * The sheet's pure core: focus, selection, edit mode and the trailing row (sheetReducer), and the two things
 * that turn an edit or a selection into data (commitEdit, clearSelection). No React, no DOM.
 */
import type {
  CellRef,
  ColId,
  EndThen,
  RowId,
  SheetAction,
  SheetBatch,
  SheetCellData,
  SheetChange,
  SheetColumn,
  SheetRow,
  SheetShape,
  SheetState,
} from './types'

/** The state before anything happened: no cell, navigation mode, trailing row id `t0`, minted ids start at `t1`. */
export function initialSheetState(): SheetState {
  return {
    active: null,
    anchor: null,
    rowsSelected: false,
    mode: 'navigate',
    editStart: 'replace',
    tabOrigin: null,
    extraRows: [],
    inserted: null,
    trailingId: 't0',
    nextId: 1,
  }
}

/**
 * Builds the reducer's view of the grid. `trailingId` is appended as the last row id when the sheet has a
 * trailing row. `readOnly` folds the row, the column, the cell and the whole sheet into one answer.
 * A cell of a column that is not in `columns` is read-only.
 */
export function shapeOf(
  rows: SheetRow[],
  columns: SheetColumn[],
  options: { trailingId?: RowId; sheetReadOnly?: boolean; inserted?: SheetState['inserted'] } = {},
): SheetShape {
  const rowById = new Map<RowId, SheetRow>(rows.map((row): [RowId, SheetRow] => [row.id, row]))
  const colById = new Map<ColId, SheetColumn>(
    columns.map((col): [ColId, SheetColumn] => [col.id, col]),
  )
  // an inserted row sits right under its row; when that row is gone it is not in the grid
  const rowIds: RowId[] = []
  for (const row of rows) {
    rowIds.push(row.id)
    if (options.inserted?.after === row.id) rowIds.push(options.inserted.id)
  }
  if (options.trailingId !== undefined) rowIds.push(options.trailingId)
  return {
    rowIds,
    colIds: columns.map((col) => col.id),
    readOnly: (cell) => {
      if (options.sheetReadOnly === true) return true
      const col = colById.get(cell.col)
      if (col === undefined || col.readOnly === true) return true
      const row = rowById.get(cell.row)
      if (row?.readOnly === true) return true
      return row?.cells[cell.col]?.readOnly === true
    },
  }
}

/** True when both ids are in the grid (a stale cell from before a change is not). */
function inShape(shape: SheetShape, cell: CellRef): boolean {
  return shape.rowIds.includes(cell.row) && shape.colIds.includes(cell.col)
}

/** The cell at grid indexes, or undefined outside the grid. */
function cellAt(shape: SheetShape, r: number, c: number): CellRef | undefined {
  const row = shape.rowIds[r]
  const col = shape.colIds[c]
  if (row === undefined || col === undefined) return undefined
  return { row, col }
}

/** The rectangle of the selection as grid indexes (inclusive), or undefined when there is no active cell. */
export type SelectionRect = { r0: number; r1: number; c0: number; c1: number }

export function selectionRect(state: SheetState, shape: SheetShape): SelectionRect | undefined {
  const active = state.active
  if (active === null) return undefined
  const anchor = state.anchor ?? active
  const ar = shape.rowIds.indexOf(anchor.row)
  const cr = shape.rowIds.indexOf(active.row)
  const ac = shape.colIds.indexOf(anchor.col)
  const cc = shape.colIds.indexOf(active.col)
  if (ar < 0 || cr < 0 || ac < 0 || cc < 0) return undefined
  return { r0: Math.min(ar, cr), r1: Math.max(ar, cr), c0: Math.min(ac, cc), c1: Math.max(ac, cc) }
}

/** Every cell of the selection, row by row, in the rows' current order (the trailing row can be among them). */
export function selectedCells(state: SheetState, shape: SheetShape): CellRef[] {
  const rect = selectionRect(state, shape)
  if (rect === undefined) return []
  const cells: CellRef[] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    for (let c = rect.c0; c <= rect.c1; c++) {
      const cell = cellAt(shape, r, c)
      if (cell !== undefined) cells.push(cell)
    }
  }
  return cells
}

/**
 * The rows of the selection in table order: the rows of the range and the extra rows (Cmd/Ctrl+click). The trailing
 * and the inserted row have no data and are never in it.
 */
export function selectedRowIds(state: SheetState, shape: SheetShape): RowId[] {
  const rect = selectionRect(state, shape)
  if (rect === undefined) return []
  const wanted = new Set<RowId>(state.extraRows)
  for (let r = rect.r0; r <= rect.r1; r++) {
    const id = shape.rowIds[r]
    if (id !== undefined) wanted.add(id)
  }
  return shape.rowIds.filter(
    (id) => wanted.has(id) && id !== state.trailingId && id !== state.inserted?.id,
  )
}

/** One step of the cursor: by columns (`dx`) or rows (`dy`); `wrap` lets `dx` continue on the next or previous row; `edge` goes to the end of the row or column. */
export type Step = { dx: -1 | 0 | 1; dy: -1 | 0 | 1; wrap?: boolean; edge?: boolean }

/**
 * The cell a step from `from` lands on, or undefined when the step cannot move (at an edge of the grid).
 * An edge step goes to the first or last row or column in the direction given.
 */
export function stepTarget(from: CellRef, shape: SheetShape, step: Step): CellRef | undefined {
  const r = shape.rowIds.indexOf(from.row)
  const c = shape.colIds.indexOf(from.col)
  if (r < 0 || c < 0) return undefined
  const lastR = shape.rowIds.length - 1
  const lastC = shape.colIds.length - 1
  if (step.edge === true) {
    const nr = step.dy < 0 ? 0 : step.dy > 0 ? lastR : r
    const nc = step.dx < 0 ? 0 : step.dx > 0 ? lastC : c
    return cellAt(shape, nr, nc)
  }
  let nr = r + step.dy
  let nc = c + step.dx
  if (step.wrap === true && step.dx !== 0 && (nc < 0 || nc > lastC)) {
    nr = r + step.dx
    nc = step.dx > 0 ? 0 : lastC
  }
  if (nr < 0 || nr > lastR || nc < 0 || nc > lastC) return undefined
  return cellAt(shape, nr, nc)
}

/** The text of a cell as one value, or undefined when it is empty-valued, mixed or absent. */
function textOf(cell: SheetCellData | undefined): string | undefined {
  if (cell === undefined || cell.value.kind !== 'value') return undefined
  return cell.value.text
}

/**
 * An empty row under `row`, with the focus in its first cell (the key). Nothing happens on the trailing row and on the
 * inserted one, which are empty already, or for a row that is not in the grid. An earlier inserted row is replaced.
 */
function insertBelow(state: SheetState, shape: SheetShape, row: RowId): SheetState {
  const col = shape.colIds[0]
  if (col === undefined || !shape.rowIds.includes(row)) return state
  if (row === state.trailingId || row === state.inserted?.id) return state
  const id = `t${state.nextId}`
  return {
    ...state,
    active: { row: id, col },
    anchor: null,
    rowsSelected: false,
    extraRows: [],
    mode: 'navigate',
    tabOrigin: null,
    inserted: { id, after: row },
    nextId: state.nextId + 1,
  }
}

/**
 * The inserted row goes as soon as the focus is not on it: it was never data, only a place to type. A range that
 * began on it loses its anchor.
 */
function settle(state: SheetState): SheetState {
  const inserted = state.inserted
  if (inserted === null || state.active?.row === inserted.id) return state
  const anchor = state.anchor?.row === inserted.id ? null : state.anchor
  return {
    ...state,
    inserted: null,
    anchor,
    rowsSelected: anchor === null ? false : state.rowsSelected,
  }
}

/**
 * Leaves edit mode: the mode becomes navigate, the range collapses, and the focus moves as `after` says.
 * `down` and `up` (Enter) go in the column the Tab run began in; `arrowDown` and `arrowUp` go in the active
 * column. A move that cannot happen (the last row) keeps the active cell.
 */
function finishEdit(state: SheetState, shape: SheetShape, after: EndThen): SheetState {
  const base: SheetState = {
    ...state,
    mode: 'navigate',
    anchor: null,
    rowsSelected: false,
    extraRows: [],
  }
  const at = state.active
  if (at === null) return { ...base, tabOrigin: null }
  const origin = state.tabOrigin ?? at.col
  switch (after) {
    case 'stay':
      return base
    case 'insertBelow':
      return insertBelow(base, shape, at.row)
    case 'down':
    case 'up': {
      const dy = after === 'down' ? 1 : -1
      const target = stepTarget({ row: at.row, col: origin }, shape, { dx: 0, dy })
      return { ...base, active: target ?? at, tabOrigin: null }
    }
    case 'arrowDown':
    case 'arrowUp': {
      const dy = after === 'arrowDown' ? 1 : -1
      const target = stepTarget(at, shape, { dx: 0, dy })
      return { ...base, active: target ?? at, tabOrigin: null }
    }
    case 'next':
    case 'previous': {
      const dx = after === 'next' ? 1 : -1
      const target = stepTarget(at, shape, { dx, dy: 0, wrap: true })
      return { ...base, active: target ?? at, tabOrigin: state.tabOrigin ?? at.col }
    }
  }
}

/**
 * The focus, selection, mode and trailing row, for one action. Pure: the same state, action and shape always
 * give the same result. The reducer does not know the draft: a host commits (commitEdit) before any action that
 * leaves edit mode.
 *
 * - `move` and `activate` leave edit mode; `move` at an edge keeps the active cell (and collapses a range).
 * - `startEdit` refuses a read-only cell and an active cell that is missing.
 * - `rowsChanged` keeps the active cell on its row id; when that row is gone, it takes the same index.
 */
export function sheetReducer(
  state: SheetState,
  action: SheetAction,
  shape: SheetShape,
): SheetState {
  return settle(step(state, action, shape))
}

function step(state: SheetState, action: SheetAction, shape: SheetShape): SheetState {
  switch (action.type) {
    case 'activate': {
      if (!inShape(shape, action.cell)) return state
      const from = state.active
      const extend = action.extend === true && from !== null
      return {
        ...state,
        active: action.cell,
        anchor: extend ? (state.anchor ?? from) : null,
        rowsSelected: extend ? state.rowsSelected : false,
        // a Shift range keeps the rows picked before it, a plain click starts over
        extraRows: extend ? state.extraRows : [],
        mode: 'navigate',
        tabOrigin: null,
      }
    }
    case 'move': {
      const from = state.active
      if (from === null) return state
      const target = stepTarget(from, shape, action)
      // A Tab with no cell that way changes nothing, so the run of Tabs is not started either.
      if (target === undefined && action.wrap === true) return state
      const extend = action.extend === true
      return {
        ...state,
        active: target ?? from,
        anchor: extend ? (state.anchor ?? from) : null,
        rowsSelected: extend ? state.rowsSelected : false,
        extraRows: extend ? state.extraRows : [],
        mode: 'navigate',
        tabOrigin: action.wrap === true ? (state.tabOrigin ?? from.col) : null,
      }
    }
    case 'selectRows': {
      const to = action.to ?? action.from
      if (!shape.rowIds.includes(action.from) || !shape.rowIds.includes(to)) return state
      const first = shape.colIds[0]
      const last = shape.colIds[shape.colIds.length - 1]
      if (first === undefined || last === undefined) return state
      return {
        ...state,
        anchor: { row: action.from, col: first },
        active: { row: to, col: last },
        rowsSelected: true,
        extraRows: [],
        mode: 'navigate',
        tabOrigin: null,
      }
    }
    case 'toggleRow': {
      const row = action.row
      if (!shape.rowIds.includes(row) || row === state.trailingId || row === state.inserted?.id)
        return state
      const col = action.col ?? state.active?.col ?? shape.colIds[0]
      if (col === undefined) return state
      const selected = selectedRowIds(state, shape)
      const picked = {
        anchor: null,
        rowsSelected: false,
        mode: 'navigate' as const,
        tabOrigin: null,
      }
      if (!selected.includes(row)) {
        // The rows so far stay selected as extra rows; the clicked cell is the active one, as in Google Sheets.
        return { ...state, ...picked, active: { row, col }, extraRows: selected }
      }
      const rest = selected.filter((id) => id !== row)
      const last = rest[rest.length - 1]
      // The only selected row cannot be taken out: the sheet always has a selection once it has the focus.
      if (last === undefined) return state
      return {
        ...state,
        ...picked,
        active: { row: last, col },
        extraRows: rest.filter((id) => id !== last),
      }
    }
    case 'insertBelow': {
      const row = action.row ?? state.active?.row
      return row === undefined ? state : insertBelow(state, shape, row)
    }
    case 'leave':
      return {
        ...state,
        anchor: null,
        rowsSelected: false,
        extraRows: [],
        tabOrigin: null,
        inserted: null,
      }
    case 'selectAll': {
      // Not the trailing row: it has no data to select.
      const rows = shape.rowIds.filter((id) => id !== state.trailingId)
      const firstRow = rows[0]
      const lastRow = rows[rows.length - 1]
      const firstCol = shape.colIds[0]
      const lastCol = shape.colIds[shape.colIds.length - 1]
      if (
        firstRow === undefined ||
        lastRow === undefined ||
        firstCol === undefined ||
        lastCol === undefined
      ) {
        return state
      }
      return {
        ...state,
        anchor: { row: firstRow, col: firstCol },
        active: { row: lastRow, col: lastCol },
        rowsSelected: false,
        extraRows: [],
        mode: 'navigate',
        tabOrigin: null,
      }
    }
    case 'collapse':
      return { ...state, anchor: null, rowsSelected: false, extraRows: [], tabOrigin: null }
    case 'startEdit': {
      const at = state.active
      if (at === null || state.mode === 'edit' || !inShape(shape, at) || shape.readOnly(at))
        return state
      return {
        ...state,
        mode: 'edit',
        editStart: action.how,
        anchor: null,
        rowsSelected: false,
        extraRows: [],
      }
    }
    case 'endEdit':
      if (state.mode !== 'edit') return state
      return finishEdit(state, shape, action.after)
    case 'rowsChanged': {
      // rows that are gone leave the selection; an inserted row whose row is gone leaves with it
      const extraRows = state.extraRows.filter((id) => shape.rowIds.includes(id))
      const inserted =
        state.inserted !== null && shape.rowIds.includes(state.inserted.id) ? state.inserted : null
      const kept: SheetState = { ...state, extraRows, inserted }
      const at = state.active
      if (at === null) return kept
      if (shape.rowIds.length === 0) {
        return {
          ...kept,
          active: null,
          anchor: null,
          rowsSelected: false,
          mode: 'navigate',
          tabOrigin: null,
        }
      }
      if (shape.rowIds.includes(at.row)) {
        const anchorKept = state.anchor !== null && shape.rowIds.includes(state.anchor.row)
        return {
          ...kept,
          anchor: anchorKept ? state.anchor : null,
          rowsSelected: anchorKept && state.rowsSelected,
        }
      }
      const index = Math.max(0, action.previousRowIds.indexOf(at.row))
      const newRow = shape.rowIds[Math.min(index, shape.rowIds.length - 1)]
      if (newRow === undefined) return kept
      return {
        ...kept,
        active: { row: newRow, col: at.col },
        anchor: null,
        rowsSelected: false,
        mode: 'navigate',
      }
    }
  }
}

/** What commitEdit returns: the next state, and the one batch (absent when nothing changed). */
export type CommitResult = {
  state: SheetState
  batch?: SheetBatch
  /** The column's `validate` message for the committed text. The text is committed anyway. */
  invalid?: string
  /** Why a commit was refused (a `unique` column already has the text). The focus has moved to that row. */
  refused?: string
  focus?: CellRef
}

/**
 * Turns the draft of the active cell into one batch, and ends the edit as `after` says.
 *
 * - The column's `clean` runs first; `validate` runs on the result and never blocks the commit.
 * - A `unique` column refuses a text that another row has: no batch, and the focus goes to that row, in the
 *   column after this one.
 * - In the trailing row, a non-empty text is an `insert` of that row. The row keeps its id, and a new trailing id
 *   is minted (`t<nextId>`).
 * - A text equal to the current one, and an empty text on an empty cell, give no batch.
 * - An empty text clears the cell; any other text sets it.
 */
export function commitEdit(
  state: SheetState,
  shape: SheetShape,
  rows: SheetRow[],
  columns: SheetColumn[],
  text: string,
  after: EndThen = 'stay',
): CommitResult {
  const at = state.active
  if (at === null || state.mode !== 'edit') return { state }
  const col = columns.find((c) => c.id === at.col)
  if (col === undefined || shape.readOnly(at)) {
    return { state: settle(finishEdit(state, shape, after)) }
  }

  const row = rows.find((r) => r.id === at.row)
  const isTrailing =
    row === undefined && at.row === state.trailingId && shape.rowIds.includes(at.row)
  const isInserted =
    row === undefined && state.inserted?.id === at.row && shape.rowIds.includes(at.row)
  if (row === undefined && !isTrailing && !isInserted) {
    return { state: settle(finishEdit(state, shape, after)) }
  }

  const cleaned = col.clean !== undefined ? col.clean(text) : text
  const subject: SheetRow = row ?? { id: at.row, label: '', cells: {} }
  const invalid = col.validate?.(cleaned, subject)

  if (col.unique === true && cleaned !== '') {
    const other = rows.find((r) => r.id !== at.row && textOf(r.cells[col.id]) === cleaned)
    if (other !== undefined) {
      const colIndex = columns.indexOf(col)
      const focus: CellRef = { row: other.id, col: columns[colIndex + 1]?.id ?? col.id }
      return {
        state: settle({
          ...state,
          active: focus,
          anchor: null,
          rowsSelected: false,
          extraRows: [],
          mode: 'navigate',
          tabOrigin: null,
        }),
        refused: `${col.header} "${cleaned}" is already on another row`,
        focus,
        invalid,
      }
    }
  }

  let change: SheetChange | undefined
  let working = state
  let nextShape = shape
  if (isTrailing) {
    if (cleaned !== '') {
      const newTrailing = `t${state.nextId}`
      change = { type: 'insert', row: at.row, cells: { [col.id]: cleaned } }
      working = { ...state, trailingId: newTrailing, nextId: state.nextId + 1 }
      nextShape = { ...shape, rowIds: [...shape.rowIds, newTrailing] }
    }
  } else if (isInserted) {
    // The row stays where it was made: it keeps its id, and the host puts it under `after`.
    if (cleaned !== '' && state.inserted !== null) {
      change = {
        type: 'insert',
        row: at.row,
        cells: { [col.id]: cleaned },
        after: state.inserted.after,
      }
      working = { ...state, inserted: null }
    }
  } else if (row !== undefined) {
    const previous = textOf(row.cells[col.id])
    const unchanged =
      cleaned === '' ? previous === undefined || previous === '' : previous === cleaned
    if (!unchanged) {
      change =
        cleaned === ''
          ? { type: 'clear', row: at.row, col: col.id }
          : { type: 'set', row: at.row, col: col.id, text: cleaned }
    }
  }

  const batch: SheetBatch | undefined =
    change === undefined ? undefined : { cause: 'edit', changes: [change] }
  return { state: settle(finishEdit(working, nextShape, after)), batch, invalid }
}

/**
 * One batch that removes these rows. Read-only rows, the trailing row and ids that are not rows are skipped.
 * Undefined when nothing would change.
 */
export function removeRows(rowIds: readonly RowId[], rows: SheetRow[]): SheetBatch | undefined {
  const changes: SheetChange[] = []
  for (const rowId of rowIds) {
    const row = rows.find((candidate) => candidate.id === rowId)
    if (row !== undefined && row.readOnly !== true) changes.push({ type: 'remove', row: rowId })
  }
  return changes.length === 0 ? undefined : { cause: 'delete', changes }
}

/**
 * Delete on the selection: one batch for the whole range. Cells are cleared when they hold a value (a mixed
 * cell is always cleared). With `rowsSelected` or extra rows, the rows (the range's and the extra ones) are
 * removed. Read-only rows and cells are skipped, and the trailing row is never part of the batch. Undefined when
 * nothing would change.
 */
export function clearSelection(
  state: SheetState,
  shape: SheetShape,
  rows: SheetRow[],
  _columns: SheetColumn[],
): SheetBatch | undefined {
  const rect = selectionRect(state, shape)
  if (rect === undefined) return undefined
  if (state.rowsSelected || state.extraRows.length > 0) {
    return removeRows(selectedRowIds(state, shape), rows)
  }
  const changes: SheetChange[] = []
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowId = shape.rowIds[r]
    const row = rows.find((candidate) => candidate.id === rowId)
    if (rowId === undefined || row === undefined) continue
    for (let c = rect.c0; c <= rect.c1; c++) {
      const colId = shape.colIds[c]
      if (colId === undefined || shape.readOnly({ row: rowId, col: colId })) continue
      const cell = row.cells[colId]
      if (cell === undefined || textOf(cell) === '') continue
      changes.push({ type: 'clear', row: rowId, col: colId })
    }
  }
  return changes.length === 0 ? undefined : { cause: 'delete', changes }
}
