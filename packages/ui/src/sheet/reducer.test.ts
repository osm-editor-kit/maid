import { describe, expect, it } from 'bun:test'
import {
  clearSelection,
  commitEdit,
  initialSheetState,
  pendingProblem,
  removeRows,
  resolvePending,
  selectedCells,
  selectedRowIds,
  sheetReducer,
  shapeOf,
} from './reducer.ts'
import type {
  CellRef,
  SheetCellData,
  SheetColumn,
  SheetRow,
  SheetShape,
  SheetState,
} from './types.ts'

const keyColumn: SheetColumn = {
  id: 'key',
  header: 'Key',
  width: '2fr',
  unique: true,
  clean: (text) => text.trim(),
}
const valueColumn: SheetColumn = {
  id: 'value',
  header: 'Value',
  width: '3fr',
  validate: (text) => (text.length > 255 ? 'Too long' : undefined),
}
const columns: SheetColumn[] = [keyColumn, valueColumn]

function text(value: string, extra: Partial<SheetCellData> = {}): SheetCellData {
  return { value: { kind: 'value', text: value }, ...extra }
}

function row(id: string, key: string, value: string, extra: Partial<SheetRow> = {}): SheetRow {
  return { id, label: key, cells: { key: text(key), value: text(value) }, ...extra }
}

const rowA = row('a', 'highway', 'residential')
const rowB = row('b', 'name', 'A')
const rowC = row('c', 'surface', '')
const rows: SheetRow[] = [rowA, rowB, rowC]
// The trailing row (t0) is the last position of the grid; it has no SheetRow.
const shape: SheetShape = shapeOf(rows, columns, { trailingId: 't0' })

const cell = (rowId: string, col: string): CellRef => ({ row: rowId, col })
const focus = (at: CellRef): SheetState => ({ ...initialSheetState(), active: at })
const editing = (at: CellRef): SheetState => ({ ...focus(at), mode: 'edit' })

describe('sheetReducer: activate and move', () => {
  it('activates a cell and drops a range', () => {
    const start: SheetState = { ...focus(cell('a', 'key')), anchor: cell('a', 'key') }
    const next = sheetReducer(start, { type: 'activate', cell: cell('b', 'value') }, shape)
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.anchor).toBeNull()
  })

  it('ignores a cell that is not in the grid', () => {
    const start = focus(cell('a', 'key'))
    expect(sheetReducer(start, { type: 'activate', cell: cell('zz', 'key') }, shape)).toBe(start)
  })

  it('moves one cell, and stays at every edge of the grid', () => {
    let state = focus(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: 0 }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: -1 }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 1 }, shape)
    expect(state.active).toEqual(cell('b', 'value'))
  })

  it('moves into the trailing row, which is the last cell, and never past it', () => {
    let state = focus(cell('c', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1 }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1, extend: true }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
    expect(state.anchor).toEqual(cell('t0', 'value'))
  })

  it('extends a range from the anchor with Shift, and a plain move collapses it', () => {
    let state = focus(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 1, extend: true }, shape)
    expect(state.anchor).toEqual(cell('a', 'key'))
    expect(state.active).toEqual(cell('b', 'value'))
    expect(selectedCells(state, shape)).toHaveLength(4)
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1 }, shape)
    expect(state.anchor).toBeNull()
    expect(state.active).toEqual(cell('c', 'value'))
  })

  it('a range that reaches the edge stays inside the grid', () => {
    let state = focus(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: -1, extend: true, edge: true }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    expect(selectedCells(state, shape).map((c) => c.row)).toEqual(['a', 'b'])
  })

  it('goes to the edge of the row or the column with edge moves', () => {
    let state = focus(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 0, edge: true }, shape)
    expect(state.active).toEqual(cell('b', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: -1, edge: true }, shape)
    expect(state.active).toEqual(cell('a', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1, edge: true }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
  })

  it('Tab wraps over the rows, and does nothing at the two ends of the sheet', () => {
    let state = focus(cell('a', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 0, wrap: true }, shape)
    expect(state.active).toEqual(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: 0, wrap: true }, shape)
    expect(state.active).toEqual(cell('a', 'value'))
    const first = focus(cell('a', 'key'))
    expect(sheetReducer(first, { type: 'move', dx: -1, dy: 0, wrap: true }, shape)).toEqual(first)
    const last = focus(cell('t0', 'value'))
    expect(sheetReducer(last, { type: 'move', dx: 1, dy: 0, wrap: true }, shape)).toEqual(last)
  })

  it('arrows do not wrap over rows', () => {
    const state = focus(cell('a', 'value'))
    expect(sheetReducer(state, { type: 'move', dx: 1, dy: 0 }, shape).active).toEqual(
      cell('a', 'value'),
    )
  })

  it('a move leaves edit mode', () => {
    const next = sheetReducer(editing(cell('a', 'key')), { type: 'move', dx: 0, dy: 1 }, shape)
    expect(next.mode).toBe('navigate')
    expect(next.active).toEqual(cell('b', 'key'))
  })
})

describe('sheetReducer: rows, all and collapse', () => {
  it('selects a run of rows over all columns', () => {
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'selectRows', from: 'b', to: 'c' },
      shape,
    )
    expect(next.rowsSelected).toBe(true)
    expect(next.anchor).toEqual(cell('b', 'key'))
    expect(next.active).toEqual(cell('c', 'value'))
    expect(selectedCells(next, shape).map((c) => c.row)).toEqual(['b', 'b', 'c', 'c'])
  })

  it('selects all rows but not the trailing one', () => {
    const next = sheetReducer(focus(cell('b', 'value')), { type: 'selectAll' }, shape)
    expect(next.anchor).toEqual(cell('a', 'key'))
    expect(next.active).toEqual(cell('c', 'value'))
    expect(next.rowsSelected).toBe(false)
    expect(selectedCells(next, shape).some((c) => c.row === 't0')).toBe(false)
  })

  it('collapses a range to the active cell', () => {
    let state = sheetReducer(focus(cell('a', 'key')), { type: 'selectAll' }, shape)
    state = sheetReducer(state, { type: 'collapse' }, shape)
    expect(state.anchor).toBeNull()
    expect(state.rowsSelected).toBe(false)
    expect(state.active).toEqual(cell('c', 'value'))
  })
})

describe('sheetReducer: edit mode', () => {
  it('starts an edit that keeps the active cell and drops the range', () => {
    const start: SheetState = { ...focus(cell('b', 'value')), anchor: cell('a', 'key') }
    const next = sheetReducer(start, { type: 'startEdit', how: 'replace' }, shape)
    expect(next.mode).toBe('edit')
    expect(next.editStart).toBe('replace')
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.anchor).toBeNull()
  })

  it('does not start an edit on a read-only cell', () => {
    const data = [
      rowA,
      row('r', 'ref', '1', { cells: { key: text('ref'), value: text('1', { readOnly: true }) } }),
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(
      sheetReducer(focus(cell('r', 'value')), { type: 'startEdit', how: 'keep' }, s).mode,
    ).toBe('navigate')
  })

  it('does not start an edit on a read-only row', () => {
    const data = [row('r', 'ref', '1', { readOnly: true })]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(sheetReducer(focus(cell('r', 'key')), { type: 'startEdit', how: 'keep' }, s).mode).toBe(
      'navigate',
    )
  })

  it('does not start an edit in a read-only column, and does not start one without an active cell', () => {
    const s = shapeOf(rows, [{ ...keyColumn, readOnly: true }, valueColumn], { trailingId: 't0' })
    expect(sheetReducer(focus(cell('a', 'key')), { type: 'startEdit', how: 'keep' }, s).mode).toBe(
      'navigate',
    )
    expect(sheetReducer(initialSheetState(), { type: 'startEdit', how: 'keep' }, shape).mode).toBe(
      'navigate',
    )
  })

  it('reaches a read-only cell with the cursor, and does not edit it', () => {
    const data = [
      row('a', 'highway', 'residential', {
        cells: { key: text('highway'), value: text('residential', { readOnly: true }) },
      }),
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    const moved = sheetReducer(focus(cell('a', 'key')), { type: 'move', dx: 1, dy: 0 }, s)
    expect(moved.active).toEqual(cell('a', 'value'))
    expect(sheetReducer(moved, { type: 'startEdit', how: 'keep' }, s).mode).toBe('navigate')
  })

  it('starts an edit in the trailing row', () => {
    const next = sheetReducer(
      focus(cell('t0', 'key')),
      { type: 'startEdit', how: 'replace' },
      shape,
    )
    expect(next.mode).toBe('edit')
  })

  it('Enter goes down in the column the Tab run began in', () => {
    let state = sheetReducer(editing(cell('a', 'key')), { type: 'endEdit', after: 'next' }, shape)
    expect(state.mode).toBe('navigate')
    expect(state.active).toEqual(cell('a', 'value'))
    expect(state.tabOrigin).toBe('key')
    state = sheetReducer(state, { type: 'startEdit', how: 'replace' }, shape)
    state = sheetReducer(state, { type: 'endEdit', after: 'down' }, shape)
    expect(state.active).toEqual(cell('b', 'key'))
    expect(state.tabOrigin).toBeNull()
  })

  it('Enter goes down in the active column without a Tab run, and Shift+Enter goes up', () => {
    const down = sheetReducer(
      editing(cell('a', 'value')),
      { type: 'endEdit', after: 'down' },
      shape,
    )
    expect(down.active).toEqual(cell('b', 'value'))
    const up = sheetReducer(editing(cell('b', 'value')), { type: 'endEdit', after: 'up' }, shape)
    expect(up.active).toEqual(cell('a', 'value'))
  })

  it('Enter on the last position stays there', () => {
    const next = sheetReducer(
      editing(cell('t0', 'value')),
      { type: 'endEdit', after: 'down' },
      shape,
    )
    expect(next.active).toEqual(cell('t0', 'value'))
    expect(next.mode).toBe('navigate')
  })

  it('an arrow ends the edit in the active column, ignoring the Tab run', () => {
    let state = sheetReducer(editing(cell('a', 'key')), { type: 'endEdit', after: 'next' }, shape)
    state = sheetReducer(state, { type: 'startEdit', how: 'replace' }, shape)
    const next = sheetReducer(state, { type: 'endEdit', after: 'arrowDown' }, shape)
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.tabOrigin).toBeNull()
  })

  it('Tab in edit mode moves on and wraps, and stays at the two ends', () => {
    const wrapped = sheetReducer(
      editing(cell('a', 'value')),
      { type: 'endEdit', after: 'next' },
      shape,
    )
    expect(wrapped.active).toEqual(cell('b', 'key'))
    const back = sheetReducer(
      editing(cell('b', 'key')),
      { type: 'endEdit', after: 'previous' },
      shape,
    )
    expect(back.active).toEqual(cell('a', 'value'))
    const atEnd = sheetReducer(
      editing(cell('t0', 'value')),
      { type: 'endEdit', after: 'next' },
      shape,
    )
    expect(atEnd.active).toEqual(cell('t0', 'value'))
    expect(atEnd.mode).toBe('navigate')
  })

  it('stay ends the edit and keeps the cell', () => {
    const next = sheetReducer(
      editing(cell('b', 'value')),
      { type: 'endEdit', after: 'stay' },
      shape,
    )
    expect(next.mode).toBe('navigate')
    expect(next.active).toEqual(cell('b', 'value'))
  })

  it('endEdit outside edit mode changes nothing', () => {
    const start = focus(cell('b', 'value'))
    expect(sheetReducer(start, { type: 'endEdit', after: 'down' }, shape)).toBe(start)
  })
})

describe('sheetReducer: rows that change under the cursor', () => {
  it('keeps the active cell on its row id when the rows are re-sorted', () => {
    const resorted = shapeOf([rowC, rowB, rowA], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      resorted,
    )
    expect(next.active).toEqual(cell('b', 'value'))
  })

  it('takes the same index when the active row is gone', () => {
    const remaining = shapeOf([rowA, rowC], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.active).toEqual(cell('c', 'value'))
  })

  it('clamps to the last position when the last row is gone', () => {
    const remaining = shapeOf([rowA], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('c', 'key')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.active).toEqual(cell('t0', 'key'))
  })

  it('drops an anchor whose row is gone', () => {
    const start: SheetState = { ...focus(cell('b', 'value')), anchor: cell('c', 'key') }
    const remaining = shapeOf([rowA, rowB], columns, { trailingId: 't0' })
    const next = sheetReducer(
      start,
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.anchor).toBeNull()
  })
})

describe('commitEdit', () => {
  it('a text equal to the current one gives no batch', () => {
    const result = commitEdit(editing(cell('a', 'value')), shape, rows, columns, 'residential')
    expect(result.batch).toBeUndefined()
    expect(result.state.mode).toBe('navigate')
  })

  it('clean runs before the comparison, so a padded key is unchanged', () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, '  highway  ')
    expect(result.batch).toBeUndefined()
  })

  it('sets a changed value as one batch, and ends the edit as `after` says', () => {
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, 'B', 'down')
    expect(result.batch).toEqual({
      cause: 'edit',
      changes: [{ type: 'set', row: 'b', col: 'value', text: 'B' }],
    })
    expect(result.state.active).toEqual(cell('c', 'value'))
    expect(result.state.mode).toBe('navigate')
  })

  it('an empty text clears the cell', () => {
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, '')
    expect(result.batch?.changes).toEqual([{ type: 'clear', row: 'b', col: 'value' }])
  })

  it('an empty text on an empty cell gives no batch', () => {
    const result = commitEdit(editing(cell('c', 'value')), shape, rows, columns, '')
    expect(result.batch).toBeUndefined()
  })

  it('a unique column refuses a text another row has, and moves the focus to that row', () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, 'name')
    expect(result.batch).toBeUndefined()
    expect(result.refused).toBeDefined()
    expect(result.focus).toEqual(cell('b', 'value'))
    expect(result.state.active).toEqual(cell('b', 'value'))
    expect(result.state.mode).toBe('navigate')
  })

  it("a unique column accepts the row's own text", () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, 'highway')
    expect(result.refused).toBeUndefined()
    expect(result.batch).toBeUndefined()
  })

  it('the trailing row first commit is an insert with its id, and a new trailing id is minted', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, 'lit', 'down')
    expect(result.batch).toEqual({
      cause: 'edit',
      changes: [{ type: 'insert', row: 't0', cells: { key: 'lit' } }],
    })
    expect(result.state.trailingId).toBe('t1')
    expect(result.state.nextId).toBe(2)
    // Enter in the new row goes down, into the new trailing row.
    expect(result.state.active).toEqual(cell('t1', 'key'))
  })

  it('an empty text in the trailing row gives no batch and mints nothing', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, '')
    expect(result.batch).toBeUndefined()
    expect(result.state.trailingId).toBe('t0')
    expect(result.state.nextId).toBe(1)
  })

  it('a key that exists, typed in the trailing row, is refused', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, 'highway')
    expect(result.batch).toBeUndefined()
    expect(result.focus).toEqual(cell('a', 'value'))
    expect(result.state.trailingId).toBe('t0')
  })

  it('a text over the limit is committed as typed, and the message is returned', () => {
    const long = 'x'.repeat(300)
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, long)
    expect(result.batch?.changes).toEqual([{ type: 'set', row: 'b', col: 'value', text: long }])
    expect(result.invalid).toBe('Too long')
  })

  it('an empty draft on a mixed value changes nothing, and a text sets it', () => {
    const mixedRow: SheetRow = {
      id: 'm',
      label: 'maxspeed',
      cells: {
        key: text('maxspeed'),
        value: {
          value: {
            kind: 'mixed',
            values: [
              { text: '30', count: 1 },
              { text: undefined, count: 1 },
            ],
          },
        },
      },
    }
    const s = shapeOf([mixedRow], columns, { trailingId: 't0' })
    expect(
      commitEdit(editing(cell('m', 'value')), s, [mixedRow], columns, '').batch,
    ).toBeUndefined()
    expect(
      commitEdit(editing(cell('m', 'value')), s, [mixedRow], columns, '50').batch?.changes,
    ).toEqual([{ type: 'set', row: 'm', col: 'value', text: '50' }])
  })

  it('does nothing when the cell is not being edited', () => {
    const result = commitEdit(focus(cell('b', 'value')), shape, rows, columns, 'B')
    expect(result.batch).toBeUndefined()
  })
})

describe('clearSelection', () => {
  it('clears the cells of a range in one batch', () => {
    const state: SheetState = { ...focus(cell('b', 'value')), anchor: cell('a', 'key') }
    const batch = clearSelection(state, shape, rows, columns)
    expect(batch?.cause).toBe('delete')
    expect(batch?.changes).toEqual([
      { type: 'clear', row: 'a', col: 'key' },
      { type: 'clear', row: 'a', col: 'value' },
      { type: 'clear', row: 'b', col: 'key' },
      { type: 'clear', row: 'b', col: 'value' },
    ])
  })

  it('an empty cell is not cleared: a range of empty cells gives no batch', () => {
    const single: SheetState = { ...focus(cell('c', 'value')), anchor: cell('c', 'value') }
    expect(clearSelection(single, shape, rows, columns)).toBeUndefined()
    const withKey: SheetState = { ...focus(cell('c', 'value')), anchor: cell('c', 'key') }
    expect(clearSelection(withKey, shape, rows, columns)?.changes).toEqual([
      { type: 'clear', row: 'c', col: 'key' },
    ])
  })

  it('removes whole rows when rows are selected, and skips read-only rows', () => {
    const data = [rowA, row('r', 'ref', '1', { readOnly: true }), row('c', 'surface', 'asphalt')]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    const state: SheetState = {
      ...focus(cell('c', 'value')),
      anchor: cell('a', 'key'),
      rowsSelected: true,
    }
    expect(clearSelection(state, s, data, columns)?.changes).toEqual([
      { type: 'remove', row: 'a' },
      { type: 'remove', row: 'c' },
    ])
  })

  it('skips a read-only cell', () => {
    const data = [
      row('a', 'highway', 'residential', {
        cells: { key: text('highway', { readOnly: true }), value: text('residential') },
      }),
      rowB,
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(
      clearSelection({ ...focus(cell('a', 'key')), anchor: cell('a', 'key') }, s, data, columns),
    ).toBeUndefined()
    expect(
      clearSelection({ ...focus(cell('b', 'key')), anchor: cell('a', 'key') }, s, data, columns)
        ?.changes,
    ).toEqual([{ type: 'clear', row: 'b', col: 'key' }])
  })

  it('skips the cells of a read-only column', () => {
    const readOnlyValue = [keyColumn, { ...valueColumn, readOnly: true }]
    const s = shapeOf(rows, readOnlyValue, { trailingId: 't0' })
    expect(
      clearSelection(
        { ...focus(cell('b', 'value')), anchor: cell('a', 'value') },
        s,
        rows,
        readOnlyValue,
      ),
    ).toBeUndefined()
  })

  it('never clears the trailing row', () => {
    const state: SheetState = { ...focus(cell('t0', 'key')), anchor: cell('b', 'value') }
    expect(clearSelection(state, shape, rows, columns)?.changes).toEqual([
      { type: 'clear', row: 'b', col: 'key' },
      { type: 'clear', row: 'b', col: 'value' },
      { type: 'clear', row: 'c', col: 'key' },
    ])
  })

  it('without an active cell gives no batch', () => {
    expect(clearSelection(initialSheetState(), shape, rows, columns)).toBeUndefined()
  })
})

describe('shapeOf', () => {
  it('appends the trailing id last, and marks cells that cannot be edited', () => {
    expect(shape.rowIds).toEqual(['a', 'b', 'c', 't0'])
    expect(shape.readOnly(cell('t0', 'key'))).toBe(false)
    expect(
      shapeOf(rows, columns, { trailingId: 't0', sheetReadOnly: true }).readOnly(cell('a', 'key')),
    ).toBe(true)
    expect(shape.readOnly(cell('a', 'missing'))).toBe(true)
  })
})

describe('sheetReducer: a row inserted under another', () => {
  it('insertBelow makes an empty row right under the active row, with the focus in its first cell', () => {
    const next = sheetReducer(focus(cell('a', 'value')), { type: 'insertBelow' }, shape)
    expect(next.inserted).toEqual({ id: 't1', after: 'a' })
    expect(next.active).toEqual(cell('t1', 'key'))
    expect(next.mode).toBe('navigate')
    expect(next.nextId).toBe(2)
    const grown = shapeOf(rows, columns, { trailingId: 't0', inserted: next.inserted })
    expect(grown.rowIds).toEqual(['a', 't1', 'b', 'c', 't0'])
  })

  it('insertBelow in the middle and at the last row put the row at the right index', () => {
    const middle = sheetReducer(focus(cell('b', 'key')), { type: 'insertBelow' }, shape)
    expect(shapeOf(rows, columns, { trailingId: 't0', inserted: middle.inserted }).rowIds).toEqual([
      'a',
      'b',
      't1',
      'c',
      't0',
    ])
    const last = sheetReducer(focus(cell('c', 'key')), { type: 'insertBelow' }, shape)
    expect(shapeOf(rows, columns, { trailingId: 't0', inserted: last.inserted }).rowIds).toEqual([
      'a',
      'b',
      'c',
      't1',
      't0',
    ])
  })

  it('insertBelow with a row (the row menu) uses that row, not the active one', () => {
    const next = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow', row: 'c' }, shape)
    expect(next.inserted).toEqual({ id: 't1', after: 'c' })
  })

  it('nothing happens on the trailing row, on the inserted row, or without a focus', () => {
    expect(sheetReducer(focus(cell('t0', 'key')), { type: 'insertBelow' }, shape)).toEqual(
      focus(cell('t0', 'key')),
    )
    expect(sheetReducer(initialSheetState(), { type: 'insertBelow' }, shape)).toEqual(
      initialSheetState(),
    )
    const once = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    const grown = shapeOf(rows, columns, { trailingId: 't0', inserted: once.inserted })
    expect(sheetReducer(once, { type: 'insertBelow' }, grown)).toBe(once)
  })

  it('the row goes when the focus moves off it, and stays while the focus is on it', () => {
    const once = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    const grown = shapeOf(rows, columns, { trailingId: 't0', inserted: once.inserted })
    const right = sheetReducer(once, { type: 'move', dx: 1, dy: 0 }, grown)
    expect(right.inserted).not.toBeNull()
    const down = sheetReducer(once, { type: 'move', dx: 0, dy: 1 }, grown)
    expect(down.inserted).toBeNull()
    expect(down.active).toEqual(cell('b', 'key'))
    const up = sheetReducer(once, { type: 'move', dx: 0, dy: -1 }, grown)
    expect(up.inserted).toBeNull()
    expect(up.active).toEqual(cell('a', 'key'))
  })

  it('the row goes when the focus leaves the sheet, and when its row is gone', () => {
    const once = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    expect(sheetReducer(once, { type: 'leave' }, shape).inserted).toBeNull()
    const without = shapeOf([rowB, rowC], columns, { trailingId: 't0', inserted: once.inserted })
    const gone = sheetReducer(
      once,
      { type: 'rowsChanged', previousRowIds: ['a', 't1', 'b'] },
      without,
    )
    expect(gone.inserted).toBeNull()
  })

  it('a commit on the inserted row is an insert under its row, and the row keeps its id', () => {
    const once = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    const grown = shapeOf(rows, columns, { trailingId: 't0', inserted: once.inserted })
    const result = commitEdit({ ...once, mode: 'edit' }, grown, rows, columns, ' access ', 'stay')
    expect(result.batch?.changes).toEqual([
      { type: 'insert', row: 't1', cells: { key: 'access' }, after: 'a' },
    ])
    expect(result.state.inserted).toBeNull()
    expect(result.state.trailingId).toBe('t0')
    expect(result.state.active).toEqual(cell('t1', 'key'))
  })

  it('an empty commit on the inserted row gives no batch and the row stays until the focus leaves', () => {
    const once = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    const grown = shapeOf(rows, columns, { trailingId: 't0', inserted: once.inserted })
    const stay = commitEdit({ ...once, mode: 'edit' }, grown, rows, columns, '', 'stay')
    expect(stay.batch).toBeUndefined()
    expect(stay.state.inserted).not.toBeNull()
    const down = commitEdit({ ...once, mode: 'edit' }, grown, rows, columns, '', 'down')
    expect(down.batch).toBeUndefined()
    expect(down.state.inserted).toBeNull()
    expect(down.state.active).toEqual(cell('b', 'key'))
  })

  it('Cmd/Ctrl+Enter while editing: the text is committed and a new row opens under that row', () => {
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, 'B', 'insertBelow')
    expect(result.batch?.changes).toEqual([{ type: 'set', row: 'b', col: 'value', text: 'B' }])
    expect(result.state.inserted).toEqual({ id: 't1', after: 'b' })
    expect(result.state.active).toEqual(cell('t1', 'key'))
  })

  it('Cmd/Ctrl+Enter in the trailing row commits it and opens a row under the new row', () => {
    const result = commitEdit(
      editing(cell('t0', 'key')),
      shape,
      rows,
      columns,
      'access',
      'insertBelow',
    )
    expect(result.batch?.changes).toEqual([{ type: 'insert', row: 't0', cells: { key: 'access' } }])
    expect(result.state.trailingId).toBe('t1')
    expect(result.state.inserted).toEqual({ id: 't2', after: 't0' })
    expect(result.state.active).toEqual(cell('t2', 'key'))
  })
})

describe('sheetReducer: Cmd/Ctrl+click picks single rows', () => {
  it('a modifier click on another row adds it, and the rows so far stay selected', () => {
    const first = focus(cell('a', 'key'))
    const next = sheetReducer(first, { type: 'toggleRow', row: 'c', col: 'value' }, shape)
    expect(next.active).toEqual(cell('c', 'value'))
    expect(next.extraRows).toEqual(['a'])
    expect(selectedRowIds(next, shape)).toEqual(['a', 'c'])
  })

  it('a modifier click on a selected row takes it out', () => {
    const first = focus(cell('a', 'key'))
    const both = sheetReducer(first, { type: 'toggleRow', row: 'c', col: 'key' }, shape)
    const three = sheetReducer(both, { type: 'toggleRow', row: 'b', col: 'key' }, shape)
    expect(selectedRowIds(three, shape)).toEqual(['a', 'b', 'c'])
    const no = sheetReducer(three, { type: 'toggleRow', row: 'a', col: 'key' }, shape)
    expect(selectedRowIds(no, shape)).toEqual(['b', 'c'])
    const noActive = sheetReducer(no, { type: 'toggleRow', row: 'b', col: 'key' }, shape)
    expect(selectedRowIds(noActive, shape)).toEqual(['c'])
    expect(noActive.active?.row).toBe('c')
  })

  it('the only selected row cannot be taken out', () => {
    const first = focus(cell('a', 'key'))
    expect(sheetReducer(first, { type: 'toggleRow', row: 'a', col: 'key' }, shape)).toBe(first)
  })

  it('the trailing row and a row that is not there are not picked', () => {
    const first = focus(cell('a', 'key'))
    expect(sheetReducer(first, { type: 'toggleRow', row: 't0' }, shape)).toBe(first)
    expect(sheetReducer(first, { type: 'toggleRow', row: 'zz' }, shape)).toBe(first)
  })

  it('a range with extra rows: Shift keeps the rows picked before, a plain click starts over', () => {
    const picked = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'toggleRow', row: 'c', col: 'key' },
      shape,
    )
    expect(picked.extraRows).toEqual(['a'])
    // the range runs from the clicked row up to b: rows b and c, plus the extra row a
    const ranged = sheetReducer(
      picked,
      { type: 'activate', cell: cell('b', 'value'), extend: true },
      shape,
    )
    expect(ranged.extraRows).toEqual(['a'])
    expect(selectedRowIds(ranged, shape)).toEqual(['a', 'b', 'c'])
    const plain = sheetReducer(picked, { type: 'activate', cell: cell('b', 'value') }, shape)
    expect(plain.extraRows).toEqual([])
    expect(selectedRowIds(plain, shape)).toEqual(['b'])
  })

  it('a plain move, a row handle, Select all, Escape and an edit drop the extra rows', () => {
    const picked = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'toggleRow', row: 'c', col: 'key' },
      shape,
    )
    for (const action of [
      { type: 'move', dx: 0, dy: -1 },
      { type: 'selectRows', from: 'b' },
      { type: 'selectAll' },
      { type: 'collapse' },
      { type: 'startEdit', how: 'keep' },
    ] as const) {
      expect(sheetReducer(picked, action, shape).extraRows).toEqual([])
    }
  })

  it('a row that is gone leaves the selection', () => {
    const picked = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'toggleRow', row: 'c', col: 'key' },
      shape,
    )
    const without = shapeOf([rowB, rowC], columns, { trailingId: 't0' })
    const next = sheetReducer(
      picked,
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      without,
    )
    expect(next.extraRows).toEqual([])
  })

  it('selectedRowIds lists the rows in table order whatever the order of the picks', () => {
    const one = sheetReducer(
      focus(cell('c', 'key')),
      { type: 'toggleRow', row: 'a', col: 'key' },
      shape,
    )
    expect(selectedRowIds(one, shape)).toEqual(['a', 'c'])
  })

  it('Delete removes the picked rows and the rows of the range, in one batch', () => {
    const picked = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'toggleRow', row: 'c', col: 'key' },
      shape,
    )
    expect(clearSelection(picked, shape, rows, columns)).toEqual({
      cause: 'delete',
      changes: [
        { type: 'remove', row: 'a' },
        { type: 'remove', row: 'c' },
      ],
    })
  })

  it('Delete skips a read-only row', () => {
    const locked = row('l', 'ref', '1', { readOnly: true })
    const all = [rowA, locked, rowC]
    const grid = shapeOf(all, columns, { trailingId: 't0' })
    const picked = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'toggleRow', row: 'l', col: 'key' },
      grid,
    )
    expect(clearSelection(picked, grid, all, columns)?.changes).toEqual([
      { type: 'remove', row: 'a' },
    ])
    expect(removeRows(['l'], all)).toBeUndefined()
  })
})

describe('the pending row: a pasted row that is not data yet', () => {
  const open = (cells: Record<string, string>, from: SheetState = focus(cell('t0', 'key'))) =>
    sheetReducer(from, { type: 'openPending', at: 't0', cells, focus: 'key' }, shape)
  const shapeWith = (state: SheetState) =>
    shapeOf(rows, columns, { trailingId: 't0', pending: state.pending })

  it('opens in place of the trailing row, its cell in edit mode, before the trailing row', () => {
    const next = open({ key: 'highway', value: 'residential' })
    expect(next.pending).toEqual({
      id: 't1',
      after: null,
      cells: { key: 'highway', value: 'residential' },
    })
    expect(next.active).toEqual(cell('t1', 'key'))
    expect(next.mode).toBe('edit')
    expect(next.editStart).toBe('keep')
    expect(shapeWith(next).rowIds).toEqual(['a', 'b', 'c', 't1', 't0'])
  })

  it('opens in place of an inserted row, under its row; not on a row with data', () => {
    const inserted = sheetReducer(focus(cell('a', 'key')), { type: 'insertBelow' }, shape)
    const id = inserted.inserted?.id ?? ''
    const next = sheetReducer(
      inserted,
      { type: 'openPending', at: id, cells: { key: 'x' }, focus: 'key' },
      shapeOf(rows, columns, { trailingId: 't0', inserted: inserted.inserted }),
    )
    expect(next.inserted).toBeNull()
    expect(next.pending?.after).toBe('a')
    expect(shapeWith(next).rowIds).toEqual(['a', next.pending?.id ?? '', 'b', 'c', 't0'])
    const refused = sheetReducer(
      focus(cell('a', 'key')),
      { type: 'openPending', at: 'a', cells: { key: 'x' }, focus: 'key' },
      shape,
    )
    expect(refused.pending).toBeNull()
  })

  it('pendingProblem: a repeated row, a key on another row, an empty key, or none', () => {
    const pending = (cells: Record<string, string>) => ({ id: 'p', after: null, cells })
    expect(pendingProblem(pending({ key: 'highway', value: 'residential' }), rows, columns)).toBe(
      'This row repeats another row',
    )
    expect(pendingProblem(pending({ key: 'highway', value: 'primary' }), rows, columns)).toBe(
      'Key "highway" is already on another row',
    )
    expect(pendingProblem(pending({ value: 'x' }), rows, columns)).toBe('Key is empty')
    expect(pendingProblem(pending({ key: 'highway:ref', value: 'x' }), rows, columns)).toBe(
      undefined,
    )
    expect(pendingProblem(pending({}), rows, columns)).toBe(undefined)
  })

  it('an edit in it gives no batch; with a problem Enter keeps the focus on the cell', () => {
    const start = open({ key: 'highway', value: 'residential' })
    const result = commitEdit(start, shapeWith(start), rows, columns, ' highway ', 'down')
    expect(result.batch).toBeUndefined()
    expect(result.state.mode).toBe('navigate')
    expect(result.state.active).toEqual(cell('t1', 'key'))
    expect(result.state.pending?.cells.key).toBe('highway')
    expect(result.refused).toBeUndefined()
  })

  it('a fixed key lets Enter move on; the focus is off the row', () => {
    const start = open({ key: 'highway', value: 'residential' })
    const result = commitEdit(start, shapeWith(start), rows, columns, 'highway:note', 'down')
    expect(result.batch).toBeUndefined()
    expect(result.state.active).toEqual(cell('t0', 'key'))
    expect(result.state.pending?.cells.key).toBe('highway:note')
  })

  it('resolvePending: the row becomes one insert once the focus is off it', () => {
    const start = open({ key: 'highway', value: 'residential' })
    const moved = commitEdit(start, shapeWith(start), rows, columns, 'highway:note', 'down').state
    const result = resolvePending(moved, rows, columns)
    expect(result.state.pending).toBeNull()
    expect(result.batch).toEqual({
      cause: 'edit',
      changes: [
        { type: 'insert', row: 't1', cells: { key: 'highway:note', value: 'residential' } },
      ],
    })
    expect(result.dropped).toBeUndefined()
  })

  it('resolvePending: a row with a problem is dropped with the reason, an empty one without', () => {
    const start = open({ key: 'highway', value: 'residential' })
    const away = { ...start, mode: 'navigate' as const, active: cell('a', 'key') }
    const dropped = resolvePending(away, rows, columns)
    expect(dropped.state.pending).toBeNull()
    expect(dropped.batch).toBeUndefined()
    expect(dropped.dropped).toBe('This row repeats another row')
    const empty = resolvePending({ ...open({}), active: cell('a', 'key') }, rows, columns)
    expect(empty).toEqual({ state: { ...open({}), active: cell('a', 'key'), pending: null } })
  })

  it('resolvePending: nothing while the focus is on the row, unless the focus leaves the sheet', () => {
    const start = open({ key: 'highway', value: 'residential' })
    expect(resolvePending(start, rows, columns).state).toBe(start)
    expect(resolvePending(start, rows, columns, true).dropped).toBe('This row repeats another row')
  })

  it('is never a selected row, and a row above it that goes moves it to the end', () => {
    const start = open({ key: 'highway', value: 'x' })
    const all = sheetReducer(start, { type: 'selectAll' }, shapeWith(start))
    expect(selectedRowIds(all, shapeWith(all))).toEqual(['a', 'b', 'c'])
    const under = { ...start, pending: { id: 't1', after: 'b', cells: { key: 'x' } } }
    const fewer = [rowA, rowC]
    const next = sheetReducer(
      under,
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 't1', 'c', 't0'] },
      shapeOf(fewer, columns, { trailingId: 't0', pending: { ...under.pending, after: null } }),
    )
    expect(next.pending?.after).toBeNull()
  })
})
